"use client";

import { useEffect } from "react";
import { toast } from "sonner";

import { useStudio } from "@/lib/studio/store";
import { registerSpec } from "@/lib/webmcp/register";
import { TOOLS, type ToolSpec } from "@/lib/webmcp/tools";
import { type ModelContext } from "@/lib/webmcp/types";
import { useModelContext } from "@/lib/webmcp/use-model-context";

function ToolRegistration({ mc, spec }: { mc: ModelContext; spec: ToolSpec }) {
  const enabled = useStudio((s) => (spec.when ? spec.when(s) : true));

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let active = true;
    registerSpec(mc, spec, controller.signal).catch((error: unknown) => {
      // Cleanup aborted the registration (StrictMode remount, tool disabled, unmount): expected.
      if (!active) return;
      if (error instanceof DOMException && error.name === "AbortError") return;
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[duet-studio] registerTool(${spec.name}) failed`, error);
      // One toast for the whole batch: a permissions-policy failure hits every tool at once.
      toast.error("The browser refused to register the agent tools", {
        id: "webmcp-register",
        description: message,
      });
    });
    return () => {
      active = false;
      // Aborting the signal is how WebMCP unregisters a tool.
      controller.abort();
    };
  }, [mc, spec, enabled]);

  return null;
}

/** Registers every WebMCP tool with the host once document.modelContext exists. Renders nothing. */
export function AgentTools() {
  const mc = useModelContext();
  if (!mc) return null;
  return (
    <>
      {TOOLS.map((spec) => (
        <ToolRegistration key={spec.name} mc={mc} spec={spec} />
      ))}
    </>
  );
}
