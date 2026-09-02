"use client";

import { useWebMCP } from "use-webmcp-tool";

import { useStudio } from "@/lib/studio/store";
import { TOOLS, type ToolSpec } from "@/lib/webmcp/tools";

function RegisteredTool({ spec }: { spec: ToolSpec }) {
  const enabled = useStudio((s) => (spec.when ? spec.when(s) : true));
  const logActivity = useStudio((s) => s.logActivity);

  useWebMCP<Record<string, unknown>, unknown>({
    name: spec.name,
    description: spec.description,
    inputSchema: spec.inputSchema,
    annotations: spec.annotations,
    enabled,
    execute: async (args) => {
      try {
        const result = await spec.execute(args);
        if (spec.annotations?.readOnlyHint) {
          logActivity({
            actor: "agent",
            label: spec.readLabel ?? `Called ${spec.name}`,
            tool: spec.name,
            args,
          });
        }
        return result;
      } catch (error) {
        logActivity({
          actor: "agent",
          label: `${spec.name} failed`,
          tool: spec.name,
          args,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
  });

  return null;
}

/** Registers every WebMCP tool with the browser. Renders nothing. */
export function AgentTools() {
  return (
    <>
      {TOOLS.map((spec) => (
        <RegisteredTool key={spec.name} spec={spec} />
      ))}
    </>
  );
}
