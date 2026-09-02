"use client";

import { useState } from "react";
import { webMcpBrowserSetupContract, webMcpLocalTestingFlag } from "@/lib/webmcp/browserSetup";

export function WebMcpBrowserSetup() {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  async function copyFlagAddress() {
    try {
      await navigator.clipboard.writeText(webMcpLocalTestingFlag);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 2_000);
    } catch {
      setCopyState("failed");
    }
  }

  const copyStatus = copyState === "copied"
    ? "Chrome flag address copied. Paste it into the address bar."
    : copyState === "failed"
      ? "Copy is unavailable. Select and copy the visible flag address."
      : "";

  return <section className="webmcp-browser-setup" aria-labelledby="webmcp-browser-setup-title">
    <div className="browser-setup-heading">
      <div><p className="eyebrow">Browser setup</p><h2 id="webmcp-browser-setup-title">WebMCP itself has nothing to install.</h2><p>The specification, browser feature, and TrialBridge implementation are three separate layers. Complete only the Chrome step for local testing.</p></div>
      <span>No extension required</span>
    </div>
    <ol>{webMcpBrowserSetupContract.layers.map((layer) => <li key={layer.id}>
      <span>{layer.number}</span>
      <div><small>{layer.label}</small><strong>{layer.title}</strong><p>{layer.detail}</p>{layer.id === "browser" && <code>{webMcpLocalTestingFlag}</code>}</div>
      {layer.id === "browser"
        ? <button type="button" onClick={() => void copyFlagAddress()}>{copyState === "copied" ? "Copied" : layer.actionLabel}</button>
        : <a href={layer.href} target={layer.id === "specification" ? "_blank" : undefined} rel={layer.id === "specification" ? "noreferrer" : undefined}>{layer.actionLabel}</a>}
    </li>)}</ol>
    <aside><div><strong>Model Context Tool Inspector is separate and optional.</strong><p>Visitors do not need it. Developers and judges use it only to inspect discovery, schemas, natural-language selection, calls, and permission transitions.</p></div><a href={webMcpBrowserSetupContract.inspector.documentation} target="_blank" rel="noreferrer">Inspector documentation</a></aside>
    <p className="browser-setup-status" role="status" aria-atomic="true">{copyStatus}</p>
  </section>;
}
