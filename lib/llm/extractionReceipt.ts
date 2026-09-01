export type CloudExtractionReceipt = {
  status: "completed" | "failed";
  requestedModel: string;
  reportedModel: string | null;
  transport: "localhost_ollama_proxy";
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
}): CloudExtractionReceipt {
  return {
    status: input.status,
    requestedModel: input.requestedModel,
    reportedModel: input.reportedModel?.trim() || null,
    transport: "localhost_ollama_proxy",
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
