export const webMcpImplementationLandscape = {
  auditedAt: "2026-09-02",
  upstreamCommit: "41d12f0",
  evidenceBoundary: "Source-reported ecosystem status. TrialBridge TW does not treat these entries as local runtime verification.",
  entries: [
    {
      platform: "ChatGPT Desktop",
      status: "supported",
      statusLabel: "Supported",
      detail: "The upstream WebMCP implementation-status record lists WebMCP support in ChatGPT Desktop.",
      sourceLabel: "Upstream implementation status",
      sourceUrl: "https://github.com/webmachinelearning/webmcp/blob/main/implementation-status.md#chatgpt-desktop",
    },
    {
      platform: "Chrome 149",
      status: "origin_trial",
      statusLabel: "Origin Trial",
      detail: "Chrome documents the WebMCP Origin Trial beginning in Chrome 149, with a local testing flag for development.",
      sourceLabel: "Chrome WebMCP documentation",
      sourceUrl: "https://developer.chrome.com/docs/ai/webmcp",
    },
    {
      platform: "Brave Leo",
      status: "experimental",
      statusLabel: "Experimental",
      detail: "The upstream implementation-status record reports experimental WebMCP support in Brave Leo AI chat.",
      sourceLabel: "Upstream implementation status",
      sourceUrl: "https://github.com/webmachinelearning/webmcp/blob/main/implementation-status.md#brave",
    },
  ],
} as const;
