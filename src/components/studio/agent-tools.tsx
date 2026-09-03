"use client";

import { useEffect } from "react";
import { toast } from "sonner";

import { useStudio } from "@/lib/studio/store";
import { registerSpec } from "@/lib/webmcp/register";
import { useWebMCPRuntime } from "@/lib/webmcp/runtime";
import { TOOLS, type ToolSpec } from "@/lib/webmcp/tools";
import { type ModelContext } from "@/lib/webmcp/types";
import { useModelContext } from "@/lib/webmcp/use-model-context";

function ToolRegistration({ mc, spec }: { mc: ModelContext; spec: ToolSpec }) {
  const enabled = useStudio((s) => (spec.when ? spec.when(s) : true));
  const setRegistration = useWebMCPRuntime((s) => s.setRegistration);
  const removeRegistration = useWebMCPRuntime((s) => s.removeRegistration);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let active = true;
    setRegistration(spec.name, { status: "registering" });
    registerSpec(mc, spec, controller.signal)
      .then(() => {
        if (active) setRegistration(spec.name, { status: "ready" });
      })
      .catch((error: unknown) => {
        // Cleanup aborted the registration (StrictMode remount, tool disabled, unmount): expected.
        if (!active) return;
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        const message = error instanceof Error ? error.message : String(error);
        setRegistration(spec.name, { status: "error", error: message });
        console.warn(`[duet-studio] registerTool(${spec.name}) failed`, error);
        // One toast for the whole batch: a permissions-policy failure hits every tool at once.
        toast.error("The browser refused to register the agent tools", {
          id: "webmcp-register",
          description: message,
        });
      });
    return () => {
      active = false;
      removeRegistration(spec.name);
      // Aborting the signal is how WebMCP unregisters a tool.
      controller.abort();
    };
  }, [mc, spec, enabled, removeRegistration, setRegistration]);

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
