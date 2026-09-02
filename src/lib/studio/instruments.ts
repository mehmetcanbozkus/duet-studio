import type { DrumInstrument, Instrument, MelodicInstrument } from "./types";

export interface InstrumentInfo {
  id: Instrument;
  kind: "drum" | "melodic";
  label: string;
  description: string;
  /** Default piano-roll range for melodic instruments (MIDI). */
  range?: [number, number];
}

export const INSTRUMENTS: InstrumentInfo[] = [
  {
    id: "kick",
    kind: "drum",
    label: "Kick",
    description: "Deep 808-style kick drum",
  },
  {
    id: "snare",
    kind: "drum",
    label: "Snare",
    description: "Snappy snare with noise tail",
  },
  {
    id: "hat_closed",
    kind: "drum",
    label: "Closed hat",
    description: "Tight closed hi-hat",
  },
  {
    id: "hat_open",
    kind: "drum",
    label: "Open hat",
    description: "Sizzling open hi-hat",
  },
  { id: "clap", kind: "drum", label: "Clap", description: "Layered hand clap" },
  { id: "tom", kind: "drum", label: "Tom", description: "Pitched tom" },
  { id: "rim", kind: "drum", label: "Rim", description: "Short rimshot click" },
  {
    id: "cowbell",
    kind: "drum",
    label: "Cowbell",
    description: "Classic 808 cowbell",
  },
  {
    id: "shaker",
    kind: "drum",
    label: "Shaker",
    description: "Soft shaker for 16th-note texture",
  },
  {
    id: "bass",
    kind: "melodic",
    label: "Bass",
    description: "Fat saw bass with sub, best between C1 and C3",
    range: [24, 48],
  },
  {
    id: "lead",
    kind: "melodic",
    label: "Lead",
    description: "Bright square lead, best between C3 and C5",
    range: [48, 72],
  },
  {
    id: "pad",
    kind: "melodic",
    label: "Pad",
    description:
      "Slow detuned pad for chords, best between C3 and C5; stack notes on the same step for chords",
    range: [48, 72],
  },
  {
    id: "pluck",
    kind: "melodic",
    label: "Pluck",
    description: "Short plucked tone for arpeggios, best between C3 and C5",
    range: [48, 72],
  },
  {
    id: "keys",
    kind: "melodic",
    label: "Keys",
    description: "Soft electric piano, best between C3 and C5",
    range: [48, 72],
  },
];

export const INSTRUMENT_BY_ID = Object.fromEntries(
  INSTRUMENTS.map((i) => [i.id, i]),
) as Record<Instrument, InstrumentInfo>;

export const DRUM_IDS = INSTRUMENTS.filter((i) => i.kind === "drum").map(
  (i) => i.id,
) as DrumInstrument[];

export const MELODIC_IDS = INSTRUMENTS.filter((i) => i.kind === "melodic").map(
  (i) => i.id,
) as MelodicInstrument[];

export function isInstrument(value: string): value is Instrument {
  return value in INSTRUMENT_BY_ID;
}

export function isDrumInstrument(value: Instrument): value is DrumInstrument {
  return INSTRUMENT_BY_ID[value].kind === "drum";
}
