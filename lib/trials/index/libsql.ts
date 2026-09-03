import type { Client, InValue, Transaction } from "@libsql/client";
import { deduplicateTrials } from "../dedupe.ts";
import { rankTrials } from "../regions.ts";
import type { NormalizedTrial, RegistryName } from "../types.ts";
import { classifySourceStatus, completedSyncTiming, deserializeTrial, newRunId, normalizedSearchTerms, searchableText, searchTermTokens, serializeTrial, sourceRegistryId, trackedRegistries, trialContentHash } from "./shared.ts";
import type { CommitStagedSourceInput, ReplaceSourceInput, TrialIndexHealth, TrialIndexRun, TrialIndexSearchInput, TrialIndexSearchResult, TrialIndexSourceState, TrialIndexStore } from "./types.ts";

/**
 * libSQL / Turso backend.
 *
 * Same tables, FTS5 index, and staging flow as the `node:sqlite` store, but
 * driven through the asynchronous `@libsql/client`, which speaks to a local
 * `file:` database (development, tests) or a remote `libsql://` database
 * (Turso) over HTTPS. Serverless functions can therefore query a multi-GB
 * public index without bundling a database file or a native driver.
 *
 * Differences from the SQLite store that matter:
 * - No custom SQL functions exist on a remote server, so the v3 FTS migration
 *   is never run here. A populated database must already be at FTS schema
 *   version 3 (open it once with the sqlite backend locally to migrate).
 * - `initialize()` memoizes its in-flight promise, so concurrent cold-start
 *   requests share one schema check.
 * - `health()` reads record counts from `source_state` instead of counting a
 *   multi-GB table on every request.
 * - The recruitment filter is pushed into SQL, so a Taiwan-first ordering can
 *   no longer fill the candidate window with closed records and return nothing.
 * - Read-only mode (used by web functions with a read-only token) skips every
 *   write, including schema creation.
 */

export const libsqlFtsSchemaVersion = "3";

const schema = `
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
CREATE INDEX IF NOT EXISTS trial_records_canonical ON trial_records(canonical_id);
CREATE INDEX IF NOT EXISTS trial_records_filters ON trial_records(region_tier, recruitment_category);
CREATE INDEX IF NOT EXISTS trial_records_updated ON trial_records(source_updated_at DESC);
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

/** Categories that can still admit participants; the exact boolean is re-checked in JS. */
const acceptingCategories = ["open", "opening_soon", "invitation_only"] as const;
const acceptingCategorySql = acceptingCategories.map((category) => `'${category}'`).join(", ");
const rankOrderSql = "CASE region_tier WHEN 'taiwan' THEN 0 WHEN 'asia' THEN 1 WHEN 'world' THEN 2 ELSE 3 END, CASE recruitment_category WHEN 'open' THEN 0 WHEN 'opening_soon' THEN 1 WHEN 'invitation_only' THEN 2 ELSE 3 END, source_updated_at DESC";

type Row = Record<string, InValue | bigint | ArrayBuffer | undefined>;

function text(value: Row[string]): string | undefined {
  if (value === null || value === undefined) return undefined;
  return String(value);
}

function integer(value: Row[string]): number {
  if (value === null || value === undefined) return 0;
  return Number(value);
}

function sourceFromRow(row: Row): TrialIndexSourceState {
  const registry = String(row.registry) as RegistryName;
  const rawStatus = String(row.status) as TrialIndexSourceState["status"];
  return {
    registry,
    status: classifySourceStatus(text(row.last_success_at), registry, rawStatus),
    recordCount: integer(row.record_count),
    changedCount: integer(row.changed_count),
    removedCount: integer(row.removed_count),
    sourceVersion: text(row.source_version),
    lastAttemptAt: text(row.last_attempt_at),
    lastSuccessAt: text(row.last_success_at),
    durationMs: row.duration_ms === null || row.duration_ms === undefined ? undefined : Number(row.duration_ms),
    message: text(row.message),
  };
}

function runFromRow(row: Row): TrialIndexRun {
  return {
    id: String(row.id), registry: String(row.registry) as RegistryName,
    status: String(row.status) as TrialIndexRun["status"], startedAt: String(row.started_at),
    finishedAt: text(row.finished_at),
    sourceVersion: text(row.source_version),
    receivedCount: integer(row.received_count), changedCount: integer(row.changed_count), removedCount: integer(row.removed_count),
    message: text(row.message),
  };
}

function recordArguments(trial: NormalizedTrial, registry: RegistryName, indexedAt: string) {
  return [
    registry,
    sourceRegistryId(trial, registry),
    trial.canonicalId,
    serializeTrial(trial),
    trialContentHash(trial),
    searchableText(trial),
    trial.regionTier,
    trial.recruitment.category,
    trial.sources.find((source) => source.registry === registry)?.lastUpdated ?? null,
    indexedAt,
  ] as InValue[];
}

const upsertRecordSql = `INSERT INTO trial_records (registry, registry_id, canonical_id, payload_json, content_hash, search_text, region_tier, recruitment_category, source_updated_at, indexed_at, last_run_id)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(registry, registry_id) DO UPDATE SET canonical_id=excluded.canonical_id, payload_json=excluded.payload_json, content_hash=excluded.content_hash, search_text=excluded.search_text, region_tier=excluded.region_tier, recruitment_category=excluded.recruitment_category, source_updated_at=excluded.source_updated_at, indexed_at=excluded.indexed_at, last_run_id=excluded.last_run_id`;

const publishStagedSql = `INSERT INTO trial_records (registry, registry_id, canonical_id, payload_json, content_hash, search_text, region_tier, recruitment_category, source_updated_at, indexed_at, last_run_id)
  SELECT registry, registry_id, canonical_id, payload_json, content_hash, search_text, region_tier, recruitment_category, source_updated_at, indexed_at, run_id FROM trial_record_staging WHERE run_id=?
  ON CONFLICT(registry, registry_id) DO UPDATE SET canonical_id=excluded.canonical_id, payload_json=excluded.payload_json, content_hash=excluded.content_hash, search_text=excluded.search_text, region_tier=excluded.region_tier, recruitment_category=excluded.recruitment_category, source_updated_at=excluded.source_updated_at, indexed_at=excluded.indexed_at, last_run_id=excluded.last_run_id`;

const stagedChangedCountSql = `SELECT COUNT(*) AS count FROM trial_record_staging s LEFT JOIN trial_records r ON r.registry=s.registry AND r.registry_id=s.registry_id WHERE s.run_id=? AND (r.content_hash IS NULL OR r.content_hash<>s.content_hash)`;

export interface LibsqlTrialIndexOptions {
  /** `file:/abs/path.db`, `file::memory:`, or `libsql://name-org.turso.io`. */
  url: string;
  authToken?: string;
  /** Skip every write, including schema creation; for web functions with a read-only token. */
  readOnly?: boolean;
}

export class LibsqlTrialIndexStore implements TrialIndexStore {
  readonly backend = "libsql" as const;
  private readonly url: string;
  private readonly authToken?: string;
  private readonly readOnly: boolean;
  private clientInstance?: Client;
  private initialization?: Promise<void>;

  constructor(options: LibsqlTrialIndexOptions) {
    const url = options.url.trim();
    if (!/^(file:|libsql:\/\/|https:\/\/|wss:\/\/|ws:\/\/|http:\/\/)/u.test(url)) throw new Error("TRIAL_INDEX_LIBSQL_URL must be a file:, libsql://, https://, or ws(s):// URL");
    if (/^http:\/\//u.test(url) && !/^http:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/u.test(url)) throw new Error("A plain http:// libSQL URL is only allowed for a loopback development server");
    this.url = url;
    this.authToken = options.authToken?.trim() || undefined;
    this.readOnly = options.readOnly ?? false;
  }

  get isLocalFile() {
    return this.url.startsWith("file:");
  }

  private async client(): Promise<Client> {
    if (this.clientInstance) return this.clientInstance;
    if (this.isLocalFile) {
      // Native driver: only loaded for local files, never bundled for web functions.
      const { createClient } = await import("@libsql/client");
      this.clientInstance = createClient({ url: this.url });
    } else {
      // Pure fetch client for remote databases; safe in Node, Deno, and edge runtimes.
      const { createClient } = await import("@libsql/client/web");
      this.clientInstance = createClient({ url: this.url, authToken: this.authToken });
    }
    return this.clientInstance;
  }

  async initialize() {
    this.initialization ??= this.initializeOnce().catch((error) => {
      this.initialization = undefined;
      throw error;
    });
    return this.initialization;
  }

  private async initializeOnce() {
    const client = await this.client();
    if (this.isLocalFile && !this.readOnly) await client.executeMultiple("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;");
    if (this.readOnly) {
      const table = await client.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='trial_records'");
      if (table.rows.length === 0) throw new Error("The read-only trial index has no schema; upload a populated database first.");
    } else {
      await client.executeMultiple(schema);
    }
    const version = (await client.execute("SELECT value FROM index_metadata WHERE key='fts_schema_version'")).rows[0]?.value;
    if (version !== libsqlFtsSchemaVersion) {
      const populated = integer((await client.execute("SELECT COUNT(*) AS count FROM trial_records LIMIT 1")).rows[0]?.count) > 0;
      if (populated) throw new Error(`Trial index FTS schema is not version ${libsqlFtsSchemaVersion}; open it once with the sqlite backend locally to migrate before using libsql.`);
      if (!this.readOnly) await client.execute({ sql: "INSERT INTO index_metadata (key, value) VALUES ('fts_schema_version', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", args: [libsqlFtsSchemaVersion] });
    }
    if (!this.readOnly) {
      for (const registry of trackedRegistries) await client.execute({ sql: "INSERT OR IGNORE INTO source_state (registry, status) VALUES (?, 'never_synced')", args: [registry] });
    }
  }

  private assertWritable() {
    if (this.readOnly) throw new Error("The trial index is read-only in this deployment");
  }

  private async withWriteTransaction<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    this.assertWritable();
    const tx = await (await this.client()).transaction("write");
    try {
      const result = await work(tx);
      await tx.commit();
      return result;
    } catch (error) {
      try { await tx.rollback(); } catch { /* the transaction is already closed */ }
      throw error;
    } finally {
      tx.close();
    }
  }

  async markSyncing(registry: RegistryName, startedAt: string) {
    await this.initialize();
    const runId = newRunId(registry);
    await this.withWriteTransaction(async (tx) => {
      await tx.execute({ sql: "INSERT INTO ingestion_runs (id, registry, status, started_at) VALUES (?, ?, 'running', ?)", args: [runId, registry, startedAt] });
      await tx.execute({ sql: "UPDATE source_state SET status='syncing', last_attempt_at=?, message=NULL WHERE registry=?", args: [startedAt, registry] });
    });
    return runId;
  }

  async replaceSource(input: ReplaceSourceInput) {
    await this.initialize();
    await this.withWriteTransaction(async (tx) => {
      const running = (await tx.execute({ sql: "SELECT id FROM ingestion_runs WHERE registry=? AND status='running' ORDER BY started_at DESC LIMIT 1", args: [input.registry] })).rows[0];
      const runId = running?.id ? String(running.id) : newRunId(input.registry);
      if (!running?.id) await tx.execute({ sql: "INSERT INTO ingestion_runs (id, registry, status, started_at) VALUES (?, ?, 'running', ?)", args: [runId, input.registry, input.startedAt] });
      const existing = new Map((await tx.execute({ sql: "SELECT registry_id, content_hash FROM trial_records WHERE registry=?", args: [input.registry] })).rows.map((row) => [String(row.registry_id), String(row.content_hash)]));
      let changedCount = 0;
      for (const trial of input.trials) {
        const args = recordArguments(trial, input.registry, input.finishedAt);
        if (existing.get(String(args[1])) !== String(args[4])) changedCount += 1;
        await tx.execute({ sql: upsertRecordSql, args: [...args, runId] });
      }
      const removed = integer((await tx.execute({ sql: "SELECT COUNT(*) AS count FROM trial_records WHERE registry=? AND last_run_id<>?", args: [input.registry, runId] })).rows[0]?.count);
      await tx.execute({ sql: "DELETE FROM trial_records WHERE registry=? AND last_run_id<>?", args: [input.registry, runId] });
      const storedCount = integer((await tx.execute({ sql: "SELECT COUNT(*) AS count FROM trial_records WHERE registry=?", args: [input.registry] })).rows[0]?.count);
      await tx.execute({ sql: "UPDATE source_state SET status='ready', record_count=?, changed_count=?, removed_count=?, source_version=?, last_attempt_at=?, last_success_at=?, duration_ms=?, message=NULL WHERE registry=?", args: [storedCount, changedCount, removed, input.sourceVersion ?? null, input.finishedAt, input.finishedAt, input.durationMs, input.registry] });
      await tx.execute({ sql: "UPDATE ingestion_runs SET status='succeeded', finished_at=?, source_version=?, received_count=?, changed_count=?, removed_count=? WHERE id=?", args: [input.finishedAt, input.sourceVersion ?? null, input.trials.length, changedCount, removed, runId] });
    });
    return (await this.sourceState(input.registry))!;
  }

  async stageSourceBatch(registry: RegistryName, runId: string, trials: NormalizedTrial[], indexedAt: string) {
    await this.initialize();
    if (trials.length === 0) return;
    this.assertWritable();
    const sql = `INSERT INTO trial_record_staging (run_id, registry, registry_id, canonical_id, payload_json, content_hash, search_text, region_tier, recruitment_category, source_updated_at, indexed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(run_id, registry, registry_id) DO UPDATE SET canonical_id=excluded.canonical_id, payload_json=excluded.payload_json, content_hash=excluded.content_hash, search_text=excluded.search_text, region_tier=excluded.region_tier, recruitment_category=excluded.recruitment_category, source_updated_at=excluded.source_updated_at, indexed_at=excluded.indexed_at`;
    // One atomic batch per page keeps a partially uploaded page out of staging.
    await (await this.client()).batch(trials.map((trial) => ({ sql, args: [runId, ...recordArguments(trial, registry, indexedAt)] })), "write");
  }

  async commitStagedSource(input: CommitStagedSourceInput) {
    await this.initialize();
    await this.withWriteTransaction(async (tx) => {
      const changedCount = integer((await tx.execute({ sql: stagedChangedCountSql, args: [input.runId] })).rows[0]?.count);
      const removedCount = integer((await tx.execute({ sql: "SELECT COUNT(*) AS count FROM trial_records r WHERE r.registry=? AND NOT EXISTS (SELECT 1 FROM trial_record_staging s WHERE s.run_id=? AND s.registry=r.registry AND s.registry_id=r.registry_id)", args: [input.registry, input.runId] })).rows[0]?.count);
      await tx.execute({ sql: publishStagedSql, args: [input.runId] });
      await tx.execute({ sql: "DELETE FROM trial_records WHERE registry=? AND last_run_id<>?", args: [input.registry, input.runId] });
      const storedCount = integer((await tx.execute({ sql: "SELECT COUNT(*) AS count FROM trial_records WHERE registry=?", args: [input.registry] })).rows[0]?.count);
      await tx.execute({ sql: "DELETE FROM trial_record_staging WHERE run_id=?", args: [input.runId] });
      const completion = completedSyncTiming(input.startedAt);
      await tx.execute({ sql: "UPDATE source_state SET status='ready', record_count=?, changed_count=?, removed_count=?, source_version=?, last_attempt_at=?, last_success_at=?, duration_ms=?, message=NULL WHERE registry=?", args: [storedCount, changedCount, removedCount, input.sourceVersion ?? null, completion.finishedAt, completion.finishedAt, completion.durationMs, input.registry] });
      await tx.execute({ sql: "UPDATE ingestion_runs SET status='succeeded', finished_at=?, source_version=?, received_count=?, changed_count=?, removed_count=? WHERE id=?", args: [completion.finishedAt, input.sourceVersion ?? null, input.receivedCount, changedCount, removedCount, input.runId] });
    });
    return (await this.sourceState(input.registry))!;
  }

  async commitStagedIncrementalSource(input: CommitStagedSourceInput) {
    await this.initialize();
    await this.withWriteTransaction(async (tx) => {
      const changedCount = integer((await tx.execute({ sql: stagedChangedCountSql, args: [input.runId] })).rows[0]?.count);
      await tx.execute({ sql: publishStagedSql, args: [input.runId] });
      const storedCount = integer((await tx.execute({ sql: "SELECT COUNT(*) AS count FROM trial_records WHERE registry=?", args: [input.registry] })).rows[0]?.count);
      await tx.execute({ sql: "DELETE FROM trial_record_staging WHERE run_id=?", args: [input.runId] });
      const completion = completedSyncTiming(input.startedAt);
      await tx.execute({ sql: "UPDATE source_state SET status='ready', record_count=?, changed_count=?, removed_count=0, source_version=?, last_attempt_at=?, last_success_at=?, duration_ms=?, message='Incremental refresh; removals are reconciled by the scheduled full refresh.' WHERE registry=?", args: [storedCount, changedCount, input.sourceVersion ?? null, completion.finishedAt, completion.finishedAt, completion.durationMs, input.registry] });
      await tx.execute({ sql: "UPDATE ingestion_runs SET status='succeeded', finished_at=?, source_version=?, received_count=?, changed_count=?, removed_count=0, message='incremental' WHERE id=?", args: [completion.finishedAt, input.sourceVersion ?? null, input.receivedCount, changedCount, input.runId] });
    });
    return (await this.sourceState(input.registry))!;
  }

  async markFailure(registry: RegistryName, runId: string, _startedAt: string, finishedAt: string, durationMs: number, message: string) {
    await this.initialize();
    await this.withWriteTransaction(async (tx) => {
      await tx.execute({ sql: "UPDATE ingestion_runs SET status='failed', finished_at=?, message=? WHERE id=?", args: [finishedAt, message, runId] });
      await tx.execute({ sql: "UPDATE source_state SET status='failed', last_attempt_at=?, duration_ms=?, message=? WHERE registry=?", args: [finishedAt, durationMs, message, registry] });
      await tx.execute({ sql: "DELETE FROM trial_record_staging WHERE run_id=?", args: [runId] });
    });
  }

  async markSkipped(registry: RegistryName, startedAt: string, sourceVersion: string, message: string) {
    await this.initialize();
    const runId = newRunId(registry);
    await this.withWriteTransaction(async (tx) => {
      await tx.execute({ sql: "INSERT INTO ingestion_runs (id, registry, status, started_at, finished_at, source_version, message) VALUES (?, ?, 'skipped', ?, ?, ?, ?)", args: [runId, registry, startedAt, startedAt, sourceVersion, message] });
      await tx.execute({ sql: "UPDATE source_state SET status='ready', last_attempt_at=?, source_version=?, message=? WHERE registry=?", args: [startedAt, sourceVersion, message, registry] });
    });
  }

  async sourceState(registry: RegistryName) {
    await this.initialize();
    const row = (await (await this.client()).execute({ sql: "SELECT * FROM source_state WHERE registry=?", args: [registry] })).rows[0];
    return row ? sourceFromRow(row as unknown as Row) : undefined;
  }

  private async allSourceStates() {
    return ((await (await this.client()).execute("SELECT * FROM source_state ORDER BY registry")).rows as unknown as Row[]).map(sourceFromRow);
  }

  async search(input: TrialIndexSearchInput): Promise<TrialIndexSearchResult> {
    await this.initialize();
    const client = await this.client();
    const terms = normalizedSearchTerms(input.terms);
    const ftsQuery = terms.map((term) => searchTermTokens(term).map((token) => `"${token.replaceAll('"', '""')}"*`).join(" AND ")).filter(Boolean).map((group) => `(${group})`).join(" OR ");
    const limit = Math.max(input.pageSize * 4, input.pageSize);
    const recruitmentFilter = input.includeNotOpen ? "" : ` AND recruitment_category IN (${acceptingCategorySql})`;
    const result = ftsQuery
      ? await client.execute({
        sql: `SELECT r.payload_json FROM (SELECT rowid, region_tier, recruitment_category, source_updated_at FROM trial_records_fts_v2 WHERE trial_records_fts_v2 MATCH ?${recruitmentFilter} ORDER BY ${rankOrderSql} LIMIT ?) AS matches JOIN trial_records r ON r.rowid=matches.rowid ORDER BY ${rankOrderSql.replaceAll("region_tier", "matches.region_tier").replaceAll("recruitment_category", "matches.recruitment_category").replaceAll("source_updated_at", "matches.source_updated_at")}`,
        args: [ftsQuery, limit],
      })
      : await client.execute({ sql: `SELECT payload_json FROM trial_records WHERE 1=1${recruitmentFilter} ORDER BY source_updated_at DESC LIMIT ?`, args: [limit] });
    const trials = rankTrials(deduplicateTrials(result.rows.map((row) => deserializeTrial(String(row.payload_json)))))
      .filter((trial) => input.includeNotOpen || trial.recruitment.acceptingNewParticipants)
      .slice(0, input.pageSize);
    const sources = (await this.allSourceStates()).filter((state) => (trackedRegistries as readonly string[]).includes(state.registry));
    return { trials, sources, searchedAt: new Date().toISOString(), backend: this.backend };
  }

  async getByCanonicalId(canonicalId: string) {
    await this.initialize();
    const rows = (await (await this.client()).execute({ sql: "SELECT payload_json FROM trial_records WHERE canonical_id=?", args: [canonicalId] })).rows;
    const trials = rows.map((row) => deserializeTrial(String(row.payload_json)));
    return trials.length ? deduplicateTrials(trials)[0] : undefined;
  }

  async health(): Promise<TrialIndexHealth> {
    await this.initialize();
    const client = await this.client();
    const sources = await this.allSourceStates();
    const recentRuns = ((await client.execute("SELECT * FROM ingestion_runs ORDER BY started_at DESC LIMIT 8")).rows as unknown as Row[]).map(runFromRow);
    // Source bookkeeping instead of COUNT(*) over a multi-GB table on every request.
    const totalRecords = sources.reduce((sum, source) => sum + source.recordCount, 0);
    const readyCount = sources.filter((source) => source.status === "ready").length;
    const status = totalRecords === 0 ? "empty" : sources.some((source) => source.status === "failed") ? "degraded" : readyCount === trackedRegistries.length ? "ready" : "partial";
    const lastSuccessfulSyncAt = sources.map((source) => source.lastSuccessAt).filter((value): value is string => Boolean(value)).sort().at(-1);
    return { enabled: true, backend: this.backend, storage: this.backend, containsPatientData: false, status, totalRecords, lastSuccessfulSyncAt, sources, recentRuns };
  }

  async close() {
    this.clientInstance?.close();
    this.clientInstance = undefined;
    this.initialization = undefined;
  }
}
