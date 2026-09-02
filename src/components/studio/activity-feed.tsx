"use client";

import { Bot, History, RotateCcw, User } from "lucide-react";
import { useEffect, useState } from "react";

import { relativeTime } from "./time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useStudio } from "@/lib/studio/store";
import { cn } from "@/lib/utils";

export function ActivityFeed() {
  const activity = useStudio((s) => s.activity);
  const revertTo = useStudio((s) => s.revertTo);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 10_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <Card size="sm" className="flex min-h-0 flex-1 flex-col">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <History className="size-4" />
          Session
          <span className="text-muted-foreground font-normal">
            who did what
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 p-0">
        <ScrollArea className="h-[40vh] px-3 pb-3 lg:h-[calc(100vh-24rem)]">
          {activity.length === 0 ? (
            <p className="text-muted-foreground px-1 py-4 text-xs">
              Edits by you and your agent show up here, each with a way to
              revert.
            </p>
          ) : (
            <ol className="flex flex-col gap-1">
              {activity.map((entry) => {
                const agent = entry.actor === "agent";
                return (
                  <li
                    key={entry.id}
                    className={cn(
                      "group flex items-start gap-2 rounded-md border-l-2 px-2 py-1 text-xs",
                      agent ? "border-agent" : "border-human",
                      entry.error && "bg-destructive/5",
                    )}
                  >
                    {agent ? (
                      <Bot className="text-agent mt-0.5 size-3.5 shrink-0" />
                    ) : (
                      <User className="text-human mt-0.5 size-3.5 shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="font-medium">{entry.label}</span>
                        {entry.tool && (
                          <Badge
                            variant="outline"
                            className="font-mono text-[10px]"
                          >
                            {entry.tool}
                          </Badge>
                        )}
                      </div>
                      {entry.error && (
                        <p className="text-destructive mt-0.5">{entry.error}</p>
                      )}
                      <p className="text-muted-foreground mt-0.5">
                        {relativeTime(entry.at, now)}
                      </p>
                    </div>
                    {entry.before && (
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                        title="Revert to before this change"
                        onClick={() =>
                          entry.before &&
                          revertTo(entry.before, `Reverted "${entry.label}"`)
                        }
                      >
                        <RotateCcw />
                      </Button>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
