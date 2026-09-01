export type WebMcpDiagnosticState = "unsupported" | "ready" | "error";
export type WebMcpSelfTestState = "idle" | "running" | "passed" | "failed";

export function createWebMcpDiagnosticReceipt(input: {
  generatedAt: string;
  origin: string;
  browserState: WebMcpDiagnosticState;
  expectedToolNames: string[];
  discoveredToolNames: string[];
  securityHeaders: { permissionsPolicy: boolean; openerPolicy: boolean; noSniff: boolean };
  safeExecutionAvailable: boolean;
  safeSelfTestState: WebMcpSelfTestState;
}) {
  const expected = [...new Set(input.expectedToolNames)].sort((left, right) => left.localeCompare(right));
  const discovered = [...new Set(input.discoveredToolNames)].filter((name) => expected.includes(name)).sort((left, right) => left.localeCompare(right));
  return {
    schemaVersion: "1.0",
    generatedAt: input.generatedAt,
    origin: input.origin,
    persistence: "download-only",
    containsHealthInformation: false,
    browserState: input.browserState,
    publicToolDiscovery: {
      expected,
      discovered,
      complete: expected.length === discovered.length && expected.every((name) => discovered.includes(name)),
    },
    securityHeaders: { ...input.securityHeaders },
    safeExecution: {
      available: input.safeExecutionAvailable,
      state: input.safeSelfTestState,
      authority: "trialbridge_method only; read-only and no input",
    },
    evidenceBoundary: "Runtime metadata only. This receipt does not prove natural-language selection, permission transitions, Inspector validation, or clinical accuracy.",
  } as const;
}
