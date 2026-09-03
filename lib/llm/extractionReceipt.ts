import { resolveOllamaTransport, type OllamaTransport } from "./ollama.ts";

export type CloudExtractionReceipt = {
  status: "completed" | "failed";
  requestedModel: string;
  reportedModel: string | null;
  transport: OllamaTransport;
  inference: "remote-cloud-only";
  latencyMs: number;
  requestContent: "masked_note";
  trialBridgePersisted: false;
  providerRetention: "not_assessed";
  containsMedicalContent: false;
  containsModelContent: false;
  failureCode?: string;
};

export function createCloudExtractionReceipt(input: {
  status: CloudExtractionReceipt["status"];
  requestedModel: string;
  reportedModel?: string | null;
  startedAtMs: number;
  endedAtMs: number;
  failureCode?: string;
  transport?: OllamaTransport;
}): CloudExtractionReceipt {
  return {
    status: input.status,
    requestedModel: input.requestedModel,
    reportedModel: input.reportedModel?.trim() || null,
    transport: input.transport ?? resolveOllamaTransport(),
    inference: "remote-cloud-only",
    latencyMs: Math.max(0, Math.round(input.endedAtMs - input.startedAtMs)),
    requestContent: "masked_note",
    trialBridgePersisted: false,
    providerRetention: "not_assessed",
    containsMedicalContent: false,
    containsModelContent: false,
    ...(input.failureCode ? { failureCode: input.failureCode } : {}),
  };
}
