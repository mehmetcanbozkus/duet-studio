import { runTool, type ToolSpec } from "./tools";
import type { ModelContext, ToolExecuteOptions, ToolResult } from "./types";

function safeStringify(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** Whatever a tool returns becomes one MCP text block; strings stay as they are. */
export function toToolResult(value: unknown): ToolResult {
  if (value === undefined || value === null) return { content: [] };
  if (typeof value === "string")
    return { content: [{ type: "text", text: value }] };
  return { content: [{ type: "text", text: safeStringify(value) }] };
}

/** Every failure is an explicit `isError` result so the agent never reads a throw as success. */
export function toErrorResult(error: unknown): ToolResult {
  const text =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : safeStringify(error);
  return { content: [{ type: "text", text }], isError: true };
}

/** Run a tool the way a host calls it: validated, logged, result shaped as MCP content. */
export async function runToolForHost(
  spec: ToolSpec,
  input: unknown,
  options: ToolExecuteOptions = {},
): Promise<ToolResult> {
  try {
    return toToolResult(await runTool(spec, input, options));
  } catch (error) {
    return toErrorResult(error);
  }
}

/**
 * Register one tool spec with the host. Aborting `signal` unregisters it. Resolves once the host has
 * accepted the tool; rejects with the host's DOMException (AbortError when the signal fires first,
 * NotAllowedError under a `tools` permissions policy, InvalidStateError on a duplicate name).
 */
export async function registerSpec(
  mc: ModelContext,
  spec: ToolSpec,
  signal: AbortSignal,
) {
  await mc.registerTool(
    {
      name: spec.name,
      title: spec.title,
      description: spec.description,
      inputSchema: spec.inputSchema,
      annotations: spec.annotations,
      // Chromium 151 passes `{}` as options, hence the defensive access.
      execute: (input, options) => runToolForHost(spec, input, options ?? {}),
    },
    { signal },
  );
}
