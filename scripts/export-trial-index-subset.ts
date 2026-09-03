/**
 * Copies a local SQLite trial index into a new SQLite file, optionally keeping
 * only the `demo` profile, so the result can be uploaded to Turso with
 * `turso db import`. Public registry records only; the script never prints a
 * record, a path outside its arguments, or any patient data.
 *
 *   npm run export:trial-index-subset -- --from=var/trial-index/trials.sqlite \
 *     --to=var/trial-index/trials-demo.sqlite --profile=demo
 */
import { rm, stat } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { resolveTrialIndexProfile, trialIndexProfileSqlPredicate } from "../lib/trials/index/profile.ts";
import { SqliteTrialIndexStore } from "../lib/trials/index/sqlite.ts";
import { trackedRegistries } from "../lib/trials/index/shared.ts";

function argument(name: string): string | undefined {
  return process.argv.find((item) => item.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
}

const from = path.resolve(argument("from") ?? path.join("var", "trial-index", "trials.sqlite"));
const to = path.resolve(argument("to") ?? path.join("var", "trial-index", "trials-subset.sqlite"));
const profile = resolveTrialIndexProfile(argument("profile") ?? "demo");
if (from === to) throw new Error("--from and --to must differ");
await stat(from);
if (process.argv.includes("--overwrite")) await rm(to, { force: true });
else if (await stat(to).then(() => true, () => false)) throw new Error(`${path.basename(to)} already exists; pass --overwrite to replace it`);

// Create the destination schema through the real store so FTS, triggers, and
// the schema-version marker match what every backend expects.
const destinationStore = new SqliteTrialIndexStore(to);
await destinationStore.initialize();
await destinationStore.close();

// The destination is the writable main connection; the source is attached and
// only ever read. Destination triggers maintain its FTS index during the copy.
const db = new DatabaseSync(to);
db.prepare("ATTACH DATABASE ? AS src").run(from);
const version = (db.prepare("SELECT value FROM src.index_metadata WHERE key='fts_schema_version'").get() as { value?: string } | undefined)?.value;
if (version !== "3") {
  db.close();
  throw new Error("The source index is not at FTS schema version 3; run the app once with the sqlite backend to migrate it first");
}

const predicate = trialIndexProfileSqlPredicate(profile);
const startedAt = performance.now();
db.exec("BEGIN");
try {
  db.exec(`INSERT INTO main.trial_records SELECT * FROM src.trial_records WHERE ${predicate}`);
  db.exec("INSERT OR REPLACE INTO main.source_state SELECT * FROM src.source_state");
  db.exec("INSERT OR REPLACE INTO main.ingestion_runs SELECT * FROM (SELECT * FROM src.ingestion_runs ORDER BY started_at DESC LIMIT 16)");
  db.exec("INSERT OR REPLACE INTO main.index_metadata SELECT * FROM src.index_metadata");
  db.prepare("UPDATE main.source_state SET record_count=(SELECT COUNT(*) FROM main.trial_records r WHERE r.registry=main.source_state.registry), message=CASE WHEN ?='demo' THEN 'Demo profile subset: Taiwan/Asia plus worldwide open records.' ELSE message END").run(profile);
  db.exec("COMMIT");
} catch (error) {
  db.exec("ROLLBACK");
  db.close();
  throw error;
}
const counts = Object.fromEntries(trackedRegistries.map((registry) => [registry, Number((db.prepare("SELECT COUNT(*) AS count FROM main.trial_records WHERE registry=?").get(registry) as { count: number }).count)]));
const sourceCounts = Object.fromEntries(trackedRegistries.map((registry) => [registry, Number((db.prepare("SELECT COUNT(*) AS count FROM src.trial_records WHERE registry=?").get(registry) as { count: number }).count)]));
const ftsRows = Number((db.prepare("SELECT COUNT(*) AS count FROM main.trial_records_fts_v2").get() as { count: number }).count);
db.exec("DETACH DATABASE src");
// Leave a single rollback-journal file so the upload does not need a WAL sidecar.
db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
db.exec("PRAGMA journal_mode=DELETE");
db.exec("VACUUM");
db.close();

const size = (await stat(to)).size;
process.stdout.write(`${JSON.stringify({
  profile,
  destination: path.basename(to),
  bytes: size,
  records: counts,
  ftsRows,
  sourceRecords: sourceCounts,
  durationMs: Math.round(performance.now() - startedAt),
  containsPatientData: false,
  next: "turso db import <file> --name <database>",
}, null, 2)}\n`);
