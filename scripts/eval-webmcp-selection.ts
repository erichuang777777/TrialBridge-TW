import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { webMcpJourneyCases } from "../evals/webmcp-journeys.ts";
import { runWebMcpSelectionEval } from "../lib/webmcp/selectionEval.ts";

function valueAfter(flag: string) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const repetitions = Number.parseInt(valueAfter("--repetitions") ?? "1", 10);
const timeoutMs = Number.parseInt(valueAfter("--timeout-ms") ?? "60000", 10);
const outputPath = valueAfter("--output");
const caseIds = valueAfter("--cases")?.split(",").map((value) => value.trim()).filter(Boolean);
const selectedCases = caseIds?.length ? webMcpJourneyCases.filter((item) => caseIds.includes(item.id)) : webMcpJourneyCases;
if (selectedCases.length === 0) throw new Error("--cases did not match any WebMCP journey case IDs");

const baseline = await runWebMcpSelectionEval({
  cases: selectedCases,
  repetitions,
  timeoutMs,
  onProgress: (sample, completed, total) => {
    const result = sample.passed ? "PASS" : "FAIL";
    console.error(`[${completed}/${total}] ${result} ${sample.caseId} -> ${sample.selectedTools.join(",") || "no_tool"} (${sample.latencyMs}ms)`);
  },
});

const serialized = `${JSON.stringify(baseline, null, 2)}\n`;
if (outputPath) {
  const resolved = path.resolve(outputPath);
  await mkdir(path.dirname(resolved), { recursive: true });
  await writeFile(resolved, serialized, "utf8");
  console.error(`Wrote ${resolved}`);
} else {
  process.stdout.write(serialized);
}

if (baseline.summary.failed > 0) process.exitCode = 1;
