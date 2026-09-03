import type { NormalizedTrial, RegistryName, TrialSearchInput } from "../types.ts";

export type TrialIndexBackend = "sqlite" | "libsql" | "postgres";
export type TrialIndexSourceStatus = "ready" | "syncing" | "stale" | "failed" | "never_synced";

export interface TrialIndexSourceState {
  registry: RegistryName;
  status: TrialIndexSourceStatus;
  recordCount: number;
  changedCount: number;
  removedCount: number;
  sourceVersion?: string;
  lastAttemptAt?: string;
  lastSuccessAt?: string;
  durationMs?: number;
  message?: string;
}

export interface TrialIndexRun {
  id: string;
  registry: RegistryName;
  status: "running" | "succeeded" | "failed" | "skipped";
  startedAt: string;
  finishedAt?: string;
  sourceVersion?: string;
  receivedCount: number;
  changedCount: number;
  removedCount: number;
  message?: string;
}

export interface TrialIndexHealth {
  enabled: boolean;
  backend: TrialIndexBackend;
  storage: TrialIndexBackend;
  containsPatientData: false;
  status: "ready" | "partial" | "empty" | "degraded";
  totalRecords: number;
  lastSuccessfulSyncAt?: string;
  sources: TrialIndexSourceState[];
  recentRuns: TrialIndexRun[];
}

export interface TrialIndexSearchInput extends TrialSearchInput {
  terms: string[];
}

export interface TrialIndexSearchResult {
  trials: NormalizedTrial[];
  sources: TrialIndexSourceState[];
  searchedAt: string;
  backend: TrialIndexBackend;
}

export interface ReplaceSourceInput {
  registry: RegistryName;
  trials: NormalizedTrial[];
  sourceVersion?: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
}

export type CommitStagedSourceInput = Omit<ReplaceSourceInput, "trials" | "finishedAt" | "durationMs"> & {
  runId: string;
  receivedCount: number;
};

export interface TrialIndexStore {
  readonly backend: TrialIndexBackend;
  initialize(): Promise<void>;
  replaceSource(input: ReplaceSourceInput): Promise<TrialIndexSourceState>;
  markSyncing(registry: RegistryName, startedAt: string): Promise<string>;
  markFailure(registry: RegistryName, runId: string, startedAt: string, finishedAt: string, durationMs: number, message: string): Promise<void>;
  markSkipped(registry: RegistryName, startedAt: string, sourceVersion: string, message: string): Promise<void>;
  stageSourceBatch(registry: RegistryName, runId: string, trials: NormalizedTrial[], indexedAt: string): Promise<void>;
  commitStagedSource(input: CommitStagedSourceInput): Promise<TrialIndexSourceState>;
  commitStagedIncrementalSource(input: CommitStagedSourceInput): Promise<TrialIndexSourceState>;
  sourceState(registry: RegistryName): Promise<TrialIndexSourceState | undefined>;
  search(input: TrialIndexSearchInput): Promise<TrialIndexSearchResult>;
  getByCanonicalId(canonicalId: string): Promise<NormalizedTrial | undefined>;
  health(): Promise<TrialIndexHealth>;
  close(): Promise<void>;
}
