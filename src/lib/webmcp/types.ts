/**
 * WebMCP typing for this app.
 *
 * The spec shape comes from the official `webmcp-types` package (loaded globally in
 * src/types/webmcp.d.ts): `document.modelContext` is an EventTarget with registerTool/getTools and a
 * `toolchange` event. Real hosts differ. ChatGPT's built-in browser documents registerTool only,
 * while Chromium exposes getTools/executeTool for our built-in agent and smoke test. So the official
 * pieces are re-exported as-is and `ModelContext` is loosened to what can be relied on: everything
 * beyond registerTool is optional and must be feature-checked.
 */

/** Added to the spec after webmcp-types 0.1.6 was published. */
export type ToolAnnotations = WebMCP.ToolAnnotations & {
  consequentialHint?: boolean;
};
export type ModelContextTool = WebMCP.ModelContextTool;
export type RegisteredTool = WebMCP.RegisteredTool;
/** Chromium 151 passes an empty object here, so treat `signal` as optional at runtime. */
export type ToolExecuteOptions = Partial<WebMCP.ToolExecuteCallbackOptions>;

/** The JSON Schema subset used by the tool specs and enforced by `validateInput`. */
export interface SchemaNode {
  type?: string | string[];
  description?: string;
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  items?: SchemaNode;
  properties?: Record<string, SchemaNode>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface JsonSchema extends SchemaNode {
  type: "object";
  properties: Record<string, SchemaNode>;
}

/** MCP-shaped result that `execute` hands back to the host. */
export interface ToolResult {
  content: { type: "text"; text: string }[];
  isError?: boolean;
}

export type ModelContext = Pick<WebMCP.ModelContext, "registerTool"> &
  Partial<
    Pick<
      WebMCP.ModelContext,
      "getTools" | "ontoolchange" | "addEventListener" | "removeEventListener"
    >
  > & {
    /**
     * Present in the current spec but not yet in webmcp-types: run a registered tool from page
     * script. The spec accepts an object; Chromium 151 requires a JSON string.
     */
    executeTool?(
      tool: RegisteredTool,
      input?: string | object,
      options?: { signal?: AbortSignal },
    ): Promise<string>;
  };

/**
 * The host's model context, or null when there is none. Always `await` registerTool rather than
 * chaining `.then`: the spec returns a Promise but some hosts return undefined.
 */
export function getModelContext(): ModelContext | null {
  if (typeof document === "undefined") return null;
  try {
    // Early builds exposed the API on navigator; the spec puts it on document.
    const nav = navigator as Navigator & { modelContext?: ModelContext };
    const mc = document.modelContext ?? nav.modelContext ?? null;
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
