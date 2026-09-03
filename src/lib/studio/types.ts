export type Actor = "human" | "agent";

export const STEPS_PER_BAR = 16;

export type DrumInstrument =
  | "kick"
  | "snare"
  | "hat_closed"
  | "hat_open"
  | "clap"
  | "tom"
  | "rim"
  | "cowbell"
  | "shaker";

export type MelodicInstrument = "bass" | "lead" | "pad" | "pluck" | "keys";

export type Instrument = DrumInstrument | MelodicInstrument;

export type ScaleName =
  | "major"
  | "minor"
  | "dorian"
  | "phrygian"
  | "lydian"
  | "mixolydian"
  | "harmonic_minor"
  | "pentatonic_major"
  | "pentatonic_minor"
  | "blues";

interface TrackBase {
  id: string;
  name: string;
  volume: number; // 0..1
  mute: boolean;
  solo: boolean;
  createdBy: Actor;
  /** Timestamp of the last agent edit, used for the row flash animation. */
  lastAgentEditAt?: number;
}

export interface DrumTrack extends TrackBase {
  kind: "drum";
  instrument: DrumInstrument;
  /** Velocity per step, 0 = rest, up to 1 = accent. Length = bars * 16. */
  steps: number[];
  /** Who last touched each step (null = untouched). */
  editedBy: (Actor | null)[];
}

export interface Note {
  step: number;
  pitch: number; // MIDI
  length: number; // in steps, >= 1
  velocity: number; // 0..1
  by: Actor;
}

export interface MelodicTrack extends TrackBase {
  kind: "melodic";
  instrument: MelodicInstrument;
  notes: Note[];
  /** Piano-roll display range (MIDI, inclusive). */
  lowNote: number;
  highNote: number;
}

export type Track = DrumTrack | MelodicTrack;

export interface Song {
  title: string;
  bpm: number;
  swing: number; // 0..1
  bars: 1 | 2 | 4;
  key: string; // pitch class name, e.g. "A"
  scale: ScaleName;
  tracks: Track[];
}

export interface Selection {
  trackId: string;
  from: number; // inclusive step
  to: number; // inclusive step
}

export interface ActivityEntry {
  id: string;
  at: number;
  actor: Actor;
  label: string;
  tool?: string;
  args?: unknown;
  /** 0-indexed step the change targeted, so get_recent_changes can give the agent an exact index. */
  step?: number;
  /** Song snapshot before the change; absent for read-only or failed calls. */
  before?: Song;
  /** Song snapshot after the change, used by expandable activity receipts. */
  after?: Song;
  error?: string;
}

export function totalSteps(song: Pick<Song, "bars">) {
  return song.bars * STEPS_PER_BAR;
}
