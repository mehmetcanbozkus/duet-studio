import { nanoid } from "nanoid";

import { INSTRUMENT_BY_ID, isDrumInstrument } from "./instruments";
import { parsePattern } from "./theory";
import {
  STEPS_PER_BAR,
  totalSteps,
  type Actor,
  type DrumTrack,
  type Instrument,
  type MelodicTrack,
  type Song,
  type Track,
} from "./types";

export function createTrack(
  instrument: Instrument,
  actor: Actor,
  song: Pick<Song, "bars">,
  name?: string,
): Track {
  const info = INSTRUMENT_BY_ID[instrument];
  const steps = totalSteps(song);
  const base = {
    id: nanoid(8),
    name: name?.trim() || info.label,
    volume: 0.8,
    mute: false,
    solo: false,
    createdBy: actor,
  };
  if (isDrumInstrument(instrument)) {
    const track: DrumTrack = {
      ...base,
      kind: "drum",
      instrument,
      steps: new Array<number>(steps).fill(0),
      editedBy: new Array<Actor | null>(steps).fill(null),
    };
    return track;
  }
  const [low, high] = info.range ?? [48, 72];
  const track: MelodicTrack = {
    ...base,
    kind: "melodic",
    instrument,
    notes: [],
    lowNote: low,
    highNote: high,
  };
  return track;
}

/** Fill a drum track from a pattern string, tiling short patterns across the song. */
export function applyPattern(
  track: DrumTrack,
  pattern: string,
  actor: Actor,
  bar?: number,
) {
  const values = parsePattern(pattern);
  const total = track.steps.length;
  if (bar !== undefined) {
    const bars = total / STEPS_PER_BAR;
    if (!Number.isInteger(bar) || bar < 1 || bar > bars) {
      throw new Error(`bar must be between 1 and ${bars}`);
    }
    if (values.length !== STEPS_PER_BAR) {
      throw new Error(
        `A single bar pattern must have exactly ${STEPS_PER_BAR} steps, got ${values.length}`,
      );
    }
    const offset = (bar - 1) * STEPS_PER_BAR;
    values.forEach((v, i) => {
      track.steps[offset + i] = v;
      track.editedBy[offset + i] = actor;
    });
    return;
  }
  if (values.length === 0) throw new Error("Pattern is empty");
  if (total % values.length !== 0) {
    throw new Error(
      `Pattern length ${values.length} does not divide the song length of ${total} steps. Use ${STEPS_PER_BAR} steps per bar (song has ${total / STEPS_PER_BAR} bars).`,
    );
  }
  for (let i = 0; i < total; i++) {
    track.steps[i] = values[i % values.length];
    track.editedBy[i] = actor;
  }
}

/** Resize every track when the bar count changes; growing tiles the existing material. */
export function resizeSong(song: Song, bars: 1 | 2 | 4) {
  const oldTotal = totalSteps(song);
  const newTotal = bars * STEPS_PER_BAR;
  song.bars = bars;
  for (const track of song.tracks) {
    if (track.kind === "drum") {
      const steps = new Array<number>(newTotal).fill(0);
      const editedBy = new Array<Actor | null>(newTotal).fill(null);
      for (let i = 0; i < newTotal; i++) {
        steps[i] = track.steps[i % oldTotal] ?? 0;
        editedBy[i] = track.editedBy[i % oldTotal] ?? null;
      }
      track.steps = steps;
      track.editedBy = editedBy;
    } else {
      if (newTotal > oldTotal) {
        const copies = newTotal / oldTotal;
        const tiled = [...track.notes];
        for (let c = 1; c < copies; c++) {
          for (const n of track.notes)
            tiled.push({ ...n, step: n.step + c * oldTotal });
        }
        track.notes = tiled;
      } else {
        track.notes = track.notes.filter((n) => n.step < newTotal);
      }
    }
  }
}

/** Find a track by id, exact name (case-insensitive) or 1-based position. */
export function findTrack(song: Song, ref: string | number): Track {
  const text = String(ref).trim();
  const byId = song.tracks.find((t) => t.id === text);
  if (byId) return byId;
  const lower = text.toLowerCase();
  const byName = song.tracks.filter((t) => t.name.toLowerCase() === lower);
  if (byName.length === 1) return byName[0];
  if (byName.length > 1) {
    throw new Error(
      `Several tracks are named "${text}". Use the track id instead: ${byName.map((t) => t.id).join(", ")}`,
    );
  }
  const byInstrument = song.tracks.filter((t) => t.instrument === lower);
  if (byInstrument.length === 1) return byInstrument[0];
  if (/^\d+$/.test(text)) {
    const index = Number(text) - 1;
    if (song.tracks[index]) return song.tracks[index];
  }
  throw new Error(
    `No track matches "${text}". Available: ${song.tracks.map((t) => `${t.name} (id ${t.id})`).join(", ") || "none"}`,
  );
}

export function defaultSong(): Song {
  const song: Song = {
    title: "Untitled groove",
    bpm: 112,
    swing: 0,
    bars: 2,
    key: "A",
    scale: "minor",
    tracks: [],
  };
  const kick = createTrack("kick", "human", song) as DrumTrack;
  applyPattern(kick, "X...x...X...x...", "human");
  kick.editedBy.fill(null);
  const hat = createTrack("hat_closed", "human", song, "Hats") as DrumTrack;
  applyPattern(hat, "..x...x...x...x.", "human");
  hat.editedBy.fill(null);
  const bass = createTrack("bass", "human", song) as MelodicTrack;
  song.tracks = [kick, hat, bass];
  return song;
}
