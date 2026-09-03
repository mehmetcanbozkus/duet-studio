"use client";

import { Bot, CheckCircle2, CircleAlert, Loader2 } from "lucide-react";
import { useEffect } from "react";
import { useShallow } from "zustand/react/shallow";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useStudio } from "@/lib/studio/store";
import { useWebMCPRuntime } from "@/lib/webmcp/runtime";
import { TOOLS } from "@/lib/webmcp/tools";
import { useModelContext } from "@/lib/webmcp/use-model-context";

export function useWebMCPStatus() {
  const supported = useModelContext() !== null;
  const names = useStudio(
    useShallow((state) =>
      TOOLS.filter((tool) => (tool.when ? tool.when(state) : true)).map(
        (tool) => tool.name,
      ),
    ),
  );
  const registrations = useWebMCPRuntime((state) => state.registrations);
  const readyCount = names.filter(
    (name) => registrations[name]?.status === "ready",
  ).length;
  const failedCount = names.filter(
    (name) => registrations[name]?.status === "error",
  ).length;

  return {
    supported,
    names,
    registrations,
    toolCount: readyCount,
    expectedCount: names.length,
    failedCount,
  };
}

export function AgentStatus() {
  const {
    supported,
    names,
    registrations,
    toolCount,
    expectedCount,
    failedCount,
  } = useWebMCPStatus();
  const execution = useWebMCPRuntime(
    (state) =>
      state.executions.find((item) => item.status === "in_progress") ??
      state.executions[0] ??
      null,
  );
  const clearFinishedExecutions = useWebMCPRuntime(
    (state) => state.clearFinishedExecutions,
  );

  useEffect(() => {
    if (!execution || execution.status === "in_progress") return;
    const timer = window.setTimeout(clearFinishedExecutions, 4_000);
    return () => window.clearTimeout(timer);
  }, [execution, clearFinishedExecutions]);

  const ready = supported && toolCount === expectedCount;
  const buttonLabel = execution
    ? execution.status === "in_progress"
      ? `${execution.title}…`
      : execution.status === "completed"
        ? `${execution.title} done`
        : execution.status === "canceled"
          ? `${execution.title} canceled`
          : `${execution.title} failed`
    : !supported
      ? "No agent detected"
      : failedCount > 0
        ? `${toolCount}/${expectedCount} agent tools ready`
        : ready
          ? `${toolCount} agent tools ready`
          : "Setting up agent tools…";

  const popoverTitle = execution
    ? execution.status === "in_progress"
      ? `${execution.title} is running`
      : execution.status === "completed"
        ? `${execution.title} completed`
        : execution.status === "canceled"
          ? `${execution.title} was canceled`
          : `${execution.title} failed`
    : !supported
      ? "WebMCP not available here"
      : failedCount > 0
        ? "Some agent tools are unavailable"
        : ready
          ? "WebMCP is ready"
          : "Registering agent tools";

  const popoverDescription = execution?.summary
    ? execution.summary
    : !supported
      ? "Open this page in ChatGPT's built-in browser, or in Chrome with chrome://flags/#enable-webmcp-testing turned on, and an agent will be able to play along."
      : failedCount > 0
        ? `${failedCount} tool${failedCount === 1 ? "" : "s"} failed to register. The remaining tools are still available.`
        : ready
          ? "Your browser's agent can read the song and edit it alongside you."
          : `Preparing ${expectedCount} tools for your browser's agent.`;

  return (
    <Popover>
      <PopoverTrigger
        render={<Button variant={ready ? "secondary" : "outline"} size="sm" />}
      >
        {execution?.status === "in_progress" ? (
          <Loader2
            data-icon="inline-start"
            className="text-agent animate-spin"
          />
        ) : execution?.status === "completed" ? (
          <CheckCircle2 data-icon="inline-start" className="text-agent" />
        ) : execution?.status === "error" ? (
          <CircleAlert data-icon="inline-start" className="text-destructive" />
        ) : (
          <Bot
            data-icon="inline-start"
            className={ready ? "text-agent" : "text-muted-foreground"}
          />
        )}
        {buttonLabel}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 text-sm">
        <PopoverHeader>
          <PopoverTitle>{popoverTitle}</PopoverTitle>
          <PopoverDescription>{popoverDescription}</PopoverDescription>
        </PopoverHeader>
        {supported && (
          <div className="mt-3 flex flex-wrap gap-1">
            {names.map((name) => {
              const status = registrations[name]?.status ?? "registering";
              return (
                <Badge
                  key={name}
                  variant={
                    status === "ready"
                      ? "secondary"
                      : status === "error"
                        ? "destructive"
                        : "outline"
                  }
                  className="font-mono text-[11px]"
                  aria-label={`${name}: ${status}`}
                  title={registrations[name]?.error}
                >
                  {status === "ready" ? (
                    <CheckCircle2 />
                  ) : status === "error" ? (
                    <CircleAlert />
                  ) : (
                    <Loader2 className="animate-spin" />
                  )}
                  {name}
                </Badge>
              );
            })}
          </div>
        )}
        <p className="text-muted-foreground mt-3 text-xs">
          Tip: select a range of steps with <Kbd>Shift</Kbd> + drag and an extra
          tool appears so the agent can act on exactly that range.
        </p>
      </PopoverContent>
    </Popover>
  );
}
