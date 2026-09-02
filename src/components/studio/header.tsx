"use client";

import { Code2, Music2, Share2 } from "lucide-react";
import { toast } from "sonner";

import { AgentStatus } from "./agent-status";
import { ModeToggle } from "@/components/theme/mode-toggle";
import { Button } from "@/components/ui/button";
import { songShareUrl } from "@/lib/studio/share";
import { useStudio } from "@/lib/studio/store";

export const REPO_URL = "https://github.com/mehmetcanbozkus/duet-studio";

export function Header() {
  const title = useStudio((s) => s.song.title);
  const commit = useStudio((s) => s.commit);

  const share = async () => {
    const url = songShareUrl(useStudio.getState().song);
    try {
      await navigator.clipboard.writeText(url);
      toast.success(
        "Share link copied. Anyone opening it gets this exact song.",
      );
    } catch {
      window.prompt("Copy this link", url);
    }
  };

  return (
    <header className="bg-background/90 sticky top-0 z-20 border-b backdrop-blur-lg">
      <div className="flex h-14 items-center gap-3 px-4">
        <div className="flex items-center gap-2">
          <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-lg">
            <Music2 className="size-4" />
          </span>
          <span className="hidden text-sm font-semibold sm:inline">
            Duet Studio
          </span>
        </div>
        <input
          aria-label="Song title"
          className="focus-visible:ring-ring/50 min-w-0 flex-1 rounded-md bg-transparent px-2 py-1 text-base font-medium outline-none focus-visible:ring-2 sm:max-w-xs"
          value={title}
          onChange={(e) =>
            commit("human", "Renamed the song", (draft) => {
              draft.title = e.target.value.slice(0, 60);
            })
          }
        />
        <div className="ml-auto flex items-center gap-2">
          <AgentStatus />
          <Button variant="outline" size="sm" onClick={share}>
            <Share2 data-icon="inline-start" />
            Share
          </Button>
          <Button
            variant="ghost"
            size="icon"
            nativeButton={false}
            render={
              <a
                href={REPO_URL}
                target="_blank"
                rel="noreferrer"
                aria-label="Source on GitHub"
              />
            }
          >
            <Code2 />
          </Button>
          <ModeToggle />
        </div>
      </div>
    </header>
  );
}
