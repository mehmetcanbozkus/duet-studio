import { nanoid } from "nanoid";
import { z } from "zod";

import { DRUM_IDS, INSTRUMENT_BY_ID, MELODIC_IDS } from "./instruments";
import { SCALE_NAMES, normalizePitchClass } from "./theory";
import {
  totalSteps,
  type DrumInstrument,
  type MelodicInstrument,
  type ScaleName,
  type Song,
} from "./types";

const DEFAULT_TITLE = "Untitled groove";
const MAX_TRACKS = 12;

const actor = z.enum(["human", "agent"]);

const shortText = (max: number) =>
  z
    .string()
    .catch("")
    .transform((s) => s.trim().slice(0, max));

const trackBase = {
  id: z
    .string()
    .min(1)
    .max(32)
    .catch(() => nanoid(8)),
  name: shortText(32),
  volume: z.number().min(0).max(1).catch(0.8),
  mute: z.boolean().catch(false),
  solo: z.boolean().catch(false),
  createdBy: actor.catch("human"),
  lastAgentEditAt: z.number().optional().catch(undefined),
};

const noteSchema = z.object({
  step: z.number().int().min(0),
  pitch: z.number().int().min(0).max(127),
  length: z.number().int().min(1).max(64).catch(1),
  velocity: z.number().min(0.05).max(1).catch(0.8),
  by: actor.catch("human"),
});

const drumTrack = z.object({
  ...trackBase,
  kind: z.literal("drum"),
  instrument: z.enum(DRUM_IDS as [DrumInstrument, ...DrumInstrument[]]),
  steps: z.array(z.number().min(0).max(1).catch(0)).catch([]),
  editedBy: z.array(actor.nullable().catch(null)).catch([]),
});

const melodicTrack = z.object({
  ...trackBase,
  kind: z.literal("melodic"),
  instrument: z.enum(
    MELODIC_IDS as [MelodicInstrument, ...MelodicInstrument[]],
  ),
  notes: z
    .array(z.unknown())
    .catch([])
    .transform((items) =>
      items.flatMap((item) => {
        const parsed = noteSchema.safeParse(item);
        return parsed.success ? [parsed.data] : [];
      }),
    ),
  lowNote: z.number().int().min(0).max(127).catch(48),
  highNote: z.number().int().min(0).max(127).catch(72),
});

const trackSchema = z.discriminatedUnion("kind", [drumTrack, melodicTrack]);

const songSchema = z.object({
  title: shortText(60),
  bpm: z.number().min(40).max(240).transform(Math.round).catch(112),
  swing: z.number().min(0).max(0.6).catch(0),
  bars: z.union([z.literal(1), z.literal(2), z.literal(4)]).catch(2),
  key: z
    .string()
    .catch("A")
    .transform((k) => normalizePitchClass(k) ?? "A"),
  scale: z.enum(SCALE_NAMES as [ScaleName, ...ScaleName[]]).catch("minor"),
  // Invalid tracks are dropped rather than failing the whole song; a non-array is not a song.
  tracks: z.array(z.unknown()).transform((items) =>
    items.slice(0, MAX_TRACKS).flatMap((item) => {
      const parsed = trackSchema.safeParse(item);
      return parsed.success ? [parsed.data] : [];
    }),
  ),
});

/**
 * Turn untrusted data (a share link, persisted localStorage, anything that claims to be a song)
 * into a well-formed Song. Scalar fields are repaired to defaults, invalid tracks and notes are
 * dropped, step arrays are resized to the song length. Throws when the input is not a song at all.
 */
export function parseSong(input: unknown): Song {
  const result = songSchema.safeParse(input);
  if (!result.success) throw new Error("Not a song");
  const song = result.data;
  const total = totalSteps(song);
  const seen = new Set<string>();
  const tracks: Song["tracks"] = song.tracks.map((track) => {
    const id = seen.has(track.id) ? nanoid(8) : track.id;
    seen.add(id);
    const name = track.name || INSTRUMENT_BY_ID[track.instrument].label;
    if (track.kind === "drum") {
      return {
        ...track,
        id,
        name,
        steps: Array.from({ length: total }, (_, i) => track.steps[i] ?? 0),
        editedBy: Array.from(
          { length: total },
          (_, i) => track.editedBy[i] ?? null,
        ),
      };
    }
    return {
      ...track,
      id,
      name,
      notes: track.notes.filter((n) => n.step < total),
      lowNote: Math.min(track.lowNote, track.highNote),
      highNote: Math.max(track.lowNote, track.highNote),
    };
  });
  return {
    title: song.title || DEFAULT_TITLE,
    bpm: song.bpm,
    swing: song.swing,
    bars: song.bars,
    key: song.key,
    scale: song.scale,
    tracks,
  };
}
