import {
  describeSong,
  songHeadline,
  summarizeTrack,
} from "@/lib/studio/format";
import {
  INSTRUMENTS,
  isDrumInstrument,
  isInstrument,
} from "@/lib/studio/instruments";
import { play, stop } from "@/lib/studio/playback";
import {
  applyPattern,
  createTrack,
  findTrack,
  resizeSong,
} from "@/lib/studio/song";
import { redo, undo, useStudio, type StudioState } from "@/lib/studio/store";
import {
  SCALE_NAMES,
  midiToNote,
  normalizePitchClass,
  noteToMidi,
  isScaleName,
  parsePattern,
  scaleNotesInRange,
} from "@/lib/studio/theory";
import {
  totalSteps,
  type Actor,
  type MelodicTrack,
  type Note,
  type Song,
} from "@/lib/studio/types";

import type { JsonSchema, ToolAnnotations } from "./types";
import { validateInput } from "./validate";

export interface ToolSpec<Args = Record<string, unknown>> {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  annotations?: ToolAnnotations;
  /** Register only while this is true. Re-evaluated whenever the store changes. */
  when?: (state: StudioState) => boolean;
  /** Short label for the activity feed when the tool is read-only. */
  readLabel?: string;
  execute: (args: Args) => Promise<unknown> | unknown;
}

const AGENT: Actor = "agent";

function state() {
  return useStudio.getState();
}

function commit(
  label: string,
  tool: string,
  args: unknown,
  mutate: (draft: Song) => void,
) {
  state().commit(AGENT, label, mutate, { tool, args });
}

/**
 * Write tools answer with one line plus the track they touched. The agent already knows the rest
 * of the song from get_song, and Chrome asks tool outputs to stay under ~1.5K characters.
 */
function changed(message: string, trackId: string) {
  return { message, track: summarizeTrack(findTrack(state().song, trackId)) };
}

/** Song title and track names are typed by the human or arrive via share links: not ours. */
const ECHOES_SONG_TEXT: ToolAnnotations = { untrustedContentHint: true };

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

interface NoteInput {
  step: number;
  note: string | number;
  length?: number;
  velocity?: number;
}

function toNotes(
  input: NoteInput[] | undefined,
  total: number,
  actor: Actor,
): Note[] {
  if (!Array.isArray(input))
    throw new Error(
      "notes must be an array of { step, note, length?, velocity? }",
    );
  return input.map((n, index) => {
    if (typeof n !== "object" || n === null)
      throw new Error(`notes[${index}] must be an object`);
    const step = Number(n.step);
    if (!Number.isInteger(step) || step < 0 || step >= total) {
      throw new Error(
        `notes[${index}].step must be an integer between 0 and ${total - 1}`,
      );
    }
    const pitch = noteToMidi(n.note);
    const length =
      n.length === undefined ? 1 : Math.max(1, Math.round(Number(n.length)));
    const velocity =
      n.velocity === undefined ? 0.8 : clamp(Number(n.velocity), 0.05, 1);
    return { step, pitch, length, velocity, by: actor };
  });
}

const NOTE_ITEM_SCHEMA = {
  type: "object",
  properties: {
    step: {
      type: "integer",
      minimum: 0,
      description:
        "0-indexed 16th-note step (0-15 in bar 1, 16-31 in bar 2, ...)",
    },
    note: {
      type: ["string", "integer"],
      description:
        'Scientific pitch such as "A2", "C#3", "Bb1", or a MIDI number',
    },
    length: {
      type: "integer",
      description: "Length in steps, default 1",
      minimum: 1,
      maximum: 64,
    },
    velocity: {
      type: "number",
      description: "0.05-1, default 0.8",
      minimum: 0.05,
      maximum: 1,
    },
  },
  required: ["step", "note"],
  additionalProperties: false,
};

const TRACK_REF = {
  type: "string",
  maxLength: 64,
  description:
    "Track id (preferred), exact track name, instrument id, or 1-based position from get_song",
};

export const TOOLS: ToolSpec[] = [
  {
    name: "get_song",
    description:
      "Read the whole song as text: tempo, swing, bars, key/scale, one line per track, transport state and the human's current selection. Call this first, and again after the human says they changed something. Steps are 0-indexed 16ths, 16 per bar. Drum patterns: X accent, x hit, o soft, . rest, bars split by |. Melodic notes: step:Note(length in steps).",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, ...ECHOES_SONG_TEXT },
    readLabel: "Read the song",
    execute: () => {
      const s = state();
      return describeSong(s.song, {
        playing: s.playing,
        step: s.currentStep,
        selection: s.selection,
      });
    },
  },
  {
    name: "list_instruments",
    description:
      "List the available instruments: id, drum or melodic, character and recommended pitch range. Drums take patterns, melodic instruments take notes.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    readLabel: "Listed instruments",
    execute: () =>
      INSTRUMENTS.map((i) => `${i.id} (${i.kind}): ${i.description}`).join(
        "\n",
      ),
  },
  {
    name: "get_scale_notes",
    description:
      "Music theory helper: list the notes of a scale within a pitch range, so melodies and basslines stay in key.",
    inputSchema: {
      type: "object",
      properties: {
        root: {
          type: "string",
          maxLength: 3,
          description:
            'Root pitch class, e.g. "A", "F#", "Bb". Defaults to the song key.',
        },
        scale: {
          type: "string",
          enum: SCALE_NAMES,
          description: "Defaults to the song scale.",
        },
        low_note: {
          type: "string",
          maxLength: 4,
          description: 'Lowest note to include, e.g. "A1". Default C2.',
        },
        high_note: {
          type: "string",
          maxLength: 4,
          description: 'Highest note to include, e.g. "A4". Default C5.',
        },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    readLabel: "Looked up a scale",
    execute: (args) => {
      const song = state().song;
      const root = typeof args.root === "string" ? args.root : song.key;
      const scale = typeof args.scale === "string" ? args.scale : song.scale;
      if (!isScaleName(scale))
        throw new Error(
          `Unknown scale "${scale}". Options: ${SCALE_NAMES.join(", ")}`,
        );
      const low = args.low_note ? noteToMidi(String(args.low_note)) : 36;
      const high = args.high_note ? noteToMidi(String(args.high_note)) : 72;
      if (low > high)
        throw new Error("low_note must not be higher than high_note");
      const notes = scaleNotesInRange(root, scale, low, high).map(midiToNote);
      return { root: normalizePitchClass(root), scale, notes };
    },
  },
  {
    name: "set_tempo",
    description:
      "Change tempo (BPM) and/or swing. Swing is 0 (straight) to 0.6 (heavy shuffle), applied to off-beat 16ths.",
    inputSchema: {
      type: "object",
      properties: {
        bpm: { type: "number", minimum: 40, maximum: 240 },
        swing: { type: "number", minimum: 0, maximum: 0.6 },
      },
      additionalProperties: false,
    },
    execute: (args) => {
      if (args.bpm === undefined && args.swing === undefined)
        throw new Error("Provide bpm and/or swing");
      commit("Changed tempo", "set_tempo", args, (draft) => {
        if (args.bpm !== undefined)
          draft.bpm = Math.round(clamp(Number(args.bpm), 40, 240));
        if (args.swing !== undefined)
          draft.swing = clamp(Number(args.swing), 0, 0.6);
      });
      const song = state().song;
      return {
        message: `Tempo is now ${song.bpm} BPM with swing ${Math.round(song.swing * 100)}%.`,
      };
    },
  },
  {
    name: "set_playback",
    description:
      "Start or stop playback. The loop plays continuously and picks up edits live. Audio can only start after the human has clicked somewhere on the page at least once.",
    inputSchema: {
      type: "object",
      properties: { playing: { type: "boolean" } },
      required: ["playing"],
      additionalProperties: false,
    },
    execute: async (args) => {
      if (args.playing) {
        const ok = await play();
        state().logActivity({
          actor: AGENT,
          label: ok ? "Started playback" : "Tried to start playback",
          tool: "set_playback",
          args,
          error: ok
            ? undefined
            : "Audio is locked until the human clicks on the page",
        });
        if (!ok) {
          throw new Error(
            "The browser blocks audio until the human interacts with the page. Ask them to click Play (or anywhere on the page) once, then try again.",
          );
        }
        return { message: "Playing." };
      }
      stop();
      state().logActivity({
        actor: AGENT,
        label: "Stopped playback",
        tool: "set_playback",
        args,
      });
      return { message: "Stopped." };
    },
  },
  {
    name: "set_song_meta",
    description:
      "Set the song title, key, scale and/or length in bars (1, 2 or 4). Growing the song tiles existing material; shrinking drops the extra bars.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", maxLength: 60 },
        key: {
          type: "string",
          maxLength: 3,
          description: 'Pitch class such as "A" or "F#"',
        },
        scale: { type: "string", enum: SCALE_NAMES },
        bars: { type: "integer", enum: [1, 2, 4] },
      },
      additionalProperties: false,
    },
    annotations: ECHOES_SONG_TEXT,
    execute: (args) => {
      if (
        args.title === undefined &&
        args.key === undefined &&
        args.scale === undefined &&
        args.bars === undefined
      )
        throw new Error("Provide title, key, scale and/or bars");
      commit("Updated song settings", "set_song_meta", args, (draft) => {
        if (typeof args.title === "string" && args.title.trim())
          draft.title = args.title.trim().slice(0, 60);
        if (typeof args.key === "string") {
          const key = normalizePitchClass(args.key);
          if (!key) throw new Error(`Unknown key "${args.key}"`);
          draft.key = key;
        }
        if (typeof args.scale === "string") {
          if (!isScaleName(args.scale))
            throw new Error(`Unknown scale "${args.scale}"`);
          draft.scale = args.scale;
        }
        if (args.bars !== undefined) {
          const bars = Number(args.bars);
          if (bars !== 1 && bars !== 2 && bars !== 4)
            throw new Error("bars must be 1, 2 or 4");
          if (bars !== draft.bars) resizeSong(draft, bars);
        }
      });
      const song = state().song;
      return {
        message: `"${song.title}" in ${song.key} ${song.scale}, ${song.bars} bar(s).`,
      };
    },
  },
  {
    name: "add_track",
    description:
      "Add a new track. Drum tracks take an optional pattern string (X accent, x hit, o soft, . rest; 16 chars per bar, short patterns repeat). Melodic tracks take optional notes. Returns the new track id.",
    inputSchema: {
      type: "object",
      properties: {
        instrument: { type: "string", enum: INSTRUMENTS.map((i) => i.id) },
        name: {
          type: "string",
          maxLength: 32,
          description: "Display name, defaults to the instrument label",
        },
        pattern: {
          type: "string",
          maxLength: 96,
          description: 'Drums only, e.g. "x.x.x.x.x.x.x.x."',
        },
        notes: {
          type: "array",
          items: NOTE_ITEM_SCHEMA,
          maxItems: 256,
          description: "Melodic only",
        },
      },
      required: ["instrument"],
      additionalProperties: false,
    },
    annotations: ECHOES_SONG_TEXT,
    execute: (args) => {
      const instrument = String(args.instrument);
      if (!isInstrument(instrument))
        throw new Error(
          `Unknown instrument "${instrument}". Call list_instruments.`,
        );
      const drum = isDrumInstrument(instrument);
      if (drum && args.notes !== undefined)
        throw new Error(
          `"${instrument}" is a drum instrument: give it a pattern, not notes.`,
        );
      if (!drum && args.pattern !== undefined)
        throw new Error(
          `"${instrument}" is melodic: give it notes, not a pattern.`,
        );
      let id = "";
      commit(`Added ${instrument} track`, "add_track", args, (draft) => {
        if (draft.tracks.length >= 12)
          throw new Error("Maximum of 12 tracks reached");
        const track = createTrack(
          instrument,
          AGENT,
          draft,
          typeof args.name === "string" ? args.name : undefined,
        );
        if (track.kind === "drum") {
          if (typeof args.pattern === "string")
            applyPattern(track, args.pattern, AGENT);
        } else if (args.notes !== undefined) {
          track.notes = toNotes(
            args.notes as NoteInput[],
            totalSteps(draft),
            AGENT,
          );
        }
        draft.tracks.push(track);
        id = track.id;
      });
      return changed(`Added track "${findTrack(state().song, id).name}".`, id);
    },
  },
  {
    name: "remove_track",
    description: "Remove a track from the song.",
    inputSchema: {
      type: "object",
      properties: { track: TRACK_REF },
      required: ["track"],
      additionalProperties: false,
    },
    annotations: ECHOES_SONG_TEXT,
    execute: (args) => {
      let name = "";
      commit("Removed a track", "remove_track", args, (draft) => {
        const track = findTrack(draft, String(args.track));
        name = track.name;
        draft.tracks = draft.tracks.filter((t) => t.id !== track.id);
      });
      return { message: `Removed "${name}". The human can undo this.` };
    },
  },
  {
    name: "update_track",
    description:
      "Rename a track or change its mixer settings: volume (0-1), mute, solo.",
    inputSchema: {
      type: "object",
      properties: {
        track: TRACK_REF,
        name: { type: "string", maxLength: 32 },
        volume: { type: "number", minimum: 0, maximum: 1 },
        mute: { type: "boolean" },
        solo: { type: "boolean" },
      },
      required: ["track"],
      additionalProperties: false,
    },
    annotations: ECHOES_SONG_TEXT,
    execute: (args) => {
      if (
        args.name === undefined &&
        args.volume === undefined &&
        args.mute === undefined &&
        args.solo === undefined
      )
        throw new Error("Provide at least one of name, volume, mute, solo");
      let summary = "";
      commit("Updated a track", "update_track", args, (draft) => {
        const track = findTrack(draft, String(args.track));
        if (typeof args.name === "string" && args.name.trim())
          track.name = args.name.trim().slice(0, 32);
        if (args.volume !== undefined)
          track.volume = clamp(Number(args.volume), 0, 1);
        if (typeof args.mute === "boolean") track.mute = args.mute;
        if (typeof args.solo === "boolean") track.solo = args.solo;
        summary = `"${track.name}": volume ${track.volume.toFixed(2)}${track.mute ? ", muted" : ""}${track.solo ? ", solo" : ""}`;
      });
      return { message: summary };
    },
  },
  {
    name: "set_drum_pattern",
    description:
      "Replace a drum track's pattern. Pattern chars: X accent, x hit, o soft/ghost, . rest. 16 steps per bar; a 16-step pattern repeats across all bars unless `bar` targets one bar. Spaces and | are ignored.",
    inputSchema: {
      type: "object",
      properties: {
        track: TRACK_REF,
        pattern: {
          type: "string",
          maxLength: 96,
          description: 'e.g. "X...x...X...x..." or "x.x.x.x.x.x.x.x."',
        },
        bar: {
          type: "integer",
          minimum: 1,
          maximum: 4,
          description: "Only write this bar (1-based)",
        },
      },
      required: ["track", "pattern"],
      additionalProperties: false,
    },
    annotations: ECHOES_SONG_TEXT,
    execute: (args) => {
      let id = "";
      commit("Wrote a drum pattern", "set_drum_pattern", args, (draft) => {
        const track = findTrack(draft, String(args.track));
        if (track.kind !== "drum")
          throw new Error(`"${track.name}" is melodic. Use set_notes instead.`);
        applyPattern(
          track,
          String(args.pattern),
          AGENT,
          args.bar === undefined ? undefined : Number(args.bar),
        );
        id = track.id;
      });
      return changed("Pattern written.", id);
    },
  },
  {
    name: "set_notes",
    description:
      "Write notes on a melodic track (bass, lead, pad, pluck, keys). mode 'replace' (default) rewrites the whole track; 'merge' adds to existing notes. Put several notes on the same step for chords.",
    inputSchema: {
      type: "object",
      properties: {
        track: TRACK_REF,
        notes: { type: "array", items: NOTE_ITEM_SCHEMA, maxItems: 256 },
        mode: { type: "string", enum: ["replace", "merge"] },
      },
      required: ["track", "notes"],
      additionalProperties: false,
    },
    annotations: ECHOES_SONG_TEXT,
    execute: (args) => {
      let id = "";
      commit("Wrote notes", "set_notes", args, (draft) => {
        const track = findTrack(draft, String(args.track));
        if (track.kind !== "melodic")
          throw new Error(
            `"${track.name}" is a drum track. Use set_drum_pattern instead.`,
          );
        const notes = toNotes(
          args.notes as NoteInput[],
          totalSteps(draft),
          AGENT,
        );
        track.notes =
          args.mode === "merge" ? [...track.notes, ...notes] : notes;
        widenRange(track);
        id = track.id;
      });
      return changed(
        `${args.mode === "merge" ? "Merged" : "Wrote"} ${(args.notes as NoteInput[]).length} note(s).`,
        id,
      );
    },
  },
  {
    name: "humanize",
    description:
      "Add natural velocity variation to one track (or every track). amount 0-1, default 0.3. Great for hats and shakers.",
    inputSchema: {
      type: "object",
      properties: {
        track: TRACK_REF,
        amount: { type: "number", minimum: 0, maximum: 1 },
      },
      additionalProperties: false,
    },
    execute: (args) => {
      const amount =
        args.amount === undefined ? 0.3 : clamp(Number(args.amount), 0, 1);
      commit("Humanized velocities", "humanize", args, (draft) => {
        const targets =
          args.track === undefined
            ? draft.tracks
            : [findTrack(draft, String(args.track))];
        for (const track of targets) {
          if (track.kind === "drum") {
            track.steps = track.steps.map((v, i) => {
              if (v <= 0) return v;
              track.editedBy[i] = AGENT;
              return clamp(v * (1 + (Math.random() - 0.5) * amount), 0.15, 1);
            });
          } else {
            track.notes = track.notes.map((n) => ({
              ...n,
              by: AGENT,
              velocity: clamp(
                n.velocity * (1 + (Math.random() - 0.5) * amount),
                0.15,
                1,
              ),
            }));
          }
        }
      });
      return { message: `Humanized with amount ${amount}.` };
    },
  },
  {
    name: "undo",
    description:
      "Undo the last change (by anyone). Call get_song afterwards if you need the details.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: ECHOES_SONG_TEXT,
    execute: () =>
      undo(AGENT)
        ? { message: `Undone. Now: ${songHeadline(state().song)}` }
        : { message: "Nothing to undo." },
  },
  {
    name: "redo",
    description: "Redo the last undone change.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: ECHOES_SONG_TEXT,
    execute: () =>
      redo(AGENT)
        ? { message: `Redone. Now: ${songHeadline(state().song)}` }
        : { message: "Nothing to redo." },
  },
  {
    name: "clear_song",
    description:
      "Remove every track and start over. This asks the human for confirmation in the app and only proceeds if they approve.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    execute: async () => {
      const ok = await state().requestConfirmation(
        "Clear the whole song?",
        "Your agent wants to remove every track. You can undo afterwards.",
      );
      if (!ok) {
        state().logActivity({
          actor: AGENT,
          label: "Asked to clear the song (declined)",
          tool: "clear_song",
        });
        return {
          confirmed: false,
          message: "The human declined. The song is unchanged.",
        };
      }
      commit(
        "Cleared the song (approved by human)",
        "clear_song",
        {},
        (draft) => {
          draft.tracks = [];
        },
      );
      return { confirmed: true, message: "Song cleared." };
    },
  },
  {
    name: "edit_selection",
    description:
      "Act on exactly the steps the human has selected in the grid (see get_song). Actions: clear; transpose (melodic, semitones); scale_velocity (factor); set_pattern (drum, pattern for the selected steps); set_notes (melodic, steps relative to the selection start).",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: [
            "clear",
            "transpose",
            "scale_velocity",
            "set_pattern",
            "set_notes",
          ],
        },
        semitones: { type: "integer", description: "For transpose" },
        factor: {
          type: "number",
          minimum: 0,
          maximum: 2,
          description: "For scale_velocity",
        },
        pattern: {
          type: "string",
          maxLength: 96,
          description:
            "For set_pattern; length must equal the selection length",
        },
        notes: {
          type: "array",
          items: NOTE_ITEM_SCHEMA,
          maxItems: 256,
          description: "For set_notes; step 0 = first selected step",
        },
      },
      required: ["action"],
      additionalProperties: false,
    },
    annotations: ECHOES_SONG_TEXT,
    when: (s) => s.selection !== null,
    execute: (args) => {
      const selection = state().selection;
      if (!selection) throw new Error("The human has no active selection.");
      const { from, to } = selection;
      const length = to - from + 1;
      commit(
        `Edited the selection (${args.action})`,
        "edit_selection",
        args,
        (draft) => {
          const track = findTrack(draft, selection.trackId);
          const inRange = (step: number) => step >= from && step <= to;
          switch (args.action) {
            case "clear":
              if (track.kind === "drum") {
                for (let i = from; i <= to; i++) {
                  track.steps[i] = 0;
                  track.editedBy[i] = AGENT;
                }
              } else {
                track.notes = track.notes.filter((n) => !inRange(n.step));
              }
              break;
            case "transpose": {
              if (track.kind !== "melodic")
                throw new Error("transpose only works on melodic tracks");
              if (args.semitones === undefined)
                throw new Error("transpose needs semitones");
              const semis = Math.round(Number(args.semitones));
              track.notes = track.notes.map((n) =>
                inRange(n.step)
                  ? { ...n, pitch: clamp(n.pitch + semis, 0, 127), by: AGENT }
                  : n,
              );
              widenRange(track);
              break;
            }
            case "scale_velocity": {
              if (args.factor === undefined)
                throw new Error("scale_velocity needs factor");
              const factor = clamp(Number(args.factor), 0, 2);
              if (track.kind === "drum") {
                for (let i = from; i <= to; i++) {
                  if (track.steps[i] > 0) {
                    track.steps[i] = clamp(track.steps[i] * factor, 0.1, 1);
                    track.editedBy[i] = AGENT;
                  }
                }
              } else {
                track.notes = track.notes.map((n) =>
                  inRange(n.step)
                    ? {
                        ...n,
                        velocity: clamp(n.velocity * factor, 0.1, 1),
                        by: AGENT,
                      }
                    : n,
                );
              }
              break;
            }
            case "set_pattern": {
              if (track.kind !== "drum")
                throw new Error("set_pattern only works on drum tracks");
              if (args.pattern === undefined)
                throw new Error("set_pattern needs pattern");
              const values = parsePattern(String(args.pattern));
              if (values.length !== length) {
                throw new Error(
                  `Pattern must have exactly ${length} steps to match the selection`,
                );
              }
              values.forEach((v, i) => {
                track.steps[from + i] = v;
                track.editedBy[from + i] = AGENT;
              });
              break;
            }
            case "set_notes": {
              if (track.kind !== "melodic")
                throw new Error("set_notes only works on melodic tracks");
              const notes = toNotes(
                args.notes as NoteInput[],
                length,
                AGENT,
              ).map((n) => ({ ...n, step: n.step + from }));
              track.notes = [
                ...track.notes.filter((n) => !inRange(n.step)),
                ...notes,
              ];
              widenRange(track);
              break;
            }
            default:
              throw new Error(`Unknown action "${String(args.action)}"`);
          }
        },
      );
      return changed(
        `Applied ${String(args.action)} to steps ${from}-${to}.`,
        selection.trackId,
      );
    },
  },
];

/** Make sure the piano roll shows every note the agent wrote. */
function widenRange(track: MelodicTrack) {
  for (const note of track.notes) {
    if (note.pitch < track.lowNote)
      track.lowNote = Math.max(0, note.pitch - (note.pitch % 12));
    if (note.pitch > track.highNote)
      track.highNote = Math.min(127, note.pitch + (11 - (note.pitch % 12)));
  }
}

/**
 * The single entry point for running a tool, whichever agent is calling: validates the input
 * against the tool's schema, executes, and records the call in the activity feed. Throws with an
 * actionable message on bad input; callers turn that into an `isError` result.
 */
export async function runTool(spec: ToolSpec, rawArgs: unknown) {
  let args: Record<string, unknown> = {};
  try {
    args = validateInput(spec.inputSchema, rawArgs);
    const result = await spec.execute(args);
    if (spec.annotations?.readOnlyHint) {
      state().logActivity({
        actor: AGENT,
        label: spec.readLabel ?? `Called ${spec.name}`,
        tool: spec.name,
        args,
      });
    }
    return result;
  } catch (error) {
    state().logActivity({
      actor: AGENT,
      label: `${spec.name} failed`,
      tool: spec.name,
      args: rawArgs,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
