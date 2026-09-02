"use client";

import { useWebMCP } from "use-webmcp-tool";

import { useStudio } from "@/lib/studio/store";
import { TOOLS, runTool, type ToolSpec } from "@/lib/webmcp/tools";

function RegisteredTool({ spec }: { spec: ToolSpec }) {
  const enabled = useStudio((s) => (spec.when ? spec.when(s) : true));

  useWebMCP<Record<string, unknown>, unknown>({
    name: spec.name,
    description: spec.description,
    inputSchema: spec.inputSchema,
    annotations: spec.annotations,
    enabled,
    // runTool validates, logs and rethrows; the hook turns the throw into an isError result.
    execute: (args) => runTool(spec, args),
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
