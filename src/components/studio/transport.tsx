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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Toggle } from "@/components/ui/toggle";
import { togglePlay } from "@/lib/studio/playback";
import { resizeSong } from "@/lib/studio/song";
import { redo, studioHistory, undo, useStudio } from "@/lib/studio/store";
import { PITCH_CLASSES, SCALE_NAMES, isScaleName } from "@/lib/studio/theory";

const scaleLabel = (name: string) => name.replace("_", " ");
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
    // One row on a wide screen. Narrower than that it wraps, so the controls are
    // grouped: each group stays whole and the rows break at meaningful seams
    // instead of wherever a control happens to land.
    <div className="bg-muted/30 flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-2">
      <div className="flex items-center gap-3">
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
          <Input
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
            className="w-18 tabular-nums"
          />
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
      </div>

      <div className="flex items-center gap-4">
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

        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Bars</span>
          <Select
            value={bars}
            onValueChange={(value: 1 | 2 | 4 | null) => {
              if (value === null) return;
              commit("human", `Set length to ${value} bar(s)`, (d) =>
                resizeSong(d, value),
              );
            }}
          >
            <SelectTrigger aria-label="Bars" className="min-w-16">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[1, 2, 4].map((n) => (
                <SelectItem key={n} value={n}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Key</span>
        <Select
          value={key}
          onValueChange={(value: string | null) => {
            if (value === null) return;
            commit("human", `Set key to ${value}`, (d) => {
              d.key = value;
            });
          }}
        >
          <SelectTrigger aria-label="Key" className="min-w-16">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PITCH_CLASSES.map((pc) => (
              <SelectItem key={pc} value={pc}>
                {pc}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={scale}
          onValueChange={(value: string | null) => {
            if (value === null || !isScaleName(value)) return;
            commit("human", `Set scale to ${value}`, (d) => {
              d.scale = value;
            });
          }}
        >
          <SelectTrigger aria-label="Scale" className="min-w-32">
            <SelectValue>{(value: string) => scaleLabel(value)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {SCALE_NAMES.map((name) => (
              <SelectItem key={name} value={name}>
                {scaleLabel(name)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Pushed right only once the whole bar fits on one line; on a wrapped
          bar it stays flush left with everything else. */}
      <div className="flex items-center gap-2 xl:ml-auto">
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
