import { nanoid } from "nanoid";
import { temporal } from "zundo";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import { defaultSong } from "./song";
import { parseSong } from "./song-schema";
import type { ActivityEntry, Actor, Selection, Song } from "./types";

export interface PendingConfirm {
  id: string;
  title: string;
  description: string;
}

export interface StudioState {
  song: Song;
  selection: Selection | null;
  selectedTrackId: string | null;
  selectMode: boolean;
  playing: boolean;
  currentStep: number;
  audioReady: boolean;
  activity: ActivityEntry[];
  pendingConfirm: PendingConfirm | null;

  /** Apply a validated change to the song. Throws (and leaves the song untouched) if `mutate` throws. */
  commit: (
    actor: Actor,
    label: string,
    mutate: (draft: Song) => void,
    meta?: { tool?: string; args?: unknown; step?: number },
  ) => void;
  logActivity: (entry: Omit<ActivityEntry, "id" | "at">) => void;
  loadSong: (song: Song, label: string, actor?: Actor) => void;
  revertTo: (song: Song, label: string) => void;
  setSelection: (selection: Selection | null) => void;
  setSelectedTrack: (trackId: string | null) => void;
  setSelectMode: (on: boolean) => void;
  setPlaying: (playing: boolean) => void;
  setCurrentStep: (step: number) => void;
  setAudioReady: (ready: boolean) => void;
  /** Resolves false when the human declines, 60 s pass, or `signal` aborts. */
  requestConfirmation: (
    title: string,
    description: string,
    signal?: AbortSignal,
  ) => Promise<boolean>;
  resolveConfirmation: (id: string, ok: boolean) => void;
}

const MAX_ACTIVITY = 150;

const confirmResolvers = new Map<string, (ok: boolean) => void>();

export const useStudio = create<StudioState>()(
  persist(
    temporal(
      (set, get) => ({
        song: defaultSong(),
        selection: null,
        selectedTrackId: null,
        selectMode: false,
        playing: false,
        currentStep: -1,
        audioReady: false,
        activity: [],
        pendingConfirm: null,

        commit: (actor, label, mutate, meta) => {
          const before = get().song;
          const draft = structuredClone(before);
          mutate(draft);
          if (actor === "agent") {
            // Mark rows the agent touched so the UI can flash them.
            for (const track of draft.tracks) {
              const previous = before.tracks.find((t) => t.id === track.id);
              if (
                !previous ||
                JSON.stringify(previous) !== JSON.stringify(track)
              ) {
                track.lastAgentEditAt = Date.now();
              }
            }
          }
          set({ song: draft });
          get().logActivity({
            actor,
            label,
            tool: meta?.tool,
            args: meta?.args,
            step: meta?.step,
            before,
            after: draft,
          });
        },

        logActivity: (entry) => {
          const item: ActivityEntry = {
            id: nanoid(6),
            at: Date.now(),
            ...entry,
          };
          set((state) => ({
            activity: [item, ...state.activity].slice(0, MAX_ACTIVITY),
          }));
        },

        loadSong: (song, label, actor = "human") => {
          const before = get().song;
          set({ song, selection: null, selectedTrackId: null });
          get().logActivity({ actor, label, before, after: song });
        },

        revertTo: (song, label) => {
          const before = get().song;
          const after = structuredClone(song);
          set({ song: after, selection: null });
          get().logActivity({ actor: "human", label, before, after });
        },

        setSelection: (selection) => set({ selection }),
        setSelectedTrack: (trackId) => set({ selectedTrackId: trackId }),
        setSelectMode: (on) => set({ selectMode: on }),
        setPlaying: (playing) =>
          set({ playing, currentStep: playing ? get().currentStep : -1 }),
        setCurrentStep: (step) => set({ currentStep: step }),
        setAudioReady: (ready) => set({ audioReady: ready }),

        requestConfirmation: (title, description, signal) => {
          const id = nanoid(6);
          if (signal?.aborted) return Promise.resolve(false);
          return new Promise<boolean>((resolve) => {
            confirmResolvers.set(id, resolve);
            set({ pendingConfirm: { id, title, description } });
            setTimeout(() => get().resolveConfirmation(id, false), 60_000);
            signal?.addEventListener(
              "abort",
              () => get().resolveConfirmation(id, false),
              { once: true },
            );
          });
        },

        resolveConfirmation: (id, ok) => {
          const resolve = confirmResolvers.get(id);
          if (!resolve) return;
          confirmResolvers.delete(id);
          if (get().pendingConfirm?.id === id) set({ pendingConfirm: null });
          resolve(ok);
        },
      }),
      {
        limit: 100,
        partialize: (state) => ({ song: state.song }) as StudioState,
        equality: (past, current) => past.song === current.song,
      },
    ),
    {
      name: "duet-studio-v1",
      partialize: (state) => ({ song: state.song }),
      // localStorage is just another untrusted input: repair what we can, otherwise start fresh.
      merge: (persisted, current) => {
        const song = (persisted as { song?: unknown } | undefined)?.song;
        if (song === undefined) return current;
        try {
          return { ...current, song: parseSong(song) };
        } catch {
          return current;
        }
      },
    },
  ),
);

export const studioHistory = useStudio.temporal;

export function undo(actor: Actor = "human") {
  const { pastStates } = studioHistory.getState();
  if (pastStates.length === 0) return false;
  const before = useStudio.getState().song;
  studioHistory.getState().undo();
  const after = useStudio.getState().song;
  useStudio.getState().logActivity({
    actor,
    label: "Undo",
    before,
    after,
    tool: actor === "agent" ? "undo" : undefined,
  });
  return true;
}

export function redo(actor: Actor = "human") {
  const { futureStates } = studioHistory.getState();
  if (futureStates.length === 0) return false;
  const before = useStudio.getState().song;
  studioHistory.getState().redo();
  const after = useStudio.getState().song;
  useStudio.getState().logActivity({
    actor,
    label: "Redo",
    before,
    after,
    tool: actor === "agent" ? "redo" : undefined,
  });
  return true;
}
