import { z } from "zod";
import { requiredCloudModel, validatedCloudModel } from "./cloud.ts";
import { validatedLoopbackBaseUrl } from "./ollama.ts";

export const cloudProbeTimeoutMs = 30_000;

const probeResponseSchema = z.object({
  model: z.string().trim().min(1).max(200),
  message: z.object({ content: z.string().max(2_000) }),
  done: z.boolean().optional(),
  done_reason: z.string().optional(),
});

const probeContentSchema = z.object({ status: z.literal("ready") }).strict();

export class CloudProbeError extends Error {
  readonly code: "CLOUD_PROBE_TIMEOUT" | "CLOUD_PROBE_UNAVAILABLE" | "CLOUD_PROBE_INVALID_RESPONSE";

  constructor(message: string, code: CloudProbeError["code"]) {
    super(message);
    this.name = "CloudProbeError";
    this.code = code;
  }
}

export async function probeCloudModel(options: {
  fetcher?: typeof fetch;
  signal?: AbortSignal;
  now?: () => number;
  checkedAt?: () => Date;
} = {}) {
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? (() => performance.now());
  const checkedAt = options.checkedAt ?? (() => new Date());
  const startedAt = now();
  const timeoutSignal = AbortSignal.timeout(cloudProbeTimeoutMs);
  const signal = options.signal ? AbortSignal.any([options.signal, timeoutSignal]) : timeoutSignal;
  let response: Response;
  try {
    response = await fetcher(new URL("/api/chat", validatedLoopbackBaseUrl()), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        model: validatedCloudModel(),
        stream: false,
        think: "low",
        format: "json",
        options: { temperature: 0, num_predict: 128 },
        messages: [
          { role: "system", content: "This is a fixed synthetic availability probe. Return only JSON exactly as {\"status\":\"ready\"}." },
          { role: "user", content: "TrialBridge TW synthetic cloud availability probe. No user content is included." },
        ],
      }),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new CloudProbeError("The cloud probe did not finish before its 30-second limit.", "CLOUD_PROBE_TIMEOUT");
    }
    throw new CloudProbeError("The cloud model could not be reached through the localhost proxy.", "CLOUD_PROBE_UNAVAILABLE");
  }
  if (!response.ok) throw new CloudProbeError(`The cloud provider returned HTTP ${response.status}.`, "CLOUD_PROBE_UNAVAILABLE");

  let reportedModel: string;
  try {
    const payload = probeResponseSchema.parse(await response.json());
    const content = JSON.parse(payload.message.content.trim()) as unknown;
    probeContentSchema.parse(content);
    reportedModel = payload.model;
  } catch {
    throw new CloudProbeError("The cloud provider returned an invalid probe response.", "CLOUD_PROBE_INVALID_RESPONSE");
  }

  return {
    status: "ready" as const,
    requestedModel: requiredCloudModel,
    reportedModel,
    transport: "localhost_ollama_proxy" as const,
    inference: "remote-cloud-only" as const,
    latencyMs: Math.max(0, Math.round(now() - startedAt)),
    checkedAt: checkedAt().toISOString(),
    timeoutMs: cloudProbeTimeoutMs,
    persisted: false as const,
    containsHealthInformation: false as const,
    storesModelContent: false as const,
  };
}
