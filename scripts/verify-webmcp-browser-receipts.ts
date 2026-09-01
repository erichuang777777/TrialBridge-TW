import { readFileSync } from "node:fs";
import {
  verifyWebMcpBrowserDiagnosticReceipt,
  verifyWebMcpInspectorAcceptanceReceipt,
} from "../lib/webmcp/receiptVerification.ts";

const paths = process.argv.slice(2);
if (paths.length === 0) {
  console.error("Usage: npm run verify:webmcp:receipts -- <browser-diagnostic.json> [manual-inspector.json]");
  process.exitCode = 2;
} else {
  const reports = paths.map((path) => {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    const artifactClass = typeof parsed === "object" && parsed !== null && "artifactClass" in parsed
      ? (parsed as { artifactClass?: unknown }).artifactClass
      : undefined;
    const report = artifactClass === "manual_inspector_self_attestation"
      ? verifyWebMcpInspectorAcceptanceReceipt(parsed)
      : verifyWebMcpBrowserDiagnosticReceipt(parsed);
    return { path, ...report };
  });
  console.log(JSON.stringify({
    verifiedAt: new Date().toISOString(),
    passed: reports.every((report) => report.ok),
    reports,
    evidenceBoundary: "The browser receipt is runtime metadata. The Inspector receipt remains manual self-attestation and is not cryptographic browser evidence.",
  }, null, 2));
  if (reports.some((report) => !report.ok)) process.exitCode = 1;
}
