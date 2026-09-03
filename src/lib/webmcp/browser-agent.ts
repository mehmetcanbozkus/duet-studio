import { createOpenAI } from "@ai-sdk/openai";
import {
  dynamicTool,
  generateText,
  jsonSchema,
  stepCountIs,
  type ModelMessage,
} from "ai";

import { useStudio } from "@/lib/studio/store";
import { runTrackedTool } from "@/lib/webmcp/register";
import { TOOLS } from "@/lib/webmcp/tools";
import { getModelContext, type RegisteredTool } from "@/lib/webmcp/types";

export const DEFAULT_MODEL = "gpt-5.6";

export const SYSTEM_PROMPT = `You are a music producer collaborating live with a human inside Duet Studio, a browser step sequencer.
You work through tools. Start every turn by calling get_song so you know what the human currently has (they edit the grid while you work).
Keep edits musical and incremental: respect the key and scale, keep the kick and snare relationship coherent, and prefer changing what was asked over rewriting everything.
Steps are 0-indexed 16th notes, 16 per bar. Drum patterns use X (accent), x (hit), o (soft), . (rest).
If the human has a selection, act on exactly that range with edit_selection.
After making changes, reply in one or two short sentences describing what you did and one idea for what they could try next. Do not paste patterns back to the human.`;

export interface AgentEvent {
  type: "tool" | "text" | "error";
  text: string;
}

interface DiscoveredTool {
  name: string;
  description: string;
  inputSchema: object;
  run: (input: unknown, signal?: AbortSignal) => Promise<unknown>;
}

/**
 * Chromium 151 wants executeTool's input as a JSON string (an object fails with "Failed to parse
 * input arguments") while the spec draft says object. Try the string form first and fall back once
 * if this host is on the spec side; the parse error happens before the tool runs, so nothing is
 * executed twice.
 */
async function executeRegistered(
  mc: NonNullable<ReturnType<typeof getModelContext>>,
  tool: RegisteredTool,
  input: unknown,
  signal?: AbortSignal,
) {
  const args = input ?? {};
  try {
    return await mc.executeTool!(tool, JSON.stringify(args), { signal });
  } catch (error) {
    const parseFailure =
      error instanceof DOMException &&
      error.name === "UnknownError" &&
      /parse/i.test(error.message);
    if (!parseFailure) throw error;
    return mc.executeTool!(tool, args, { signal });
  }
}

/**
 * Discover the page's tools. Prefers the browser's WebMCP registry (getTools/executeTool) so the
 * built-in agent exercises the same path an external agent would; falls back to calling the tool
 * specs directly when the browser lacks WebMCP.
 */
async function discoverTools(): Promise<{
  tools: DiscoveredTool[];
  via: "webmcp" | "direct";
}> {
  const mc = getModelContext();
  if (
    mc &&
    typeof mc.getTools === "function" &&
    typeof mc.executeTool === "function"
  ) {
    try {
      const registered: RegisteredTool[] = await mc.getTools();
      return {
        via: "webmcp",
        tools: registered.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema ?? { type: "object", properties: {} },
          run: async (input, signal) => {
            const raw = await executeRegistered(mc, t, input, signal);
            try {
              return JSON.parse(raw) as unknown;
            } catch {
              return raw;
            }
          },
        })),
      };
    } catch (error) {
      console.warn(
        "[duet-studio] document.modelContext.getTools failed, calling tools directly",
        error,
      );
    }
  }
  const state = useStudio.getState();
  return {
    via: "direct",
    tools: TOOLS.filter((spec) => (spec.when ? spec.when(state) : true)).map(
      (spec) => ({
        name: spec.name,
        description: spec.description,
        inputSchema: spec.inputSchema,
        run: async (input, signal) => {
          try {
            return await runTrackedTool(spec, input, { signal });
          } catch (error) {
            return {
              isError: true,
              error: error instanceof Error ? error.message : String(error),
            };
          }
        },
      }),
    ),
  };
}

export async function runBrowserAgent(options: {
  apiKey: string;
  model: string;
  messages: ModelMessage[];
  onEvent: (event: AgentEvent) => void;
  signal?: AbortSignal;
}): Promise<ModelMessage[]> {
  const { tools, via } = await discoverTools();
  // Chromium 151 does not forward executeTool's signal into the tool's execute callback, so a Stop
  // while clear_song waits for approval would leave the dialog open. Decline it from here instead.
  options.signal?.addEventListener("abort", declinePendingConfirmation, {
    once: true,
  });
  options.onEvent({
    type: "text",
    text: `Discovered ${tools.length} tools via ${via === "webmcp" ? "document.modelContext" : "direct calls"}.`,
  });

  const openai = createOpenAI({ apiKey: options.apiKey });
  const toolSet = Object.fromEntries(
    tools.map((t) => [
      t.name,
      dynamicTool({
        description: t.description,
        inputSchema: jsonSchema<unknown>(
          t.inputSchema as Parameters<typeof jsonSchema>[0],
        ),
        execute: async (input, { abortSignal }) => {
          options.onEvent({
            type: "tool",
            text: `${t.name} ${summarize(input)}`,
          });
          // Stop in the panel aborts generateText; forward it so an open confirmation closes too.
          return t.run(input, abortSignal);
        },
      }),
    ]),
  );

  const result = await generateText({
    model: openai(options.model),
    system: SYSTEM_PROMPT,
    messages: options.messages,
    tools: toolSet,
    stopWhen: stepCountIs(14),
    abortSignal: options.signal,
  });

  if (result.text) options.onEvent({ type: "text", text: result.text });
  return [...options.messages, ...result.response.messages];
}

function declinePendingConfirmation() {
  const { pendingConfirm, resolveConfirmation } = useStudio.getState();
  if (pendingConfirm) resolveConfirmation(pendingConfirm.id, false);
}

function summarize(input: unknown) {
  if (!input || typeof input !== "object") return "";
  const text = JSON.stringify(input);
  return text === "{}" ? "" : text.length > 90 ? text.slice(0, 87) + "…" : text;
}
