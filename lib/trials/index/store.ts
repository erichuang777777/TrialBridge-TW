import path from "node:path";
import { PostgresTrialIndexStore } from "./postgres.ts";
import { SqliteTrialIndexStore } from "./sqlite.ts";
import type { TrialIndexStore } from "./types.ts";

export type TrialIndexEnvironment = Partial<Record<"TRIAL_INDEX_BACKEND" | "TRIAL_INDEX_SQLITE_PATH" | "DATABASE_URL", string>>;

function sqlitePath(environment: TrialIndexEnvironment) {
  const configured = environment.TRIAL_INDEX_SQLITE_PATH?.trim();
  const resolved = path.resolve(configured || path.join(process.cwd(), "var", "trial-index", "trials.sqlite"));
  if (resolved === path.parse(resolved).root) throw new Error("TRIAL_INDEX_SQLITE_PATH cannot be a filesystem root");
  return resolved;
}

export function createTrialIndexStore(environment: TrialIndexEnvironment = process.env as TrialIndexEnvironment): TrialIndexStore {
  const requested = environment.TRIAL_INDEX_BACKEND?.trim().toLocaleLowerCase("en");
  const backend = requested || (environment.DATABASE_URL?.trim() ? "postgres" : "sqlite");
  if (backend === "postgres") {
    const databaseUrl = environment.DATABASE_URL?.trim();
    if (!databaseUrl) throw new Error("DATABASE_URL is required when TRIAL_INDEX_BACKEND=postgres");
    return new PostgresTrialIndexStore(databaseUrl);
  }
  if (backend === "sqlite") return new SqliteTrialIndexStore(sqlitePath(environment));
  throw new Error("TRIAL_INDEX_BACKEND must be sqlite or postgres");
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
