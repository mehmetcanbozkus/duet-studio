"use client";

import {
  Eraser,
  MousePointer2,
  Play,
  Redo2,
  Square,
  Undo2,
} from "lucide-react";
import { useStore } from "zustand";

import { AddTrackMenu } from "./add-track-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldTitle } from "@/components/ui/field";
import { Slider } from "@/components/ui/slider";
import { Toggle } from "@/components/ui/toggle";
import { togglePlay } from "@/lib/studio/playback";
import { resizeSong } from "@/lib/studio/song";
import { redo, studioHistory, undo, useStudio } from "@/lib/studio/store";
import { PITCH_CLASSES, SCALE_NAMES, isScaleName } from "@/lib/studio/theory";

const selectClass =
  "border-input bg-background h-8 rounded-lg border px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50 dark:bg-input/30";
const percentFormat = { style: "percent" } satisfies Intl.NumberFormatOptions;

export function Transport() {
  const playing = useStudio((s) => s.playing);
  const bpm = useStudio((s) => s.song.bpm);
  const swing = useStudio((s) => s.song.swing);
  const bars = useStudio((s) => s.song.bars);
  const key = useStudio((s) => s.song.key);
  const scale = useStudio((s) => s.song.scale);
  const selectMode = useStudio((s) => s.selectMode);
  const setSelectMode = useStudio((s) => s.setSelectMode);
  const commit = useStudio((s) => s.commit);
  const canUndo = useStore(studioHistory, (s) => s.pastStates.length > 0);
  const canRedo = useStore(studioHistory, (s) => s.futureStates.length > 0);
  const swingPercent = Math.round(swing * 100);

  return (
    <div className="bg-muted/30 flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-2">
      <Button
        onClick={() => void togglePlay()}
        size="lg"
        className="w-24"
        title="Play or stop (Space)"
        aria-pressed={playing}
      >
        {playing ? (
          <Square data-icon="inline-start" />
        ) : (
          <Play data-icon="inline-start" />
        )}
        {playing ? "Stop" : "Play"}
      </Button>

      <label className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">BPM</span>
        <input
          type="number"
          min={40}
          max={240}
          value={bpm}
          onChange={(e) => {
            const value = Math.min(
              240,
              Math.max(40, Number(e.target.value) || 40),
            );
            commit("human", `Set tempo to ${value}`, (d) => {
              d.bpm = value;
            });
          }}
          className={`${selectClass} w-18 tabular-nums`}
        />
      </label>

      <Field orientation="horizontal" className="w-auto">
        <FieldTitle>Swing</FieldTitle>
        <Slider
          className="w-24! shrink-0"
          min={0}
          max={0.6}
          step={0.02}
          value={[swing]}
          aria-label="Swing"
          format={percentFormat}
          onValueChange={(value) => {
            const v = typeof value === "number" ? value : value[0];
            commit("human", `Set swing to ${Math.round(v * 100)}%`, (d) => {
              d.swing = v;
            });
          }}
        />
        <Badge variant="outline">{swingPercent}%</Badge>
      </Field>

      <label className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Bars</span>
        <select
          className={selectClass}
          value={bars}
          onChange={(e) => {
            const value = Number(e.target.value) as 1 | 2 | 4;
            commit("human", `Set length to ${value} bar(s)`, (d) =>
              resizeSong(d, value),
            );
          }}
        >
          {[1, 2, 4].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Key</span>
        <select
          className={selectClass}
          value={key}
          onChange={(e) =>
            commit("human", `Set key to ${e.target.value}`, (d) => {
              d.key = e.target.value;
            })
          }
        >
          {PITCH_CLASSES.map((pc) => (
            <option key={pc} value={pc}>
              {pc}
            </option>
          ))}
        </select>
        <select
          className={selectClass}
          value={scale}
          onChange={(e) => {
            const value = e.target.value;
            if (!isScaleName(value)) return;
            commit("human", `Set scale to ${value}`, (d) => {
              d.scale = value;
            });
          }}
        >
          {SCALE_NAMES.map((name) => (
            <option key={name} value={name}>
              {name.replace("_", " ")}
            </option>
          ))}
        </select>
      </label>

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          disabled={!canUndo}
          onClick={() => undo()}
          aria-label="Undo"
        >
          <Undo2 />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          disabled={!canRedo}
          onClick={() => redo()}
          aria-label="Redo"
        >
          <Redo2 />
        </Button>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <Toggle
          pressed={selectMode}
          onPressedChange={setSelectMode}
          variant="outline"
          size="sm"
          aria-label="Selection mode"
          title="Selection mode: drag over steps to select a range for your agent (or hold Shift)"
        >
          <MousePointer2 />
          Select
        </Toggle>
        <AddTrackMenu />
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            commit("human", "Cleared the song", (d) => {
              d.tracks = [];
            })
          }
        >
          <Eraser data-icon="inline-start" />
          Clear
        </Button>
      </div>
    </div>
  );
}
