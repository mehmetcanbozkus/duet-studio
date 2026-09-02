"use client";

import { Headphones, MoreHorizontal, Trash2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Slider } from "@/components/ui/slider";
import { Toggle } from "@/components/ui/toggle";
import { INSTRUMENT_BY_ID } from "@/lib/studio/instruments";
import { getEngine } from "@/lib/studio/playback";
import { useStudio } from "@/lib/studio/store";
import {
  isInScale,
  midiToNote,
  normalizePitchClass,
} from "@/lib/studio/theory";
import {
  STEPS_PER_BAR,
  totalSteps,
  type Actor,
  type DrumTrack,
  type MelodicTrack,
  type Track,
} from "@/lib/studio/types";
import { cn } from "@/lib/utils";

const CELL_W = 32;
const GUTTER_W = 192;

function stepBorder(step: number) {
  if (step % STEPS_PER_BAR === 0) return "border-l-2 border-l-foreground/40";
  if (step % 4 === 0) return "border-l border-l-foreground/25";
  return "border-l border-l-border/60";
}

function actorColor(actor: Actor | null | undefined) {
  if (actor === "agent") return "bg-agent";
  if (actor === "human") return "bg-human";
  return "bg-foreground/70";
}

/* ---------------------------------- selection ---------------------------------- */

const drag: { trackId: string | null; anchor: number } = {
  trackId: null,
  anchor: 0,
};

function useSelectionGestures() {
  const setSelection = useStudio((s) => s.setSelection);
  const selectMode = useStudio((s) => s.selectMode);

  useEffect(() => {
    const end = () => {
      drag.trackId = null;
    };
    window.addEventListener("pointerup", end);
    return () => window.removeEventListener("pointerup", end);
  }, []);

  const isSelectGesture = (event: { shiftKey: boolean }) =>
    selectMode || event.shiftKey;

  const begin = (trackId: string, step: number, event: React.PointerEvent) => {
    if (!isSelectGesture(event)) return false;
    event.preventDefault();
    drag.trackId = trackId;
    drag.anchor = step;
    setSelection({ trackId, from: step, to: step });
    return true;
  };

  const extend = (trackId: string, step: number) => {
    if (drag.trackId !== trackId) return;
    setSelection({
      trackId,
      from: Math.min(drag.anchor, step),
      to: Math.max(drag.anchor, step),
    });
  };

  return { begin, extend, isSelectGesture };
}

function useIsSelected(trackId: string) {
  return useStudio(
    useShallow((s) =>
      s.selection?.trackId === trackId
        ? ([s.selection.from, s.selection.to] as const)
        : null,
    ),
  );
}

/* ---------------------------------- headers ---------------------------------- */

function TrackHeader({
  track,
  children,
}: {
  track: Track;
  children?: React.ReactNode;
}) {
  const commit = useStudio((s) => s.commit);
  const selected = useStudio((s) => s.selectedTrackId === track.id);
  const setSelectedTrack = useStudio((s) => s.setSelectedTrack);
  const info = INSTRUMENT_BY_ID[track.instrument];

  const update = (label: string, fn: (t: Track) => void) =>
    commit("human", label, (draft) => {
      const target = draft.tracks.find((t) => t.id === track.id);
      if (target) fn(target);
    });

  return (
    <div
      className={cn(
        "flex h-10 shrink-0 flex-col justify-center gap-0.5 border-r px-2",
        selected && "bg-muted/60",
      )}
      style={{ width: GUTTER_W }}
      onClick={() => setSelectedTrack(track.id)}
    >
      <div className="flex items-center gap-1">
        <span
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            actorColor(track.createdBy),
          )}
          title={`Added by ${track.createdBy}`}
        />
        <span
          className="truncate text-xs font-medium"
          title={`${track.name} · ${info.label}`}
        >
          {track.name}
        </span>
        <span className="text-muted-foreground truncate text-[10px]">
          {info.label}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                className="ml-auto"
                aria-label="Track menu"
              />
            }
          >
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem
              onClick={() => {
                const name = window.prompt("Track name", track.name);
                if (name?.trim())
                  update(
                    `Renamed track to ${name.trim()}`,
                    (t) => (t.name = name.trim().slice(0, 32)),
                  );
              }}
            >
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onClick={() =>
                commit("human", `Removed ${track.name}`, (draft) => {
                  draft.tracks = draft.tracks.filter((t) => t.id !== track.id);
                })
              }
            >
              <Trash2 />
              Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="flex items-center gap-1">
        <Toggle
          size="sm"
          pressed={track.mute}
          onPressedChange={(v) =>
            update(
              v ? `Muted ${track.name}` : `Unmuted ${track.name}`,
              (t) => (t.mute = v),
            )
          }
          className="data-[pressed]:bg-destructive/20 data-[pressed]:text-destructive h-5 w-6 px-0 text-[10px]"
          aria-label="Mute"
          title="Mute"
        >
          <VolumeX className="size-3" />
        </Toggle>
        <Toggle
          size="sm"
          pressed={track.solo}
          onPressedChange={(v) =>
            update(
              v ? `Soloed ${track.name}` : `Unsoloed ${track.name}`,
              (t) => (t.solo = v),
            )
          }
          className="data-[pressed]:bg-human/30 h-5 w-6 px-0 text-[10px]"
          aria-label="Solo"
          title="Solo"
        >
          <Headphones className="size-3" />
        </Toggle>
        <Slider
          className="mx-1 w-16"
          min={0}
          max={1}
          step={0.02}
          value={track.volume}
          aria-label="Volume"
          onValueChange={(value) => {
            const v = typeof value === "number" ? value : value[0];
            update(`Set ${track.name} volume`, (t) => (t.volume = v));
          }}
        />
        {children}
      </div>
    </div>
  );
}

/* ---------------------------------- drum row ---------------------------------- */

function DrumRow({ track }: { track: DrumTrack }) {
  const commit = useStudio((s) => s.commit);
  const { begin, extend, isSelectGesture } = useSelectionGestures();
  const selected = useIsSelected(track.id);

  const setStep = (step: number, velocity: number, label: string) =>
    commit("human", label, (draft) => {
      const t = draft.tracks.find((x) => x.id === track.id);
      if (t?.kind !== "drum") return;
      t.steps[step] = velocity;
      t.editedBy[step] = "human";
    });

  return (
    <div className="relative flex">
      <TrackHeader track={track} />
      <div className="flex">
        {track.steps.map((velocity, step) => {
          const by = track.editedBy[step];
          const inSelection =
            selected !== null && step >= selected[0] && step <= selected[1];
          return (
            <button
              key={step}
              type="button"
              aria-label={`${track.name} step ${step + 1}${velocity > 0 ? " on" : " off"}`}
              className={cn(
                "group/cell hover:bg-muted/60 relative h-10 border-b p-1 transition-colors",
                stepBorder(step),
                inSelection && "bg-selection/20",
              )}
              style={{ width: CELL_W }}
              onPointerDown={(e) => begin(track.id, step, e)}
              onPointerEnter={() => extend(track.id, step)}
              onClick={(e) => {
                if (isSelectGesture(e)) return;
                if (velocity > 0) {
                  setStep(step, 0, `Cleared step ${step} on ${track.name}`);
                } else {
                  setStep(step, 0.75, `Hit step ${step} on ${track.name}`);
                  getEngine().preview(track);
                }
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                if (velocity <= 0) return;
                const next =
                  velocity >= 0.9 ? 0.4 : velocity >= 0.55 ? 1 : 0.75;
                setStep(
                  step,
                  next,
                  `Changed velocity at step ${step} on ${track.name}`,
                );
              }}
              title="Click: toggle · Right-click: accent/soft · Shift+drag: select"
            >
              <span
                className={cn(
                  "block size-full rounded-sm",
                  velocity > 0
                    ? actorColor(by)
                    : "bg-foreground/5 group-hover/cell:bg-foreground/10",
                )}
                style={
                  velocity > 0 ? { opacity: 0.35 + velocity * 0.65 } : undefined
                }
              />
            </button>
          );
        })}
      </div>
      <AgentFlash at={track.lastAgentEditAt} />
    </div>
  );
}

/* ---------------------------------- melodic roll ---------------------------------- */

function MelodicRoll({ track }: { track: MelodicTrack }) {
  const commit = useStudio((s) => s.commit);
  const key = useStudio((s) => s.song.key);
  const scale = useStudio((s) => s.song.scale);
  const total = useStudio((s) => totalSteps(s.song));
  const { begin, extend, isSelectGesture } = useSelectionGestures();
  const selected = useIsSelected(track.id);
  const [fold, setFold] = useState(true);

  const pitches: number[] = [];
  for (let p = track.highNote; p >= track.lowNote; p--) {
    const used = track.notes.some((n) => n.pitch === p);
    if (!fold || used || isInScale(p, key, scale)) pitches.push(p);
  }

  const edit = (label: string, fn: (t: MelodicTrack) => void) =>
    commit("human", label, (draft) => {
      const t = draft.tracks.find((x) => x.id === track.id);
      if (t?.kind === "melodic") fn(t);
    });

  const rootClass = normalizePitchClass(key);

  return (
    <div className="relative">
      <div className="flex">
        <TrackHeader track={track}>
          <Toggle
            size="sm"
            pressed={fold}
            onPressedChange={setFold}
            className="h-5 px-1 text-[10px]"
            title={fold ? "Showing scale notes only" : "Showing all notes"}
          >
            {fold ? "scale" : "all"}
          </Toggle>
        </TrackHeader>
        <div
          className="text-muted-foreground flex h-10 items-center border-b px-3 text-[11px]"
          style={{ width: total * CELL_W }}
        >
          {track.notes.length === 0
            ? "No notes yet. Click the roll below, or ask your agent to write a line."
            : `${track.notes.length} note${track.notes.length === 1 ? "" : "s"} · ${midiToNote(track.lowNote)}–${midiToNote(track.highNote)}`}
        </div>
      </div>
      {pitches.map((pitch) => {
        const inScale = isInScale(pitch, key, scale);
        const isRoot = midiToNote(pitch).replace(/-?\d+$/, "") === rootClass;
        return (
          <div key={pitch} className="flex">
            <div
              className={cn(
                "flex h-5 shrink-0 items-center justify-end border-r pr-2 font-mono text-[10px]",
                inScale ? "text-foreground/80" : "text-muted-foreground/60",
                isRoot && "font-semibold",
              )}
              style={{ width: GUTTER_W }}
            >
              {midiToNote(pitch)}
            </div>
            <div className="flex">
              {Array.from({ length: total }, (_, step) => {
                const start = track.notes.find(
                  (n) => n.step === step && n.pitch === pitch,
                );
                const sustain = start
                  ? undefined
                  : track.notes.find(
                      (n) =>
                        n.pitch === pitch &&
                        step > n.step &&
                        step < n.step + n.length,
                    );
                const inSelection =
                  selected !== null &&
                  step >= selected[0] &&
                  step <= selected[1];
                return (
                  <button
                    key={step}
                    type="button"
                    aria-label={`${midiToNote(pitch)} at step ${step + 1}`}
                    className={cn(
                      "hover:bg-muted/60 relative h-5 border-b p-px",
                      stepBorder(step),
                      !inScale && "bg-foreground/[0.03]",
                      inSelection && "bg-selection/20",
                    )}
                    style={{ width: CELL_W }}
                    onPointerDown={(e) => begin(track.id, step, e)}
                    onPointerEnter={() => extend(track.id, step)}
                    onClick={(e) => {
                      if (isSelectGesture(e)) return;
                      if (start || sustain) {
                        const target = start ?? sustain;
                        edit(
                          `Removed ${midiToNote(pitch)} on ${track.name}`,
                          (t) => {
                            t.notes = t.notes.filter(
                              (n) =>
                                !(
                                  n.step === target!.step &&
                                  n.pitch === target!.pitch
                                ),
                            );
                          },
                        );
                      } else {
                        edit(
                          `Added ${midiToNote(pitch)} at step ${step} on ${track.name}`,
                          (t) => {
                            t.notes.push({
                              step,
                              pitch,
                              length: 1,
                              velocity: 0.8,
                              by: "human",
                            });
                          },
                        );
                        getEngine().preview(track, pitch);
                      }
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      const target = start ?? sustain;
                      if (!target) return;
                      edit(
                        `Lengthened ${midiToNote(pitch)} on ${track.name}`,
                        (t) => {
                          const n = t.notes.find(
                            (x) =>
                              x.step === target.step &&
                              x.pitch === target.pitch,
                          );
                          if (n)
                            n.length =
                              n.step + n.length >= total ? 1 : n.length + 1;
                        },
                      );
                    }}
                    title="Click: add/remove note · Right-click: lengthen · Shift+drag: select"
                  >
                    {(start || sustain) && (
                      <span
                        className={cn(
                          "block size-full",
                          actorColor((start ?? sustain)!.by),
                          start ? "rounded-l-sm" : "opacity-50",
                          start && start.length === 1 && "rounded-r-sm",
                        )}
                        style={
                          start
                            ? { opacity: 0.45 + start.velocity * 0.55 }
                            : undefined
                        }
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
      <AgentFlash at={track.lastAgentEditAt} />
    </div>
  );
}

function AgentFlash({ at }: { at?: number }) {
  if (!at) return null;
  return (
    <div
      key={at}
      className="pointer-events-none absolute inset-0 animate-[agent-flash_1.4s_ease-out_forwards]"
    />
  );
}

/* ---------------------------------- sequencer ---------------------------------- */

export function Sequencer() {
  const trackIds = useStudio((s) => s.song.tracks.map((t) => t.id).join(","));
  const tracks = useStudio((s) => s.song.tracks);
  const total = useStudio((s) => totalSteps(s.song));
  const currentStep = useStudio((s) => s.currentStep);
  const selection = useStudio((s) => s.selection);
  const setSelection = useStudio((s) => s.setSelection);
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <div className="bg-card overflow-hidden rounded-xl border">
      <div ref={scrollRef} className="overflow-x-auto">
        <div
          className="relative"
          style={{ minWidth: GUTTER_W + total * CELL_W }}
        >
          {/* ruler */}
          <div className="bg-muted/40 flex border-b">
            <div
              className="text-muted-foreground flex shrink-0 items-center px-2 text-[11px]"
              style={{ width: GUTTER_W }}
            >
              {tracks.length} track{tracks.length === 1 ? "" : "s"}
              {selection && (
                <button
                  type="button"
                  className="text-selection ml-auto underline-offset-2 hover:underline"
                  onClick={() => setSelection(null)}
                >
                  clear selection
                </button>
              )}
            </div>
            {Array.from({ length: total }, (_, step) => (
              <div
                key={step}
                className={cn(
                  "text-muted-foreground flex h-6 items-center justify-center text-[10px] tabular-nums",
                  stepBorder(step),
                  step % 4 === 0 && "text-foreground/80",
                )}
                style={{ width: CELL_W }}
              >
                {step % 4 === 0
                  ? `${Math.floor(step / STEPS_PER_BAR) + 1}.${(step % STEPS_PER_BAR) / 4 + 1}`
                  : step % 4 === 2
                    ? "·"
                    : ""}
              </div>
            ))}
          </div>

          {/* tracks */}
          {tracks.length === 0 ? (
            <p className="text-muted-foreground px-6 py-16 text-center text-sm">
              No tracks. Add one above, or ask your agent to build a beat from
              scratch.
            </p>
          ) : (
            <div key={trackIds}>
              {tracks.map((track) =>
                track.kind === "drum" ? (
                  <DrumRow key={track.id} track={track} />
                ) : (
                  <MelodicRoll key={track.id} track={track} />
                ),
              )}
            </div>
          )}

          {/* playhead */}
          {currentStep >= 0 && (
            <div
              className="bg-foreground/10 border-foreground/30 pointer-events-none absolute inset-y-0 border-x"
              style={{ left: GUTTER_W + currentStep * CELL_W, width: CELL_W }}
            />
          )}
        </div>
      </div>
      <p className="text-muted-foreground border-t px-3 py-1.5 text-[11px]">
        Click a cell to toggle it, right-click for accent or length. Hold Shift
        and drag across steps to hand your agent an exact range.
      </p>
    </div>
  );
}
