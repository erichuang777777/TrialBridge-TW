"use client";

import { useEffect } from "react";
import { buildTrialBridgeTools } from "@/lib/webmcp/tools";
import type { TrialMatch } from "@/lib/matching/engine";
import type { ConfirmedProfile } from "@/lib/profile/schema";

export function WebMcpBridge({ profile, matches, sensitiveConsent }: { profile?: ConfirmedProfile; matches: TrialMatch[]; sensitiveConsent: boolean }) {
  useEffect(() => {
    if (!document.modelContext) return;
    const controller = new AbortController();
    const tools = buildTrialBridgeTools({ profile, matches, sensitiveConsent });
    void Promise.all(tools.map((tool) => document.modelContext!.registerTool(tool, { signal: controller.signal, exposedTo: [location.origin] }))).catch(() => undefined);
    return () => controller.abort();
  }, [profile, matches, sensitiveConsent]);
  return null;
}
