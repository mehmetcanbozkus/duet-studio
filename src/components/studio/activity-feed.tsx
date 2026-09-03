"use client";

import {
  Bot,
  ChevronDown,
  History,
  Play,
  RotateCcw,
  Square,
  User,
} from "lucide-react";
import { useEffect, useState } from "react";

import { relativeTime } from "./time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  activityDetails,
  activityReceipt,
} from "@/lib/studio/activity-receipt";
import { togglePlay } from "@/lib/studio/playback";
import { useStudio, type StudioState } from "@/lib/studio/store";
import type { ActivityEntry } from "@/lib/studio/types";
import { cn } from "@/lib/utils";

function ActivityItem({
  entry,
  now,
  playing,
  revertTo,
}: {
  entry: ActivityEntry;
  now: number;
  playing: boolean;
  revertTo: StudioState["revertTo"];
}) {
  const agent = entry.actor === "agent";
  const receipt = activityReceipt(entry);
  const details = activityDetails(entry);

  return (
    <li>
      <Collapsible
        className={cn(
          "group rounded-md border-l-2 text-xs",
          agent ? "border-agent" : "border-human",
          entry.error && "bg-destructive/5",
        )}
      >
        <div className="flex items-start gap-2 px-2 py-1">
          {agent ? (
            <Bot className="text-agent mt-0.5 size-3.5 shrink-0" />
          ) : (
            <User className="text-human mt-0.5 size-3.5 shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1">
              <span className="font-medium">{receipt}</span>
              {entry.tool && (
                <Badge variant="outline" className="font-mono text-[10px]">
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
          <div className="flex shrink-0 items-center gap-0.5">
            {details.length > 0 && (
              <CollapsibleTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Show details for ${receipt}`}
                    title="Show input and before/after"
                  />
                }
              >
                <ChevronDown />
              </CollapsibleTrigger>
            )}
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={playing ? "Stop current song" : "Play current song"}
              title={playing ? "Stop current song" : "Play current song"}
              onClick={() => void togglePlay()}
            >
              {playing ? <Square /> : <Play />}
            </Button>
            {entry.before && (
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Revert ${receipt}`}
                title="Revert to before this change"
                onClick={() =>
                  entry.before &&
                  revertTo(entry.before, `Reverted "${entry.label}"`)
                }
              >
                <RotateCcw />
              </Button>
            )}
          </div>
        </div>
        {details.length > 0 && (
          <CollapsibleContent
            data-activity-details="true"
            className="px-2 pb-2 pl-8"
          >
            <Separator className="mb-2" />
            <dl className="flex flex-col gap-2">
              {details.map((detail) => (
                <div key={detail.label}>
                  <dt className="text-muted-foreground text-[10px] font-medium uppercase">
                    {detail.label}
                  </dt>
                  <dd className="text-foreground/80 mt-0.5 font-mono text-[10px] leading-relaxed break-words whitespace-pre-wrap">
                    {detail.value}
                  </dd>
                </div>
              ))}
            </dl>
          </CollapsibleContent>
        )}
      </Collapsible>
    </li>
  );
}

export function ActivityFeed() {
  const activity = useStudio((s) => s.activity);
  const revertTo = useStudio((s) => s.revertTo);
  const playing = useStudio((s) => s.playing);
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
              {activity.map((entry) => (
                <ActivityItem
                  key={entry.id}
                  entry={entry}
                  now={now}
                  playing={playing}
                  revertTo={revertTo}
                />
              ))}
            </ol>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
