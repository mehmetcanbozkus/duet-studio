import { Note, Scale } from "tonal";

import type { ScaleName } from "./types";

export const PITCH_CLASSES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
] as const;

/** Our scale ids mapped to tonal's scale names. */
const TONAL_SCALE: Record<ScaleName, string> = {
  major: "major",
  minor: "minor",
  dorian: "dorian",
  phrygian: "phrygian",
  lydian: "lydian",
  mixolydian: "mixolydian",
  harmonic_minor: "harmonic minor",
  pentatonic_major: "major pentatonic",
  pentatonic_minor: "minor pentatonic",
  blues: "minor blues",
};

export const SCALE_NAMES = Object.keys(TONAL_SCALE) as ScaleName[];

export function isScaleName(value: string): value is ScaleName {
  return value in TONAL_SCALE;
}

/** Normalize a pitch class like "bb", "A#", "Db" to a canonical name, or null if invalid. */
export function normalizePitchClass(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const candidate = trimmed[0].toUpperCase() + trimmed.slice(1);
  const chroma = Note.chroma(candidate);
  if (chroma === undefined) return null;
  return PITCH_CLASSES[chroma];
}

/** "A2" -> 45, "C#4" -> 61. Also accepts plain MIDI numbers. */
export function noteToMidi(input: string | number): number {
  if (typeof input === "number") {
    if (!Number.isInteger(input) || input < 0 || input > 127) {
      throw new Error(`MIDI pitch out of range: ${input}`);
    }
    return input;
  }
  const trimmed = String(input).trim();
  if (/^\d+$/.test(trimmed)) return noteToMidi(Number(trimmed));
  const midi = Note.midi(trimmed);
  if (midi === null) {
    throw new Error(
      `Invalid note "${input}". Use scientific pitch like "A2", "C#4", "Bb1" or a MIDI number.`,
    );
  }
  return midi;
}

export function midiToNote(midi: number): string {
  return Note.fromMidiSharps(midi);
}

export function scalePitchClasses(root: string, scale: ScaleName): number[] {
  const normalizedRoot = normalizePitchClass(root);
  if (normalizedRoot === null) throw new Error(`Unknown key "${root}"`);
  const notes = Scale.get(`${normalizedRoot} ${TONAL_SCALE[scale]}`).notes;
  return notes
    .map((n) => Note.chroma(n))
    .filter((c): c is number => typeof c === "number");
}

export function isInScale(midi: number, root: string, scale: ScaleName) {
  return scalePitchClasses(root, scale).includes(((midi % 12) + 12) % 12);
}

/** All scale notes between two MIDI pitches, inclusive. */
export function scaleNotesInRange(
  root: string,
  scale: ScaleName,
  low: number,
  high: number,
): number[] {
  const classes = scalePitchClasses(root, scale);
  const out: number[] = [];
  for (let midi = low; midi <= high; midi++) {
    if (classes.includes(midi % 12)) out.push(midi);
  }
  return out;
}

/**
 * Parse a drum pattern string. Characters: X = accent, x = hit, o = soft/ghost, . or - or 0 = rest.
 * Spaces, commas and bar separators (|) are ignored.
 */
export function parsePattern(pattern: string): number[] {
  const cleaned = pattern.replace(/[\s|,]/g, "");
  const out: number[] = [];
  for (const ch of cleaned) {
    switch (ch) {
      case "X":
        out.push(1);
        break;
      case "x":
      case "1":
        out.push(0.75);
        break;
      case "o":
      case "O":
        out.push(0.4);
        break;
      case ".":
      case "-":
      case "0":
      case "_":
        out.push(0);
        break;
      default:
        throw new Error(
          `Invalid pattern character "${ch}". Use X (accent), x (hit), o (soft), . (rest).`,
        );
    }
  }
  return out;
}

export function velocityToChar(velocity: number): string {
  if (velocity <= 0) return ".";
  if (velocity >= 0.9) return "X";
  if (velocity >= 0.55) return "x";
  return "o";
}
