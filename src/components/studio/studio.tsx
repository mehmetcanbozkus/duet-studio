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
import { readSongFromHash } from "@/lib/studio/share";
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

  // Load a shared song from the URL hash.
  useEffect(() => {
    const shared = readSongFromHash();
    if (!shared) return;
    window.history.replaceState(null, "", window.location.pathname);
    if ("song" in shared) {
      loadSong(shared.song, "Opened a shared song");
      toast.success(`Loaded "${shared.song.title}" from the link`);
    } else {
      toast.error("That link does not contain a valid song.");
    }
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
      {!audioReady && (
        <p className="bg-muted/60 text-muted-foreground border-b px-4 py-1.5 text-center text-xs">
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
