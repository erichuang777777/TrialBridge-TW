import type { WebMcpActivityState } from "./tools";

export const maxWebMcpReceiptEvents = 20;

type ReceiptEventBase = {
  id: number;
  occurredAt: string;
};

export type WebMcpReceiptEvent = ReceiptEventBase & (
  | {
    kind: "capability_set";
    state: "verified";
    toolNames: string[];
    addedToolNames: string[];
    removedToolNames: string[];
  }
  | {
    kind: "tool_execution";
    state: WebMcpActivityState;
    toolName: string;
  }
  | {
    kind: "runtime";
    state: "unsupported" | "error";
  }
);

function bounded(events: WebMcpReceiptEvent[]): WebMcpReceiptEvent[] {
  return events.slice(-maxWebMcpReceiptEvents);
}

function normalizedToolNames(toolNames: string[]): string[] {
  return [...new Set(toolNames)].sort((left, right) => left.localeCompare(right));
}

export function appendCapabilitySet(
  events: WebMcpReceiptEvent[],
  toolNames: string[],
  occurredAt: string,
  id: number,
): WebMcpReceiptEvent[] {
  const normalized = normalizedToolNames(toolNames);
  const previous = [...events].reverse().find((event) => event.kind === "capability_set");
  if (previous?.kind === "capability_set" && previous.toolNames.join("|") === normalized.join("|")) return events;
  const previousNames = previous?.kind === "capability_set" ? previous.toolNames : [];
  return bounded([...events, {
    id,
    occurredAt,
    kind: "capability_set",
    state: "verified",
    toolNames: normalized,
    addedToolNames: normalized.filter((name) => !previousNames.includes(name)),
    removedToolNames: previousNames.filter((name) => !normalized.includes(name)),
  }]);
}

export function appendToolExecution(
  events: WebMcpReceiptEvent[],
  toolName: string,
  state: WebMcpActivityState,
  occurredAt: string,
  id: number,
): WebMcpReceiptEvent[] {
  return bounded([...events, { id, occurredAt, kind: "tool_execution", state, toolName }]);
}

export function appendRuntimeState(
  events: WebMcpReceiptEvent[],
  state: "unsupported" | "error",
  occurredAt: string,
  id: number,
): WebMcpReceiptEvent[] {
  const last = events.at(-1);
  if (last?.kind === "runtime" && last.state === state) return events;
  return bounded([...events, { id, occurredAt, kind: "runtime", state }]);
}

export function createWebMcpSessionReceipt(events: WebMcpReceiptEvent[], generatedAt: string, origin: string) {
  return {
    schemaVersion: "1.0",
    generatedAt,
    origin,
    persistence: "download-only",
    privacy: "Contains capability names and lifecycle states only. No medical note, profile fact, trial result, prompt, tool argument, or tool output is recorded.",
    events,
  } as const;
}
