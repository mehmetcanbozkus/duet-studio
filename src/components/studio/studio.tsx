"use client";

import { useEffect } from "react";
import { toast } from "sonner";

import { AgentPanel } from "./agent-panel";
import { AgentTools } from "./agent-tools";
import { ActivityFeed } from "./activity-feed";
import { ConfirmDialog } from "./confirm-dialog";
import { Header } from "./header";
import { Safe } from "./safe";
import { Sequencer } from "./sequencer";
import { Sidebar } from "./sidebar";
import { Transport } from "./transport";
import { togglePlay, unlockAudio } from "@/lib/studio/playback";
import {
  fetchSharedSong,
  readShareId,
  readSongFromHash,
} from "@/lib/studio/share";
import { redo, undo, useStudio } from "@/lib/studio/store";

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.isContentEditable
  );
}

export function Studio() {
  const loadSong = useStudio((s) => s.loadSong);
  const setSelection = useStudio((s) => s.setSelection);
  const audioReady = useStudio((s) => s.audioReady);

  // Load a shared song: `?s=<id>` fetches it, the legacy `#song=` hash carries it inline.
  // Clearing the URL first also keeps React's double-mounted effect from loading twice.
  useEffect(() => {
    const clearUrl = () =>
      window.history.replaceState(null, "", window.location.pathname);

    const inline = readSongFromHash();
    if (inline) {
      clearUrl();
      if ("song" in inline) {
        loadSong(inline.song, "Opened a shared song");
        toast.success(`Loaded "${inline.song.title}" from the link`);
      } else {
        toast.error("That link does not contain a valid song.");
      }
      return;
    }

    const shareId = readShareId();
    if (!shareId) return;
    clearUrl();

    const pending = toast.loading("Loading the shared song…");
    void fetchSharedSong(shareId).then(
      (song) => {
        loadSong(song, "Opened a shared song");
        toast.success(`Loaded "${song.title}" from the link`, { id: pending });
      },
      (error: unknown) => {
        toast.error(
          error instanceof Error ? error.message : "Could not open that link.",
          { id: pending },
        );
      },
    );
  }, [loadSong]);

  // Any click unlocks the AudioContext so the agent can start playback later.
  useEffect(() => {
    const unlock = () => {
      void unlockAudio();
    };
    document.addEventListener("pointerdown", unlock, { once: true });
    return () => document.removeEventListener("pointerdown", unlock);
  }, []);

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      const mod = event.ctrlKey || event.metaKey;
      if (event.code === "Space") {
        event.preventDefault();
        void togglePlay();
      } else if (event.key === "Escape") {
        setSelection(null);
      } else if (mod && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (mod && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setSelection]);

  return (
    <div className="flex min-h-svh flex-1 flex-col">
      <Header />
      <Transport />
      {/* Floated out of the flow on purpose: an in-flow banner would shove the
          whole grid upwards the moment audio unlocks, which is a layout shift
          for anything measuring the page — a human or an agent. */}
      {!audioReady && (
        <p className="bg-muted/90 text-muted-foreground pointer-events-none fixed bottom-4 left-1/2 z-30 -translate-x-1/2 rounded-full border px-3 py-1.5 text-center text-xs shadow-sm backdrop-blur-sm">
          Click anywhere once to enable audio. After that your agent can start
          and stop playback too.
        </p>
      )}
      <div className="flex flex-1 flex-col gap-4 p-4 lg:flex-row">
        <div className="min-w-0 flex-1">
          <Sequencer />
        </div>
        <aside className="flex w-full shrink-0 flex-col gap-4 lg:w-80">
          <Sidebar />
          <Safe name="Built-in agent">
            <AgentPanel />
          </Safe>
          <ActivityFeed />
        </aside>
      </div>
      <ConfirmDialog />
      <Safe name="WebMCP tools" silent>
        <AgentTools />
      </Safe>
    </div>
  );
}
