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
import { onToolChange } from "@/lib/webmcp/types";
import { useModelContext } from "@/lib/webmcp/use-model-context";

export function useWebMCPStatus() {
  const mc = useModelContext();
  const supported = mc !== null;
  const [browserCount, setBrowserCount] = useState<number | null>(null);
  const enabledCount = useStudio(
    (s) => TOOLS.filter((t) => (t.when ? t.when(s) : true)).length,
  );

  // Ask the browser how many tools it sees. Chromium fires `toolchange`; hosts without events or
  // without getTools (ChatGPT's built-in browser) fall back to our own enabled-tool count.
  useEffect(() => {
    if (!mc || typeof mc.getTools !== "function") return;
    const getTools = mc.getTools.bind(mc);
    let cancelled = false;
    const refresh = () => {
      try {
        Promise.resolve(getTools())
          .then((tools) => {
            if (!cancelled && Array.isArray(tools))
              setBrowserCount(tools.length);
          })
          .catch(() => undefined);
      } catch {
        // host exposes getTools but it is not usable; keep the local count
      }
    };
    // Registration happens in sibling effects; let them finish first.
    const timer = setTimeout(refresh, 50);
    const unsubscribe = onToolChange(mc, refresh);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      unsubscribe();
    };
  }, [mc, enabledCount]);

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
