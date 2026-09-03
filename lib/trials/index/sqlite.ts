import { mkdir } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { deduplicateTrials } from "../dedupe.ts";
import { rankTrials } from "../regions.ts";
import type { NormalizedTrial, RegistryName } from "../types.ts";
import { augmentCjkSearchText, classifySourceStatus, completedSyncTiming, deserializeTrial, newRunId, normalizedSearchTerms, searchableText, searchTermTokens, serializeTrial, sourceRegistryId, trackedRegistries, trialContentHash } from "./shared.ts";
import type { CommitStagedSourceInput, ReplaceSourceInput, TrialIndexHealth, TrialIndexRun, TrialIndexSearchInput, TrialIndexSearchResult, TrialIndexSourceState, TrialIndexStore } from "./types.ts";

const schema = `
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
CREATE TABLE IF NOT EXISTS trial_records (
  registry TEXT NOT NULL,
  registry_id TEXT NOT NULL,
  canonical_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  search_text TEXT NOT NULL,
  region_tier TEXT NOT NULL,
  recruitment_category TEXT NOT NULL,
  source_updated_at TEXT,
  indexed_at TEXT NOT NULL,
  last_run_id TEXT NOT NULL,
  PRIMARY KEY (registry, registry_id)
);
DROP INDEX IF EXISTS trial_records_search;
CREATE INDEX IF NOT EXISTS trial_records_canonical ON trial_records(canonical_id);
CREATE INDEX IF NOT EXISTS trial_records_filters ON trial_records(region_tier, recruitment_category);
CREATE VIRTUAL TABLE IF NOT EXISTS trial_records_fts_v2 USING fts5(
  search_text,
  region_tier UNINDEXED,
  recruitment_category UNINDEXED,
  source_updated_at UNINDEXED,
  tokenize='unicode61 remove_diacritics 2'
);
CREATE TRIGGER IF NOT EXISTS trial_records_fts_v2_insert AFTER INSERT ON trial_records BEGIN
  INSERT INTO trial_records_fts_v2(rowid, search_text, region_tier, recruitment_category, source_updated_at) VALUES (new.rowid, new.search_text, new.region_tier, new.recruitment_category, COALESCE(new.source_updated_at, ''));
END;
CREATE TRIGGER IF NOT EXISTS trial_records_fts_v2_delete AFTER DELETE ON trial_records BEGIN
  DELETE FROM trial_records_fts_v2 WHERE rowid=old.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trial_records_fts_v2_update AFTER UPDATE OF search_text, region_tier, recruitment_category, source_updated_at ON trial_records BEGIN
  DELETE FROM trial_records_fts_v2 WHERE rowid=old.rowid;
  INSERT INTO trial_records_fts_v2(rowid, search_text, region_tier, recruitment_category, source_updated_at) VALUES (new.rowid, new.search_text, new.region_tier, new.recruitment_category, COALESCE(new.source_updated_at, ''));
END;
CREATE TABLE IF NOT EXISTS index_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS trial_record_staging (
  run_id TEXT NOT NULL,
  registry TEXT NOT NULL,
  registry_id TEXT NOT NULL,
  canonical_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  search_text TEXT NOT NULL,
  region_tier TEXT NOT NULL,
  recruitment_category TEXT NOT NULL,
  source_updated_at TEXT,
  indexed_at TEXT NOT NULL,
  PRIMARY KEY (run_id, registry, registry_id)
);
CREATE TABLE IF NOT EXISTS source_state (
  registry TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  record_count INTEGER NOT NULL DEFAULT 0,
  changed_count INTEGER NOT NULL DEFAULT 0,
  removed_count INTEGER NOT NULL DEFAULT 0,
  source_version TEXT,
  last_attempt_at TEXT,
  last_success_at TEXT,
  duration_ms INTEGER,
  message TEXT
);
CREATE TABLE IF NOT EXISTS ingestion_runs (
  id TEXT PRIMARY KEY,
  registry TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  source_version TEXT,
  received_count INTEGER NOT NULL DEFAULT 0,
  changed_count INTEGER NOT NULL DEFAULT 0,
  removed_count INTEGER NOT NULL DEFAULT 0,
  message TEXT
);
CREATE INDEX IF NOT EXISTS ingestion_runs_started ON ingestion_runs(started_at DESC);
`;

type SqlValue = string | number | null;

function sourceFromRow(row: Record<string, SqlValue>): TrialIndexSourceState {
  const registry = String(row.registry) as RegistryName;
  const rawStatus = String(row.status) as TrialIndexSourceState["status"];
  return {
    registry,
    status: classifySourceStatus(row.last_success_at ? String(row.last_success_at) : undefined, registry, rawStatus),
    recordCount: Number(row.record_count),
    changedCount: Number(row.changed_count),
    removedCount: Number(row.removed_count),
    sourceVersion: row.source_version ? String(row.source_version) : undefined,
    lastAttemptAt: row.last_attempt_at ? String(row.last_attempt_at) : undefined,
    lastSuccessAt: row.last_success_at ? String(row.last_success_at) : undefined,
    durationMs: row.duration_ms === null ? undefined : Number(row.duration_ms),
    message: row.message ? String(row.message) : undefined,
  };
}

function runFromRow(row: Record<string, SqlValue>): TrialIndexRun {
  return {
    id: String(row.id), registry: String(row.registry) as RegistryName,
    status: String(row.status) as TrialIndexRun["status"], startedAt: String(row.started_at),
    finishedAt: row.finished_at ? String(row.finished_at) : undefined,
    sourceVersion: row.source_version ? String(row.source_version) : undefined,
    receivedCount: Number(row.received_count), changedCount: Number(row.changed_count), removedCount: Number(row.removed_count),
    message: row.message ? String(row.message) : undefined,
  };
}

export class SqliteTrialIndexStore implements TrialIndexStore {
  readonly backend = "sqlite" as const;
  private database?: DatabaseSync;
  private readonly databasePath: string;
  constructor(databasePath: string) { this.databasePath = databasePath; }

  async initialize() {
    if (this.database) return;
    await mkdir(path.dirname(this.databasePath), { recursive: true });
    this.database = new DatabaseSync(this.databasePath);
    this.database.function("augment_cjk_search_text", { deterministic: true }, (value) => augmentCjkSearchText(String(value ?? "")));
    this.database.exec(schema);
    const ftsVersion = this.database.prepare("SELECT value FROM index_metadata WHERE key='fts_schema_version'").get() as { value?: string } | undefined;
    if (ftsVersion?.value !== "3") {
      this.database.exec("BEGIN IMMEDIATE");
      try {
        this.database.exec("DELETE FROM trial_records_fts_v2");
        this.database.exec("INSERT INTO trial_records_fts_v2(rowid, search_text, region_tier, recruitment_category, source_updated_at) SELECT rowid, augment_cjk_search_text(search_text), region_tier, recruitment_category, COALESCE(source_updated_at, '') FROM trial_records");
        this.database.prepare("INSERT INTO index_metadata (key, value) VALUES ('fts_schema_version', '3') ON CONFLICT(key) DO UPDATE SET value=excluded.value").run();
        this.database.exec("DROP TRIGGER IF EXISTS trial_records_fts_insert; DROP TRIGGER IF EXISTS trial_records_fts_delete; DROP TRIGGER IF EXISTS trial_records_fts_update");
        this.database.exec("COMMIT");
      } catch (error) {
        this.database.exec("ROLLBACK");
        throw error;
      }
    }
    const insert = this.database.prepare("INSERT OR IGNORE INTO source_state (registry, status) VALUES (?, 'never_synced')");
    for (const registry of trackedRegistries) insert.run(registry);
  }

  private db() {
    if (!this.database) throw new Error("Trial index was not initialized");
    return this.database;
  }

  async markSyncing(registry: RegistryName, startedAt: string) {
    await this.initialize();
    const runId = newRunId(registry);
    this.db().prepare("INSERT INTO ingestion_runs (id, registry, status, started_at) VALUES (?, ?, 'running', ?)").run(runId, registry, startedAt);
    this.db().prepare("UPDATE source_state SET status='syncing', last_attempt_at=?, message=NULL WHERE registry=?").run(startedAt, registry);
    return runId;
  }

  async replaceSource(input: ReplaceSourceInput) {
    await this.initialize();
    const db = this.db();
    const running = db.prepare("SELECT id FROM ingestion_runs WHERE registry=? AND status='running' ORDER BY started_at DESC LIMIT 1").get(input.registry) as { id?: string } | undefined;
    const runId = running?.id ?? newRunId(input.registry);
    if (!running?.id) db.prepare("INSERT INTO ingestion_runs (id, registry, status, started_at) VALUES (?, ?, 'running', ?)").run(runId, input.registry, input.startedAt);
    const existing = new Map((db.prepare("SELECT registry_id, content_hash FROM trial_records WHERE registry=?").all(input.registry) as Array<{ registry_id: string; content_hash: string }>).map((row) => [row.registry_id, row.content_hash]));
    const upsert = db.prepare(`INSERT INTO trial_records (registry, registry_id, canonical_id, payload_json, content_hash, search_text, region_tier, recruitment_category, source_updated_at, indexed_at, last_run_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(registry, registry_id) DO UPDATE SET canonical_id=excluded.canonical_id, payload_json=excluded.payload_json, content_hash=excluded.content_hash, search_text=excluded.search_text, region_tier=excluded.region_tier, recruitment_category=excluded.recruitment_category, source_updated_at=excluded.source_updated_at, indexed_at=excluded.indexed_at, last_run_id=excluded.last_run_id`);
    let changedCount = 0;
    db.exec("BEGIN IMMEDIATE");
    try {
      for (const trial of input.trials) {
        const payload = serializeTrial(trial);
        const digest = trialContentHash(trial);
        const registryId = sourceRegistryId(trial, input.registry);
        if (existing.get(registryId) !== digest) changedCount += 1;
        const sourceUpdated = trial.sources.find((source) => source.registry === input.registry)?.lastUpdated ?? null;
        upsert.run(input.registry, registryId, trial.canonicalId, payload, digest, searchableText(trial), trial.regionTier, trial.recruitment.category, sourceUpdated, input.finishedAt, runId);
      }
      const removed = Number((db.prepare("SELECT COUNT(*) AS count FROM trial_records WHERE registry=? AND last_run_id<>?").get(input.registry, runId) as { count: number }).count);
      db.prepare("DELETE FROM trial_records WHERE registry=? AND last_run_id<>?").run(input.registry, runId);
      const storedCount = Number((db.prepare("SELECT COUNT(*) AS count FROM trial_records WHERE registry=?").get(input.registry) as { count: number }).count);
      db.prepare(`UPDATE source_state SET status='ready', record_count=?, changed_count=?, removed_count=?, source_version=?, last_attempt_at=?, last_success_at=?, duration_ms=?, message=NULL WHERE registry=?`)
        .run(storedCount, changedCount, removed, input.sourceVersion ?? null, input.finishedAt, input.finishedAt, input.durationMs, input.registry);
      db.prepare(`UPDATE ingestion_runs SET status='succeeded', finished_at=?, source_version=?, received_count=?, changed_count=?, removed_count=? WHERE id=?`)
        .run(input.finishedAt, input.sourceVersion ?? null, input.trials.length, changedCount, removed, runId);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return (await this.sourceState(input.registry))!;
  }

  async stageSourceBatch(registry: RegistryName, runId: string, trials: NormalizedTrial[], indexedAt: string) {
    await this.initialize();
    const statement = this.db().prepare(`INSERT INTO trial_record_staging (run_id, registry, registry_id, canonical_id, payload_json, content_hash, search_text, region_tier, recruitment_category, source_updated_at, indexed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(run_id, registry, registry_id) DO UPDATE SET canonical_id=excluded.canonical_id, payload_json=excluded.payload_json, content_hash=excluded.content_hash, search_text=excluded.search_text, region_tier=excluded.region_tier, recruitment_category=excluded.recruitment_category, source_updated_at=excluded.source_updated_at, indexed_at=excluded.indexed_at`);
    const db = this.db();
    db.exec("BEGIN IMMEDIATE");
    try {
      for (const trial of trials) {
        const payload = serializeTrial(trial);
        statement.run(runId, registry, sourceRegistryId(trial, registry), trial.canonicalId, payload, trialContentHash(trial), searchableText(trial), trial.regionTier, trial.recruitment.category, trial.sources.find((source) => source.registry === registry)?.lastUpdated ?? null, indexedAt);
      }
      db.exec("COMMIT");
    } catch (error) { db.exec("ROLLBACK"); throw error; }
  }

  async commitStagedSource(input: CommitStagedSourceInput) {
    await this.initialize();
    const db = this.db();
    db.exec("BEGIN IMMEDIATE");
    try {
      const changedCount = Number((db.prepare(`SELECT COUNT(*) AS count FROM trial_record_staging s LEFT JOIN trial_records r ON r.registry=s.registry AND r.registry_id=s.registry_id WHERE s.run_id=? AND (r.content_hash IS NULL OR r.content_hash<>s.content_hash)`).get(input.runId) as { count: number }).count);
      const removedCount = Number((db.prepare(`SELECT COUNT(*) AS count FROM trial_records r WHERE r.registry=? AND NOT EXISTS (SELECT 1 FROM trial_record_staging s WHERE s.run_id=? AND s.registry=r.registry AND s.registry_id=r.registry_id)`).get(input.registry, input.runId) as { count: number }).count);
      db.prepare(`INSERT INTO trial_records (registry, registry_id, canonical_id, payload_json, content_hash, search_text, region_tier, recruitment_category, source_updated_at, indexed_at, last_run_id)
        SELECT registry, registry_id, canonical_id, payload_json, content_hash, search_text, region_tier, recruitment_category, source_updated_at, indexed_at, run_id FROM trial_record_staging WHERE run_id=?
        ON CONFLICT(registry, registry_id) DO UPDATE SET canonical_id=excluded.canonical_id, payload_json=excluded.payload_json, content_hash=excluded.content_hash, search_text=excluded.search_text, region_tier=excluded.region_tier, recruitment_category=excluded.recruitment_category, source_updated_at=excluded.source_updated_at, indexed_at=excluded.indexed_at, last_run_id=excluded.last_run_id`).run(input.runId);
      db.prepare("DELETE FROM trial_records WHERE registry=? AND last_run_id<>?").run(input.registry, input.runId);
      const storedCount = Number((db.prepare("SELECT COUNT(*) AS count FROM trial_records WHERE registry=?").get(input.registry) as { count: number }).count);
      db.prepare("DELETE FROM trial_record_staging WHERE run_id=?").run(input.runId);
      const completion = completedSyncTiming(input.startedAt);
      db.prepare(`UPDATE source_state SET status='ready', record_count=?, changed_count=?, removed_count=?, source_version=?, last_attempt_at=?, last_success_at=?, duration_ms=?, message=NULL WHERE registry=?`).run(storedCount, changedCount, removedCount, input.sourceVersion ?? null, completion.finishedAt, completion.finishedAt, completion.durationMs, input.registry);
      db.prepare(`UPDATE ingestion_runs SET status='succeeded', finished_at=?, source_version=?, received_count=?, changed_count=?, removed_count=? WHERE id=?`).run(completion.finishedAt, input.sourceVersion ?? null, input.receivedCount, changedCount, removedCount, input.runId);
      db.exec("COMMIT");
    } catch (error) { db.exec("ROLLBACK"); throw error; }
    return (await this.sourceState(input.registry))!;
  }

  async commitStagedIncrementalSource(input: CommitStagedSourceInput) {
    await this.initialize();
    const db = this.db();
    db.exec("BEGIN IMMEDIATE");
    try {
      const changedCount = Number((db.prepare(`SELECT COUNT(*) AS count FROM trial_record_staging s LEFT JOIN trial_records r ON r.registry=s.registry AND r.registry_id=s.registry_id WHERE s.run_id=? AND (r.content_hash IS NULL OR r.content_hash<>s.content_hash)`).get(input.runId) as { count: number }).count);
      db.prepare(`INSERT INTO trial_records (registry, registry_id, canonical_id, payload_json, content_hash, search_text, region_tier, recruitment_category, source_updated_at, indexed_at, last_run_id)
        SELECT registry, registry_id, canonical_id, payload_json, content_hash, search_text, region_tier, recruitment_category, source_updated_at, indexed_at, run_id FROM trial_record_staging WHERE run_id=?
        ON CONFLICT(registry, registry_id) DO UPDATE SET canonical_id=excluded.canonical_id, payload_json=excluded.payload_json, content_hash=excluded.content_hash, search_text=excluded.search_text, region_tier=excluded.region_tier, recruitment_category=excluded.recruitment_category, source_updated_at=excluded.source_updated_at, indexed_at=excluded.indexed_at, last_run_id=excluded.last_run_id`).run(input.runId);
      const storedCount = Number((db.prepare("SELECT COUNT(*) AS count FROM trial_records WHERE registry=?").get(input.registry) as { count: number }).count);
      db.prepare("DELETE FROM trial_record_staging WHERE run_id=?").run(input.runId);
      const completion = completedSyncTiming(input.startedAt);
      db.prepare(`UPDATE source_state SET status='ready', record_count=?, changed_count=?, removed_count=0, source_version=?, last_attempt_at=?, last_success_at=?, duration_ms=?, message='Incremental refresh; removals are reconciled by the scheduled full refresh.' WHERE registry=?`).run(storedCount, changedCount, input.sourceVersion ?? null, completion.finishedAt, completion.finishedAt, completion.durationMs, input.registry);
      db.prepare(`UPDATE ingestion_runs SET status='succeeded', finished_at=?, source_version=?, received_count=?, changed_count=?, removed_count=0, message='incremental' WHERE id=?`).run(completion.finishedAt, input.sourceVersion ?? null, input.receivedCount, changedCount, input.runId);
      db.exec("COMMIT");
    } catch (error) { db.exec("ROLLBACK"); throw error; }
    return (await this.sourceState(input.registry))!;
  }

  async markFailure(registry: RegistryName, runId: string, _startedAt: string, finishedAt: string, durationMs: number, message: string) {
    await this.initialize();
    const db = this.db();
    db.prepare("UPDATE ingestion_runs SET status='failed', finished_at=?, message=? WHERE id=?").run(finishedAt, message, runId);
    db.prepare("UPDATE source_state SET status='failed', last_attempt_at=?, duration_ms=?, message=? WHERE registry=?").run(finishedAt, durationMs, message, registry);
    db.prepare("DELETE FROM trial_record_staging WHERE run_id=?").run(runId);
  }

  async markSkipped(registry: RegistryName, startedAt: string, sourceVersion: string, message: string) {
    await this.initialize();
    const runId = newRunId(registry);
    this.db().prepare("INSERT INTO ingestion_runs (id, registry, status, started_at, finished_at, source_version, message) VALUES (?, ?, 'skipped', ?, ?, ?, ?)").run(runId, registry, startedAt, startedAt, sourceVersion, message);
    this.db().prepare("UPDATE source_state SET status='ready', last_attempt_at=?, source_version=?, message=? WHERE registry=?").run(startedAt, sourceVersion, message, registry);
  }

  async sourceState(registry: RegistryName) {
    await this.initialize();
    const row = this.db().prepare("SELECT * FROM source_state WHERE registry=?").get(registry) as Record<string, SqlValue> | undefined;
    return row ? sourceFromRow(row) : undefined;
  }

  async search(input: TrialIndexSearchInput): Promise<TrialIndexSearchResult> {
    await this.initialize();
    const terms = normalizedSearchTerms(input.terms);
    const ftsQuery = terms.map((term) => searchTermTokens(term).map((token) => `"${token}"*`).join(" AND ")).filter(Boolean).map((group) => `(${group})`).join(" OR ");
    const limit = Math.max(input.pageSize * 4, input.pageSize);
    const rows = (ftsQuery
      ? this.db().prepare(`SELECT r.payload_json FROM (SELECT rowid, region_tier, recruitment_category, source_updated_at FROM trial_records_fts_v2 WHERE trial_records_fts_v2 MATCH ? ORDER BY CASE region_tier WHEN 'taiwan' THEN 0 WHEN 'asia' THEN 1 WHEN 'world' THEN 2 ELSE 3 END, CASE recruitment_category WHEN 'open' THEN 0 WHEN 'opening_soon' THEN 1 WHEN 'invitation_only' THEN 2 ELSE 3 END, source_updated_at DESC LIMIT ?) AS matches JOIN trial_records r ON r.rowid=matches.rowid ORDER BY CASE matches.region_tier WHEN 'taiwan' THEN 0 WHEN 'asia' THEN 1 WHEN 'world' THEN 2 ELSE 3 END, CASE matches.recruitment_category WHEN 'open' THEN 0 WHEN 'opening_soon' THEN 1 WHEN 'invitation_only' THEN 2 ELSE 3 END, matches.source_updated_at DESC`).all(ftsQuery, limit)
      : this.db().prepare(`SELECT payload_json FROM trial_records ORDER BY source_updated_at DESC LIMIT ?`).all(limit)) as Array<{ payload_json: string }>;
    const trials = rankTrials(deduplicateTrials(rows.map((row) => deserializeTrial(row.payload_json))))
      .filter((trial) => input.includeNotOpen || trial.recruitment.acceptingNewParticipants)
      .slice(0, input.pageSize);
    const sources = (await Promise.all(trackedRegistries.map((registry) => this.sourceState(registry)))).filter((state): state is TrialIndexSourceState => Boolean(state));
    return { trials, sources, searchedAt: new Date().toISOString(), backend: this.backend };
  }

  async getByCanonicalId(canonicalId: string) {
    await this.initialize();
    const rows = this.db().prepare("SELECT payload_json FROM trial_records WHERE canonical_id=? OR lower(registry || ':' || registry_id)=lower(?)").all(canonicalId, canonicalId) as Array<{ payload_json: string }>;
    const trials = rows.map((row) => deserializeTrial(row.payload_json));
    return trials.length ? deduplicateTrials(trials)[0] : undefined;
  }

  async health(): Promise<TrialIndexHealth> {
    await this.initialize();
    const db = this.db();
    const sources = (db.prepare("SELECT * FROM source_state ORDER BY registry").all() as Array<Record<string, SqlValue>>).map(sourceFromRow);
    const recentRuns = (db.prepare("SELECT * FROM ingestion_runs ORDER BY started_at DESC LIMIT 8").all() as Array<Record<string, SqlValue>>).map(runFromRow);
    const totalRecords = Number((db.prepare("SELECT COUNT(*) AS count FROM trial_records").get() as { count: number }).count);
    const readyCount = sources.filter((source) => source.status === "ready").length;
    const status = totalRecords === 0 ? "empty" : sources.some((source) => source.status === "failed") ? "degraded" : readyCount === trackedRegistries.length ? "ready" : "partial";
    const lastSuccessfulSyncAt = sources.map((source) => source.lastSuccessAt).filter((value): value is string => Boolean(value)).sort().at(-1);
    return { enabled: true, backend: this.backend, storage: this.backend, containsPatientData: false, status, totalRecords, lastSuccessfulSyncAt, sources, recentRuns };
  }

  async close() {
    this.database?.close();
    this.database = undefined;
  }
}
