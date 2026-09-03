import { stepRangeLabel } from "@/lib/studio/format";
import { findTrack } from "@/lib/studio/song";
import { useStudio } from "@/lib/studio/store";
import { STEPS_PER_BAR } from "@/lib/studio/types";

import { runTool, type ToolSpec } from "./tools";
import { useWebMCPRuntime, type ToolExecutionTarget } from "./runtime";
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

function resultSummary(value: unknown, fallback: string) {
  if (typeof value === "object" && value !== null && "message" in value) {
    const message = (value as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return `${fallback} completed.`;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : safeStringify(error);
}

function isCanceled(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function executionTarget(
  tool: string,
  input: unknown,
): ToolExecutionTarget | undefined {
  const studio = useStudio.getState();
  const args =
    typeof input === "object" && input !== null
      ? (input as Record<string, unknown>)
      : {};

  if (tool === "edit_selection" && studio.selection) {
    const { trackId, from, to } = studio.selection;
    const track = studio.song.tracks.find((item) => item.id === trackId);
    if (!track) return undefined;
    return {
      trackIds: [trackId],
      label: `${track.name} · ${stepRangeLabel(from, to)}`,
      from,
      to,
    };
  }

  let trackIds: string[] = [];
  let label = "";
  if (args.track !== undefined) {
    try {
      const track = findTrack(studio.song, String(args.track));
      trackIds = [track.id];
      label = track.name;
    } catch {
      return undefined;
    }
  } else if (
    tool === "clear_song" ||
    tool === "humanize" ||
    (tool === "set_song_meta" && args.bars !== undefined)
  ) {
    trackIds = studio.song.tracks.map((track) => track.id);
    label = "All tracks";
  }

  if (!label) return undefined;
  if (tool === "set_drum_pattern") {
    const bar = Number(args.bar);
    if (Number.isInteger(bar) && bar > 0) {
      const from = (bar - 1) * STEPS_PER_BAR;
      const to = from + STEPS_PER_BAR - 1;
      return {
        trackIds,
        label: `${label} · ${stepRangeLabel(from, to)}`,
        from,
        to,
      };
    }
  }
  return { trackIds, label };
}

/** Run a tool while exposing its page-local lifecycle to the human-facing UI. */
export async function runTrackedTool(
  spec: ToolSpec,
  input: unknown,
  options: ToolExecuteOptions = {},
) {
  const runtime = useWebMCPRuntime.getState();
  const executionId = runtime.startExecution(
    spec.name,
    spec.title,
    executionTarget(spec.name, input),
  );
  try {
    const value = await runTool(spec, input, options);
    runtime.finishExecution(
      executionId,
      "completed",
      resultSummary(value, spec.title),
    );
    return value;
  } catch (error) {
    runtime.finishExecution(
      executionId,
      isCanceled(error) ? "canceled" : "error",
      isCanceled(error) ? `${spec.title} canceled.` : errorMessage(error),
    );
    throw error;
  }
}

/** Run a tool the way a host calls it: validated, logged, result shaped as MCP content. */
export async function runToolForHost(
  spec: ToolSpec,
  input: unknown,
  options: ToolExecuteOptions = {},
): Promise<ToolResult> {
  try {
    return toToolResult(await runTrackedTool(spec, input, options));
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
