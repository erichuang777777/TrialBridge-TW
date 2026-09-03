import { syncTrialIndex, syncTrialIndexSource } from "../lib/trials/index/sync.ts";
import { getTrialIndexStore } from "../lib/trials/index/store.ts";
import type { IndexedRegistryName } from "../lib/trials/index/shared.ts";

function selectedSource(): IndexedRegistryName | "all" {
  const argument = process.argv.find((item) => item.startsWith("--source="))?.split("=")[1]?.toLocaleLowerCase("en") ?? "all";
  if (argument === "tfda") return "TFDA";
  if (argument === "ctgov" || argument === "clinicaltrialsgov") return "ClinicalTrials.gov";
  if (argument === "all") return "all";
  throw new Error("--source must be all, tfda, or ctgov");
}

const maxPagesRaw = process.argv.find((item) => item.startsWith("--max-pages="))?.split("=")[1];
const clinicalTrialsMaxPages = maxPagesRaw ? Number(maxPagesRaw) : undefined;
if (clinicalTrialsMaxPages !== undefined && (!Number.isInteger(clinicalTrialsMaxPages) || clinicalTrialsMaxPages < 1)) throw new Error("--max-pages must be a positive integer");
const force = process.argv.includes("--force");
const store = getTrialIndexStore();
try {
  await store.initialize();
  const source = selectedSource();
  const options = { store, force, clinicalTrialsMaxPages, onProgress: (message: string) => process.stdout.write(`${message}\n`) };
  const result = source === "all" ? await syncTrialIndex(options) : await syncTrialIndexSource(source, options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if ("failures" in result && result.failures.length > 0) process.exitCode = 1;
} finally {
  await store.close();
}
