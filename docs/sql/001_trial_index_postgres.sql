-- TrialBridge TW public-registry index. No patient-authored or patient-derived data belongs here.
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
  run_id text NOT NULL, registry text NOT NULL, registry_id text NOT NULL, canonical_id text NOT NULL,
  payload_json jsonb NOT NULL, content_hash text NOT NULL, search_text text NOT NULL,
  region_tier text NOT NULL, recruitment_category text NOT NULL, source_updated_at text,
  indexed_at timestamptz NOT NULL, PRIMARY KEY (run_id, registry, registry_id)
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
