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

export interface ModelContext extends EventTarget {
  registerTool(
    tool: ModelContextTool,
    options?: { signal?: AbortSignal; exposedTo?: string[] },
  ): Promise<void>;
  unregisterTool?(name: string): void;
  getTools?(options?: { fromOrigins?: string[] }): Promise<RegisteredTool[]>;
  executeTool?(
    tool: RegisteredTool,
    input?: string | object,
    options?: { signal?: AbortSignal },
  ): Promise<string>;
  ontoolchange: ((event: Event) => void) | null;
}

export function getModelContext(): ModelContext | null {
  if (typeof document === "undefined") return null;
  const doc = document as Document & { modelContext?: ModelContext };
  const nav = navigator as Navigator & { modelContext?: ModelContext };
  const mc = doc.modelContext ?? nav.modelContext ?? null;
  if (!mc || typeof mc.registerTool !== "function") return null;
  return mc;
}
