import path from "node:path";
import type { NormalizedTrial, RegistryName } from "../types.ts";
import type { CommitStagedSourceInput, ReplaceSourceInput, TrialIndexBackend, TrialIndexHealth, TrialIndexSearchInput, TrialIndexSearchResult, TrialIndexSourceState, TrialIndexStore } from "./types.ts";

export type TrialIndexEnvironment = Partial<Record<
  | "TRIAL_INDEX_BACKEND"
  | "TRIAL_INDEX_SQLITE_PATH"
  | "DATABASE_URL"
  | "TRIAL_INDEX_LIBSQL_URL"
  | "TRIAL_INDEX_LIBSQL_AUTH_TOKEN"
  | "TRIAL_INDEX_LIBSQL_READ_ONLY",
  string
>>;

function sqlitePath(environment: TrialIndexEnvironment) {
  const configured = environment.TRIAL_INDEX_SQLITE_PATH?.trim();
  const resolved = path.resolve(configured || path.join(process.cwd(), "var", "trial-index", "trials.sqlite"));
  if (resolved === path.parse(resolved).root) throw new Error("TRIAL_INDEX_SQLITE_PATH cannot be a filesystem root");
  return resolved;
}

function booleanFlag(value: string | undefined): boolean {
  return ["1", "true", "yes"].includes(value?.trim().toLocaleLowerCase("en") ?? "");
}

/**
 * Defers loading a backend until first use, so a deployment that only ever
 * talks to a remote libSQL database never loads `node:sqlite` or the native
 * libSQL driver, and callers keep a synchronous factory.
 */
class LazyTrialIndexStore implements TrialIndexStore {
  readonly backend: TrialIndexBackend;
  private readonly load: () => Promise<TrialIndexStore>;
  private loading?: Promise<TrialIndexStore>;

  constructor(backend: TrialIndexBackend, load: () => Promise<TrialIndexStore>) {
    this.backend = backend;
    this.load = load;
  }

  private store() {
    this.loading ??= this.load().catch((error) => {
      this.loading = undefined;
      throw error;
    });
    return this.loading;
  }

  async initialize() { return (await this.store()).initialize(); }
  async replaceSource(input: ReplaceSourceInput) { return (await this.store()).replaceSource(input); }
  async markSyncing(registry: RegistryName, startedAt: string) { return (await this.store()).markSyncing(registry, startedAt); }
  async markFailure(registry: RegistryName, runId: string, startedAt: string, finishedAt: string, durationMs: number, message: string) { return (await this.store()).markFailure(registry, runId, startedAt, finishedAt, durationMs, message); }
  async markSkipped(registry: RegistryName, startedAt: string, sourceVersion: string, message: string) { return (await this.store()).markSkipped(registry, startedAt, sourceVersion, message); }
  async stageSourceBatch(registry: RegistryName, runId: string, trials: NormalizedTrial[], indexedAt: string) { return (await this.store()).stageSourceBatch(registry, runId, trials, indexedAt); }
  async commitStagedSource(input: CommitStagedSourceInput): Promise<TrialIndexSourceState> { return (await this.store()).commitStagedSource(input); }
  async commitStagedIncrementalSource(input: CommitStagedSourceInput): Promise<TrialIndexSourceState> { return (await this.store()).commitStagedIncrementalSource(input); }
  async sourceState(registry: RegistryName) { return (await this.store()).sourceState(registry); }
  async search(input: TrialIndexSearchInput): Promise<TrialIndexSearchResult> { return (await this.store()).search(input); }
  async getByCanonicalId(canonicalId: string) { return (await this.store()).getByCanonicalId(canonicalId); }
  async health(): Promise<TrialIndexHealth> { return (await this.store()).health(); }
  async close() {
    if (!this.loading) return;
    const store = await this.loading;
    this.loading = undefined;
    await store.close();
  }
}

export function resolveTrialIndexBackend(environment: TrialIndexEnvironment = process.env as TrialIndexEnvironment): TrialIndexBackend {
  const requested = environment.TRIAL_INDEX_BACKEND?.trim().toLocaleLowerCase("en");
  const backend = requested
    || (environment.TRIAL_INDEX_LIBSQL_URL?.trim() ? "libsql" : environment.DATABASE_URL?.trim() ? "postgres" : "sqlite");
  if (backend !== "sqlite" && backend !== "postgres" && backend !== "libsql") throw new Error("TRIAL_INDEX_BACKEND must be sqlite, libsql, or postgres");
  return backend;
}

export function createTrialIndexStore(environment: TrialIndexEnvironment = process.env as TrialIndexEnvironment): TrialIndexStore {
  const backend = resolveTrialIndexBackend(environment);
  if (backend === "postgres") {
    const databaseUrl = environment.DATABASE_URL?.trim();
    if (!databaseUrl) throw new Error("DATABASE_URL is required when TRIAL_INDEX_BACKEND=postgres");
    return new LazyTrialIndexStore("postgres", async () => new (await import("./postgres.ts")).PostgresTrialIndexStore(databaseUrl));
  }
  if (backend === "libsql") {
    const url = environment.TRIAL_INDEX_LIBSQL_URL?.trim();
    if (!url) throw new Error("TRIAL_INDEX_LIBSQL_URL is required when TRIAL_INDEX_BACKEND=libsql");
    const authToken = environment.TRIAL_INDEX_LIBSQL_AUTH_TOKEN;
    const readOnly = booleanFlag(environment.TRIAL_INDEX_LIBSQL_READ_ONLY);
    return new LazyTrialIndexStore("libsql", async () => new (await import("./libsql.ts")).LibsqlTrialIndexStore({ url, authToken, readOnly }));
  }
  const databasePath = sqlitePath(environment);
  return new LazyTrialIndexStore("sqlite", async () => new (await import("./sqlite.ts")).SqliteTrialIndexStore(databasePath));
}

let sharedStore: TrialIndexStore | undefined;

export function getTrialIndexStore(): TrialIndexStore {
  sharedStore ??= createTrialIndexStore();
  return sharedStore;
}

export async function resetTrialIndexStoreForTests() {
  await sharedStore?.close();
  sharedStore = undefined;
}
