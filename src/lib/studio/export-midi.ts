import { Midi } from "@tonejs/midi";

import { downloadBlob, songFilename } from "./download";
import { totalSteps, type DrumInstrument, type Song } from "./types";

const DRUM_NOTES: Record<DrumInstrument, number> = {
  kick: 36,
  snare: 38,
  hat_closed: 42,
  hat_open: 46,
  clap: 39,
  tom: 45,
  rim: 37,
  cowbell: 56,
  shaker: 82,
};

const MIDI_PROGRAMS = {
  bass: 38,
  lead: 80,
  pad: 88,
  pluck: 45,
  keys: 4,
} as const;

export function createMidi(song: Song) {
  const midi = new Midi();
  midi.name = song.title;
  midi.header.setTempo(song.bpm);
  midi.header.timeSignatures.push({ ticks: 0, timeSignature: [4, 4] });
  midi.header.update();

  const ticksPerStep = midi.header.ppq / 4;
  const swingTicks = (ticksPerStep * 2 * song.swing) / 3;
  const atStep = (step: number) =>
    Math.round(step * ticksPerStep + (step % 2 === 1 ? swingTicks : 0));
  let melodicChannel = 0;

  for (const source of song.tracks) {
    const track = midi.addTrack();
    track.name = source.name;
    track.endOfTrackTicks = totalSteps(song) * ticksPerStep;
    if (source.kind === "drum") {
      track.channel = 9;
      source.steps.forEach((velocity, step) => {
        if (velocity <= 0) return;
        track.addNote({
          midi: DRUM_NOTES[source.instrument],
          ticks: atStep(step),
          durationTicks: Math.round(ticksPerStep / 2),
          velocity: velocity * source.volume,
        });
      });
    } else {
      if (melodicChannel === 9) melodicChannel += 1;
      track.channel = melodicChannel;
      melodicChannel += 1;
      track.instrument.number = MIDI_PROGRAMS[source.instrument];
      source.notes.forEach((note) => {
        track.addNote({
          midi: note.pitch,
          ticks: atStep(note.step),
          durationTicks: Math.max(
            1,
            Math.round(note.length * ticksPerStep * 0.9),
          ),
          velocity: note.velocity * source.volume,
        });
      });
    }
  }
  return midi.toArray();
}

export function exportMidi(song: Song) {
  const bytes = createMidi(song);
  const filename = songFilename(song.title, "mid");
  downloadBlob(
    new Blob([Uint8Array.from(bytes).buffer], { type: "audio/midi" }),
    filename,
  );
  return filename;
}
