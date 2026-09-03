import {
  Chord,
  Interval,
  Note,
  Progression,
  RhythmPattern,
  RomanNumeral,
  Scale,
  Voicing,
} from "tonal";

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

const MAJOR_DEGREE_SEMITONES = [0, 2, 4, 5, 7, 9, 11];
const ROMAN_TOKEN = /^([#b]*)([ivIV]+)(.*)$/;

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

/** Generate an evenly distributed Euclidean pattern with an optional right rotation. */
export function euclideanPattern(steps: number, hits: number, rotate = 0) {
  if (!Number.isInteger(steps) || steps < 1 || steps > 64)
    throw new Error("euclid.steps must be an integer between 1 and 64");
  if (!Number.isInteger(hits) || hits < 0 || hits > steps)
    throw new Error(`euclid.hits must be an integer between 0 and ${steps}`);
  if (!Number.isInteger(rotate) || rotate < -64 || rotate > 64)
    throw new Error("euclid.rotate must be an integer between -64 and 64");
  return RhythmPattern.rotate(RhythmPattern.euclid(steps, hits), rotate);
}

/**
 * Turn conventional, scale-relative Roman numerals into Tonal chord symbols and close voicings.
 * Tonal's Progression parser is major-relative, so modal scale alterations are folded into the
 * Roman tokens before conversion (A minor `i VI III VII` -> `Im bVI bIII bVII`).
 */
export function romanChordVoicings(
  progression: string,
  root: string,
  scaleName: ScaleName,
  low: number,
  high: number,
) {
  const normalizedRoot = normalizePitchClass(root);
  if (!normalizedRoot) throw new Error(`Unknown key "${root}"`);
  const tokens = progression
    .trim()
    .split(/[\s,|]+/)
    .filter(Boolean);
  if (tokens.length === 0) throw new Error("progression is empty");
  if (tokens.length > 16)
    throw new Error("progression must contain at most 16 chords");

  const scale = Scale.get(`${normalizedRoot} ${TONAL_SCALE[scaleName]}`);
  if (scale.empty || scale.intervals.length !== 7) {
    throw new Error(
      `Roman chord progressions need a seven-note scale; "${scaleName}" has ${scale.intervals.length}.`,
    );
  }

  const tonalTokens = tokens.map((token) => {
    const match = ROMAN_TOKEN.exec(token);
    if (!match) throw new Error(`Invalid Roman chord "${token}"`);
    const [, writtenAccidentals, roman, writtenSuffix] = match;
    const parsed = RomanNumeral.get(roman);
    if (parsed.empty || parsed.step < 0 || parsed.step > 6)
      throw new Error(`Invalid Roman chord "${token}"`);

    const scaleSemitones = Interval.semitones(scale.intervals[parsed.step]);
    if (scaleSemitones === undefined)
      throw new Error(`Could not resolve scale degree in "${token}"`);
    const writtenOffset = [...writtenAccidentals].reduce(
      (sum, accidental) => sum + (accidental === "#" ? 1 : -1),
      0,
    );
    const alteration =
      scaleSemitones - MAJOR_DEGREE_SEMITONES[parsed.step] + writtenOffset;
    const accidentals =
      alteration > 0 ? "#".repeat(alteration) : "b".repeat(-alteration);

    const lowerCase = roman === roman.toLowerCase();
    let suffix = writtenSuffix;
    if (suffix.startsWith("°")) suffix = `dim${suffix.slice(1)}`;
    else if (suffix === "ø" || suffix === "ø7") suffix = "m7b5";
    const explicitTriad = /^(m|dim|aug|\+|sus|5)/.test(suffix);
    if (lowerCase && !explicitTriad) suffix = `m${suffix}`;

    return `${accidentals}${roman.toUpperCase()}${suffix}`;
  });

  const chords = Progression.fromRomanNumerals(normalizedRoot, tonalTokens);
  chords.forEach((chord, index) => {
    if (!chord || Chord.get(chord).empty)
      throw new Error(`Could not resolve Roman chord "${tokens[index]}"`);
  });
  const voicings = Voicing.sequence(chords, [
    midiToNote(low),
    midiToNote(high),
  ]);
  if (
    voicings.length !== chords.length ||
    voicings.some((notes) => !notes.length)
  )
    throw new Error(
      `Could not voice every chord between ${midiToNote(low)} and ${midiToNote(high)}`,
    );
  return { chords, voicings };
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
