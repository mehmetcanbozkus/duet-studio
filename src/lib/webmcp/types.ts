/** Minimal typings for the WebMCP imperative API (document.modelContext). */

export interface ToolAnnotations {
  readOnlyHint?: boolean;
  untrustedContentHint?: boolean;
}

export interface JsonSchema {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface ModelContextTool<Input = Record<string, unknown>> {
  name: string;
  title?: string;
  description: string;
  inputSchema: JsonSchema;
  annotations?: ToolAnnotations;
  execute: (
    input: Input,
    options?: { signal?: AbortSignal },
  ) => Promise<unknown>;
}

export interface RegisteredTool {
  name: string;
  description: string;
  title?: string;
  inputSchema?: object;
  origin: string;
  annotations?: ToolAnnotations;
}

/**
 * Hosts differ in how much of the spec they implement. Chromium's ModelContext is an EventTarget with
 * getTools/executeTool and a `toolchange` event; ChatGPT's built-in browser documents registerTool
 * only. Everything beyond registerTool is therefore optional and must be feature-checked.
 */
export interface ModelContext {
  registerTool(
    tool: ModelContextTool,
    options?: { signal?: AbortSignal; exposedTo?: string[] },
  ): Promise<void> | void;
  unregisterTool?(name: string): void;
  getTools?(options?: { fromOrigins?: string[] }): Promise<RegisteredTool[]>;
  executeTool?(
    tool: RegisteredTool,
    input?: string | object,
    options?: { signal?: AbortSignal },
  ): Promise<string>;
  addEventListener?: EventTarget["addEventListener"];
  removeEventListener?: EventTarget["removeEventListener"];
  ontoolchange?: ((event: Event) => void) | null;
}

export function getModelContext(): ModelContext | null {
  if (typeof document === "undefined") return null;
  try {
    const doc = document as Document & { modelContext?: ModelContext };
    const nav = navigator as Navigator & { modelContext?: ModelContext };
    const mc = doc.modelContext ?? nav.modelContext ?? null;
    if (!mc || typeof mc.registerTool !== "function") return null;
    return mc;
  } catch {
    return null;
  }
}

/** Subscribe to `toolchange` where the host supports events. Returns an unsubscribe function. */
export function onToolChange(mc: ModelContext, handler: () => void) {
  if (
    typeof mc.addEventListener !== "function" ||
    typeof mc.removeEventListener !== "function"
  ) {
    return () => undefined;
  }
  try {
    mc.addEventListener("toolchange", handler);
  } catch {
    return () => undefined;
  }
  return () => {
    try {
      mc.removeEventListener?.("toolchange", handler);
    } catch {
      // host went away
    }
  };
}
