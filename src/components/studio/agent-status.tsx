"use client";

import { Bot } from "lucide-react";
import { useEffect, useState } from "react";
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
import { TOOLS } from "@/lib/webmcp/tools";
import { getModelContext } from "@/lib/webmcp/types";

export function useWebMCPStatus() {
  const [supported] = useState(() => getModelContext() !== null);
  const [browserCount, setBrowserCount] = useState<number | null>(null);
  const enabledCount = useStudio(
    (s) => TOOLS.filter((t) => (t.when ? t.when(s) : true)).length,
  );

  useEffect(() => {
    const mc = getModelContext();
    if (!mc || typeof mc.getTools !== "function") return;
    let cancelled = false;
    const refresh = () => {
      mc.getTools?.()
        .then((tools) => {
          if (!cancelled) setBrowserCount(tools.length);
        })
        .catch(() => undefined);
    };
    refresh();
    mc.addEventListener("toolchange", refresh);
    return () => {
      cancelled = true;
      mc.removeEventListener("toolchange", refresh);
    };
  }, []);

  return { supported, toolCount: browserCount ?? enabledCount };
}

export function AgentStatus() {
  const { supported, toolCount } = useWebMCPStatus();
  const names = useStudio(
    useShallow((s) =>
      TOOLS.filter((t) => (t.when ? t.when(s) : true)).map((t) => t.name),
    ),
  );

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant={supported ? "secondary" : "outline"} size="sm" />
        }
      >
        <Bot
          data-icon="inline-start"
          className={supported ? "text-agent" : "text-muted-foreground"}
        />
        {supported ? `${toolCount} agent tools live` : "No agent detected"}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 text-sm">
        <PopoverHeader>
          <PopoverTitle>
            {supported ? "WebMCP is active" : "WebMCP not available here"}
          </PopoverTitle>
          <PopoverDescription>
            {supported
              ? "This page registered its tools with document.modelContext. Your browser's agent can read the song and edit it alongside you."
              : "Open this page in ChatGPT's built-in browser, or in Chrome with chrome://flags/#enable-webmcp-testing turned on, and an agent will be able to play along."}
          </PopoverDescription>
        </PopoverHeader>
        <div className="mt-3 flex flex-wrap gap-1">
          {names.map((name) => (
            <Badge
              key={name}
              variant="outline"
              className="font-mono text-[11px]"
            >
              {name}
            </Badge>
          ))}
        </div>
        <p className="text-muted-foreground mt-3 text-xs">
          Tip: select a range of steps with <Kbd>Shift</Kbd> + drag and an extra
          tool appears so the agent can act on exactly that range.
        </p>
      </PopoverContent>
    </Popover>
  );
}
