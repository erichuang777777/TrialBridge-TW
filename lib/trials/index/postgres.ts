import postgres, { type Sql } from "postgres";
import { deduplicateTrials } from "../dedupe.ts";
import { rankTrials } from "../regions.ts";
import type { NormalizedTrial, RegistryName } from "../types.ts";
import { classifySourceStatus, completedSyncTiming, deserializeTrial, newRunId, normalizedSearchTerms, searchableText, searchTermTokens, serializeTrial, sourceRegistryId, trackedRegistries, trialContentHash } from "./shared.ts";
import type { CommitStagedSourceInput, ReplaceSourceInput, TrialIndexHealth, TrialIndexRun, TrialIndexSearchInput, TrialIndexSearchResult, TrialIndexSourceState, TrialIndexStore } from "./types.ts";

const schema = `
CREATE TABLE IF NOT EXISTS trial_records (
  registry text NOT NULL,
  registry_id text NOT NULL,
  canonical_id text NOT NULL,
  payload_json jsonb NOT NULL,
  content_hash text NOT NULL,
  search_text text NOT NULL,
  region_tier text NOT NULL,
  recruitment_category text NOT NULL,
  source_updated_at text,
  indexed_at timestamptz NOT NULL,
  last_run_id text NOT NULL,
  PRIMARY KEY (registry, registry_id)
);
CREATE INDEX IF NOT EXISTS trial_records_canonical ON trial_records(canonical_id);
CREATE INDEX IF NOT EXISTS trial_records_filters ON trial_records(region_tier, recruitment_category);
CREATE INDEX IF NOT EXISTS trial_records_search_fts ON trial_records USING GIN (to_tsvector('simple', search_text));
CREATE TABLE IF NOT EXISTS trial_record_staging (
  run_id text NOT NULL,
  registry text NOT NULL,
  registry_id text NOT NULL,
  canonical_id text NOT NULL,
  payload_json jsonb NOT NULL,
  content_hash text NOT NULL,
  search_text text NOT NULL,
  region_tier text NOT NULL,
  recruitment_category text NOT NULL,
  source_updated_at text,
  indexed_at timestamptz NOT NULL,
  PRIMARY KEY (run_id, registry, registry_id)
);
CREATE TABLE IF NOT EXISTS source_state (
  registry text PRIMARY KEY,
  status text NOT NULL,
  record_count integer NOT NULL DEFAULT 0,
  changed_count integer NOT NULL DEFAULT 0,
  removed_count integer NOT NULL DEFAULT 0,
  source_version text,
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  duration_ms integer,
  message text
);
CREATE TABLE IF NOT EXISTS ingestion_runs (
  id text PRIMARY KEY,
  registry text NOT NULL,
  status text NOT NULL,
  started_at timestamptz NOT NULL,
  finished_at timestamptz,
  source_version text,
  received_count integer NOT NULL DEFAULT 0,
  changed_count integer NOT NULL DEFAULT 0,
  removed_count integer NOT NULL DEFAULT 0,
  message text
);
CREATE INDEX IF NOT EXISTS ingestion_runs_started ON ingestion_runs(started_at DESC);
`;

type Row = Record<string, unknown>;

function sourceFromRow(row: Row): TrialIndexSourceState {
  const registry = String(row.registry) as RegistryName;
  const lastSuccessAt = row.last_success_at ? new Date(String(row.last_success_at)).toISOString() : undefined;
  return {
    registry,
    status: classifySourceStatus(lastSuccessAt, registry, String(row.status) as TrialIndexSourceState["status"]),
    recordCount: Number(row.record_count), changedCount: Number(row.changed_count), removedCount: Number(row.removed_count),
    sourceVersion: row.source_version ? String(row.source_version) : undefined,
    lastAttemptAt: row.last_attempt_at ? new Date(String(row.last_attempt_at)).toISOString() : undefined,
    lastSuccessAt,
    durationMs: row.duration_ms === null || row.duration_ms === undefined ? undefined : Number(row.duration_ms),
    message: row.message ? String(row.message) : undefined,
  };
}

function runFromRow(row: Row): TrialIndexRun {
  return {
    id: String(row.id), registry: String(row.registry) as RegistryName, status: String(row.status) as TrialIndexRun["status"],
    startedAt: new Date(String(row.started_at)).toISOString(),
    finishedAt: row.finished_at ? new Date(String(row.finished_at)).toISOString() : undefined,
    sourceVersion: row.source_version ? String(row.source_version) : undefined,
    receivedCount: Number(row.received_count), changedCount: Number(row.changed_count), removedCount: Number(row.removed_count),
    message: row.message ? String(row.message) : undefined,
  };
}

export class PostgresTrialIndexStore implements TrialIndexStore {
  readonly backend = "postgres" as const;
  private readonly sql: Sql;
  private initialized = false;

  constructor(databaseUrl: string) {
    this.sql = postgres(databaseUrl, { max: 6, idle_timeout: 20, connect_timeout: 15, prepare: false });
  }

  async initialize() {
    if (this.initialized) return;
    await this.sql.unsafe(schema);
    for (const registry of trackedRegistries) await this.sql`INSERT INTO source_state (registry, status) VALUES (${registry}, 'never_synced') ON CONFLICT (registry) DO NOTHING`;
    this.initialized = true;
  }

  async markSyncing(registry: RegistryName, startedAt: string) {
    await this.initialize();
    const runId = newRunId(registry);
    await this.sql.begin(async (tx) => {
      await tx`INSERT INTO ingestion_runs (id, registry, status, started_at) VALUES (${runId}, ${registry}, 'running', ${startedAt})`;
      await tx`UPDATE source_state SET status='syncing', last_attempt_at=${startedAt}, message=NULL WHERE registry=${registry}`;
    });
    return runId;
  }

  async replaceSource(input: ReplaceSourceInput) {
    await this.initialize();
    const running = await this.sql`SELECT id FROM ingestion_runs WHERE registry=${input.registry} AND status='running' ORDER BY started_at DESC LIMIT 1`;
    const runId = running[0]?.id ? String(running[0].id) : newRunId(input.registry);
    const previous = await this.sql`SELECT registry_id, content_hash FROM trial_records WHERE registry=${input.registry}`;
    const existing = new Map(previous.map((row) => [String(row.registry_id), String(row.content_hash)]));
    const rows = input.trials.map((trial) => {
      const payload = serializeTrial(trial);
      const registryId = sourceRegistryId(trial, input.registry);
      return {
        registry: input.registry, registry_id: registryId, canonical_id: trial.canonicalId,
        payload_json: JSON.parse(payload), content_hash: trialContentHash(trial), search_text: searchableText(trial),
        region_tier: trial.regionTier, recruitment_category: trial.recruitment.category,
        source_updated_at: trial.sources.find((source) => source.registry === input.registry)?.lastUpdated ?? null,
        indexed_at: input.finishedAt, last_run_id: runId,
      };
    });
    const changedCount = rows.filter((row) => existing.get(row.registry_id) !== row.content_hash).length;
    let removedCount = 0;
    await this.sql.begin(async (tx) => {
      if (!running[0]?.id) await tx`INSERT INTO ingestion_runs (id, registry, status, started_at) VALUES (${runId}, ${input.registry}, 'running', ${input.startedAt})`;
      for (let offset = 0; offset < rows.length; offset += 500) {
        const chunk = rows.slice(offset, offset + 500);
        await tx`INSERT INTO trial_records ${tx(chunk, "registry", "registry_id", "canonical_id", "payload_json", "content_hash", "search_text", "region_tier", "recruitment_category", "source_updated_at", "indexed_at", "last_run_id")}
          ON CONFLICT (registry, registry_id) DO UPDATE SET canonical_id=excluded.canonical_id, payload_json=excluded.payload_json, content_hash=excluded.content_hash, search_text=excluded.search_text, region_tier=excluded.region_tier, recruitment_category=excluded.recruitment_category, source_updated_at=excluded.source_updated_at, indexed_at=excluded.indexed_at, last_run_id=excluded.last_run_id`;
      }
      const removed = await tx`SELECT count(*)::int AS count FROM trial_records WHERE registry=${input.registry} AND last_run_id<>${runId}`;
      removedCount = Number(removed[0]?.count ?? 0);
      await tx`DELETE FROM trial_records WHERE registry=${input.registry} AND last_run_id<>${runId}`;
      const stored = await tx`SELECT count(*)::int AS count FROM trial_records WHERE registry=${input.registry}`;
      await tx`UPDATE source_state SET status='ready', record_count=${Number(stored[0]?.count ?? 0)}, changed_count=${changedCount}, removed_count=${removedCount}, source_version=${input.sourceVersion ?? null}, last_attempt_at=${input.finishedAt}, last_success_at=${input.finishedAt}, duration_ms=${input.durationMs}, message=NULL WHERE registry=${input.registry}`;
      await tx`UPDATE ingestion_runs SET status='succeeded', finished_at=${input.finishedAt}, source_version=${input.sourceVersion ?? null}, received_count=${input.trials.length}, changed_count=${changedCount}, removed_count=${removedCount} WHERE id=${runId}`;
    });
    return (await this.sourceState(input.registry))!;
  }

  async stageSourceBatch(registry: RegistryName, runId: string, trials: NormalizedTrial[], indexedAt: string) {
    await this.initialize();
    const rows = trials.map((trial) => {
      const payload = serializeTrial(trial);
      return { run_id: runId, registry, registry_id: sourceRegistryId(trial, registry), canonical_id: trial.canonicalId, payload_json: JSON.parse(payload), content_hash: trialContentHash(trial), search_text: searchableText(trial), region_tier: trial.regionTier, recruitment_category: trial.recruitment.category, source_updated_at: trial.sources.find((source) => source.registry === registry)?.lastUpdated ?? null, indexed_at: indexedAt };
    });
    for (let offset = 0; offset < rows.length; offset += 500) {
      const chunk = rows.slice(offset, offset + 500);
      await this.sql`INSERT INTO trial_record_staging ${this.sql(chunk, "run_id", "registry", "registry_id", "canonical_id", "payload_json", "content_hash", "search_text", "region_tier", "recruitment_category", "source_updated_at", "indexed_at")}
        ON CONFLICT (run_id, registry, registry_id) DO UPDATE SET canonical_id=excluded.canonical_id, payload_json=excluded.payload_json, content_hash=excluded.content_hash, search_text=excluded.search_text, region_tier=excluded.region_tier, recruitment_category=excluded.recruitment_category, source_updated_at=excluded.source_updated_at, indexed_at=excluded.indexed_at`;
    }
  }

  async commitStagedSource(input: CommitStagedSourceInput) {
    await this.initialize();
    let changedCount = 0;
    let removedCount = 0;
    await this.sql.begin(async (tx) => {
      const changed = await tx`SELECT count(*)::int AS count FROM trial_record_staging s LEFT JOIN trial_records r ON r.registry=s.registry AND r.registry_id=s.registry_id WHERE s.run_id=${input.runId} AND (r.content_hash IS NULL OR r.content_hash<>s.content_hash)`;
      const removed = await tx`SELECT count(*)::int AS count FROM trial_records r WHERE r.registry=${input.registry} AND NOT EXISTS (SELECT 1 FROM trial_record_staging s WHERE s.run_id=${input.runId} AND s.registry=r.registry AND s.registry_id=r.registry_id)`;
      changedCount = Number(changed[0]?.count ?? 0);
      removedCount = Number(removed[0]?.count ?? 0);
      await tx`INSERT INTO trial_records (registry, registry_id, canonical_id, payload_json, content_hash, search_text, region_tier, recruitment_category, source_updated_at, indexed_at, last_run_id)
        SELECT registry, registry_id, canonical_id, payload_json, content_hash, search_text, region_tier, recruitment_category, source_updated_at, indexed_at, run_id FROM trial_record_staging WHERE run_id=${input.runId}
        ON CONFLICT (registry, registry_id) DO UPDATE SET canonical_id=excluded.canonical_id, payload_json=excluded.payload_json, content_hash=excluded.content_hash, search_text=excluded.search_text, region_tier=excluded.region_tier, recruitment_category=excluded.recruitment_category, source_updated_at=excluded.source_updated_at, indexed_at=excluded.indexed_at, last_run_id=excluded.last_run_id`;
      await tx`DELETE FROM trial_records WHERE registry=${input.registry} AND last_run_id<>${input.runId}`;
      const stored = await tx`SELECT count(*)::int AS count FROM trial_records WHERE registry=${input.registry}`;
      await tx`DELETE FROM trial_record_staging WHERE run_id=${input.runId}`;
      const completion = completedSyncTiming(input.startedAt);
      await tx`UPDATE source_state SET status='ready', record_count=${Number(stored[0]?.count ?? 0)}, changed_count=${changedCount}, removed_count=${removedCount}, source_version=${input.sourceVersion ?? null}, last_attempt_at=${completion.finishedAt}, last_success_at=${completion.finishedAt}, duration_ms=${completion.durationMs}, message=NULL WHERE registry=${input.registry}`;
      await tx`UPDATE ingestion_runs SET status='succeeded', finished_at=${completion.finishedAt}, source_version=${input.sourceVersion ?? null}, received_count=${input.receivedCount}, changed_count=${changedCount}, removed_count=${removedCount} WHERE id=${input.runId}`;
    });
    return (await this.sourceState(input.registry))!;
  }

  async commitStagedIncrementalSource(input: CommitStagedSourceInput) {
    await this.initialize();
    let changedCount = 0;
    await this.sql.begin(async (tx) => {
      const changed = await tx`SELECT count(*)::int AS count FROM trial_record_staging s LEFT JOIN trial_records r ON r.registry=s.registry AND r.registry_id=s.registry_id WHERE s.run_id=${input.runId} AND (r.content_hash IS NULL OR r.content_hash<>s.content_hash)`;
      changedCount = Number(changed[0]?.count ?? 0);
      await tx`INSERT INTO trial_records (registry, registry_id, canonical_id, payload_json, content_hash, search_text, region_tier, recruitment_category, source_updated_at, indexed_at, last_run_id)
        SELECT registry, registry_id, canonical_id, payload_json, content_hash, search_text, region_tier, recruitment_category, source_updated_at, indexed_at, run_id FROM trial_record_staging WHERE run_id=${input.runId}
        ON CONFLICT (registry, registry_id) DO UPDATE SET canonical_id=excluded.canonical_id, payload_json=excluded.payload_json, content_hash=excluded.content_hash, search_text=excluded.search_text, region_tier=excluded.region_tier, recruitment_category=excluded.recruitment_category, source_updated_at=excluded.source_updated_at, indexed_at=excluded.indexed_at, last_run_id=excluded.last_run_id`;
      const stored = await tx`SELECT count(*)::int AS count FROM trial_records WHERE registry=${input.registry}`;
      await tx`DELETE FROM trial_record_staging WHERE run_id=${input.runId}`;
      const completion = completedSyncTiming(input.startedAt);
      await tx`UPDATE source_state SET status='ready', record_count=${Number(stored[0]?.count ?? 0)}, changed_count=${changedCount}, removed_count=0, source_version=${input.sourceVersion ?? null}, last_attempt_at=${completion.finishedAt}, last_success_at=${completion.finishedAt}, duration_ms=${completion.durationMs}, message='Incremental refresh; removals are reconciled by the scheduled full refresh.' WHERE registry=${input.registry}`;
      await tx`UPDATE ingestion_runs SET status='succeeded', finished_at=${completion.finishedAt}, source_version=${input.sourceVersion ?? null}, received_count=${input.receivedCount}, changed_count=${changedCount}, removed_count=0, message='incremental' WHERE id=${input.runId}`;
    });
    return (await this.sourceState(input.registry))!;
  }

  async markFailure(registry: RegistryName, runId: string, _startedAt: string, finishedAt: string, durationMs: number, message: string) {
    await this.initialize();
    await this.sql.begin(async (tx) => {
      await tx`UPDATE ingestion_runs SET status='failed', finished_at=${finishedAt}, message=${message} WHERE id=${runId}`;
      await tx`UPDATE source_state SET status='failed', last_attempt_at=${finishedAt}, duration_ms=${durationMs}, message=${message} WHERE registry=${registry}`;
      await tx`DELETE FROM trial_record_staging WHERE run_id=${runId}`;
    });
  }

  async markSkipped(registry: RegistryName, startedAt: string, sourceVersion: string, message: string) {
    await this.initialize();
    const runId = newRunId(registry);
    await this.sql.begin(async (tx) => {
      await tx`INSERT INTO ingestion_runs (id, registry, status, started_at, finished_at, source_version, message) VALUES (${runId}, ${registry}, 'skipped', ${startedAt}, ${startedAt}, ${sourceVersion}, ${message})`;
      await tx`UPDATE source_state SET status='ready', last_attempt_at=${startedAt}, source_version=${sourceVersion}, message=${message} WHERE registry=${registry}`;
    });
  }

  async sourceState(registry: RegistryName) {
    await this.initialize();
    const rows = await this.sql`SELECT * FROM source_state WHERE registry=${registry}`;
    return rows[0] ? sourceFromRow(rows[0]) : undefined;
  }

  async search(input: TrialIndexSearchInput): Promise<TrialIndexSearchResult> {
    await this.initialize();
    const terms = normalizedSearchTerms(input.terms);
    const tsQuery = terms.map((term) => searchTermTokens(term).map((token) => `${token}:*`).join(" & ")).filter(Boolean).map((group) => `(${group})`).join(" | ");
    const limit = Math.max(input.pageSize * 4, input.pageSize);
    const rows = tsQuery
      ? await this.sql`SELECT payload_json FROM trial_records WHERE to_tsvector('simple', search_text) @@ to_tsquery('simple', ${tsQuery}) ORDER BY CASE region_tier WHEN 'taiwan' THEN 0 WHEN 'asia' THEN 1 WHEN 'world' THEN 2 ELSE 3 END, CASE recruitment_category WHEN 'open' THEN 0 WHEN 'opening_soon' THEN 1 WHEN 'invitation_only' THEN 2 ELSE 3 END, source_updated_at DESC NULLS LAST LIMIT ${limit}`
      : await this.sql`SELECT payload_json FROM trial_records ORDER BY source_updated_at DESC NULLS LAST LIMIT ${limit}`;
    const trials = rankTrials(deduplicateTrials(rows.map((row) => typeof row.payload_json === "string" ? deserializeTrial(row.payload_json) : deserializeTrial(JSON.stringify(row.payload_json)))))
      .filter((trial) => input.includeNotOpen || trial.recruitment.acceptingNewParticipants).slice(0, input.pageSize);
    const sources = (await Promise.all(trackedRegistries.map((registry) => this.sourceState(registry)))).filter((state): state is TrialIndexSourceState => Boolean(state));
    return { trials, sources, searchedAt: new Date().toISOString(), backend: this.backend };
  }

  async getByCanonicalId(canonicalId: string): Promise<NormalizedTrial | undefined> {
    await this.initialize();
    const rows = await this.sql`SELECT payload_json FROM trial_records WHERE canonical_id=${canonicalId} OR lower(registry || ':' || registry_id)=lower(${canonicalId})`;
    const trials = rows.map((row) => typeof row.payload_json === "string" ? deserializeTrial(row.payload_json) : deserializeTrial(JSON.stringify(row.payload_json)));
    return trials.length ? deduplicateTrials(trials)[0] : undefined;
  }

  async health(): Promise<TrialIndexHealth> {
    await this.initialize();
    const sourceRows = await this.sql`SELECT * FROM source_state ORDER BY registry`;
    const runRows = await this.sql`SELECT * FROM ingestion_runs ORDER BY started_at DESC LIMIT 8`;
    const totals = await this.sql`SELECT count(*)::int AS count FROM trial_records`;
    const sources = sourceRows.map(sourceFromRow);
    const totalRecords = Number(totals[0]?.count ?? 0);
    const readyCount = sources.filter((source) => source.status === "ready").length;
    const status = totalRecords === 0 ? "empty" : sources.some((source) => source.status === "failed") ? "degraded" : readyCount === trackedRegistries.length ? "ready" : "partial";
    const lastSuccessfulSyncAt = sources.map((source) => source.lastSuccessAt).filter((value): value is string => Boolean(value)).sort().at(-1);
    return { enabled: true, backend: this.backend, storage: this.backend, containsPatientData: false, status, totalRecords, lastSuccessfulSyncAt, sources, recentRuns: runRows.map(runFromRow) };
  }

  async close() { await this.sql.end({ timeout: 5 }); }
}
