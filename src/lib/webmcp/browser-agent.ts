import { createOpenAI } from "@ai-sdk/openai";
import {
  dynamicTool,
  generateText,
  jsonSchema,
  stepCountIs,
  type ModelMessage,
} from "ai";

import { useStudio } from "@/lib/studio/store";
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
  run: (input: unknown) => Promise<unknown>;
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
          run: async (input) => {
            const raw = await mc.executeTool!(t, JSON.stringify(input ?? {}));
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
        run: async (input) => {
          try {
            const result = await spec.execute(
              (input ?? {}) as Record<string, unknown>,
            );
            if (spec.annotations?.readOnlyHint) {
              useStudio.getState().logActivity({
                actor: "agent",
                label: spec.readLabel ?? spec.name,
                tool: spec.name,
                args: input,
              });
            }
            return result;
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error);
            useStudio.getState().logActivity({
              actor: "agent",
              label: `${spec.name} failed`,
              tool: spec.name,
              args: input,
              error: message,
            });
            return { isError: true, error: message };
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
        execute: async (input) => {
          options.onEvent({
            type: "tool",
            text: `${t.name} ${summarize(input)}`,
          });
          return t.run(input);
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

function summarize(input: unknown) {
  if (!input || typeof input !== "object") return "";
  const text = JSON.stringify(input);
  return text === "{}" ? "" : text.length > 90 ? text.slice(0, 87) + "…" : text;
}
