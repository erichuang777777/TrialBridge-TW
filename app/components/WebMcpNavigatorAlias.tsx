"use client";

import { useEffect } from "react";

/**
 * Compatibility bridge for Inspector builds that still probe navigator.
 * The current WebMCP draft API is document.modelContext; the getter mirrors
 * that native object without replacing or mocking the browser implementation.
 */
export function WebMcpNavigatorAlias() {
  useEffect(() => {
    const navigatorWithContext = navigator as Navigator & { modelContext?: unknown };
    if ("modelContext" in navigatorWithContext) return;
    try {
      Object.defineProperty(navigatorWithContext, "modelContext", {
        configurable: true,
        enumerable: false,
        get: () => document.modelContext,
      });
    } catch {
      // Older browsers may expose a non-extensible Navigator; feature
      // detection remains available through document.modelContext.
    }

    const windowWithAi = window as Window & { ai?: { modelContext?: unknown } };
    if (!("ai" in windowWithAi)) {
      try {
        Object.defineProperty(windowWithAi, "ai", {
          configurable: true,
          enumerable: false,
          get: () => ({ modelContext: document.modelContext }),
        });
      } catch {
        // Keep the native document.modelContext path when Window is locked.
      }
    }
  }, []);
  return null;
}
