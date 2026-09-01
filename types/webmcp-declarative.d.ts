import "react";

declare module "react" {
  interface FormHTMLAttributes<T> {
    toolname?: string;
    tooldescription?: string;
    toolautosubmit?: string;
  }

  interface InputHTMLAttributes<T> {
    toolparamdescription?: string;
  }

  interface SelectHTMLAttributes<T> {
    toolparamdescription?: string;
  }

  interface TextareaHTMLAttributes<T> {
    toolparamdescription?: string;
  }
}

declare global {
  interface SubmitEvent {
    readonly agentInvoked?: boolean;
    respondWith?(result: Promise<unknown>): void;
  }

  interface ToolActivationEvent extends Event {
    readonly toolName: string;
  }

  interface WindowEventMap {
    toolactivated: ToolActivationEvent;
    toolcancel: ToolActivationEvent;
  }

  namespace WebMCP {
    interface ModelContext {
      executeTool(tool: RegisteredTool, input: string, options?: { signal?: AbortSignal }): Promise<unknown>;
    }
  }
}

export {};
