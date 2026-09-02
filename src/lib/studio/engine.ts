import * as Tone from "tone";

import { midiToNote } from "./theory";
import {
  totalSteps,
  type DrumInstrument,
  type Instrument,
  type MelodicInstrument,
  type Song,
  type Track,
} from "./types";

interface Voice {
  channel: Tone.Channel;
  /** Trigger a hit. `pitch` is MIDI for melodic instruments and ignored for drums. */
  trigger: (
    time: number,
    velocity: number,
    pitch?: number,
    seconds?: number,
  ) => void;
  dispose: () => void;
}

function drumVoice(instrument: DrumInstrument, channel: Tone.Channel): Voice {
  const nodes: { dispose: () => void }[] = [];
  const keep = <T extends { dispose: () => void }>(node: T) => {
    nodes.push(node);
    return node;
  };
  let trigger: Voice["trigger"];
  switch (instrument) {
    case "kick": {
      const synth = keep(
        new Tone.MembraneSynth({
          pitchDecay: 0.05,
          octaves: 6,
          oscillator: { type: "sine" },
          envelope: { attack: 0.001, decay: 0.4, sustain: 0.01, release: 0.4 },
        }),
      ).connect(channel);
      trigger = (time, vel) =>
        synth.triggerAttackRelease("C1", "8n", time, vel);
      break;
    }
    case "tom": {
      const synth = keep(
        new Tone.MembraneSynth({
          pitchDecay: 0.08,
          octaves: 3,
          envelope: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.3 },
        }),
      ).connect(channel);
      trigger = (time, vel) =>
        synth.triggerAttackRelease("A2", "8n", time, vel);
      break;
    }
    case "snare": {
      const filter = keep(
        new Tone.Filter({ frequency: 1800, type: "bandpass", Q: 0.6 }),
      ).connect(channel);
      const noise = keep(
        new Tone.NoiseSynth({
          noise: { type: "white" },
          envelope: { attack: 0.001, decay: 0.18, sustain: 0 },
        }),
      ).connect(filter);
      const body = keep(
        new Tone.MembraneSynth({
          pitchDecay: 0.02,
          octaves: 2,
          envelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.1 },
          volume: -8,
        }),
      ).connect(channel);
      trigger = (time, vel) => {
        noise.triggerAttackRelease("16n", time, vel);
        body.triggerAttackRelease("G2", "16n", time, vel * 0.8);
      };
      break;
    }
    case "clap": {
      const filter = keep(
        new Tone.Filter({ frequency: 1200, type: "bandpass", Q: 1 }),
      ).connect(channel);
      const noise = keep(
        new Tone.NoiseSynth({
          noise: { type: "pink" },
          envelope: { attack: 0.002, decay: 0.14, sustain: 0 },
        }),
      ).connect(filter);
      trigger = (time, vel) => {
        noise.triggerAttackRelease("16n", time, vel * 0.6);
        noise.triggerAttackRelease("16n", time + 0.012, vel * 0.7);
        noise.triggerAttackRelease("16n", time + 0.024, vel);
      };
      break;
    }
    case "shaker": {
      const filter = keep(
        new Tone.Filter({ frequency: 6500, type: "highpass" }),
      ).connect(channel);
      const noise = keep(
        new Tone.NoiseSynth({
          noise: { type: "white" },
          envelope: { attack: 0.01, decay: 0.06, sustain: 0 },
          volume: -6,
        }),
      ).connect(filter);
      trigger = (time, vel) => noise.triggerAttackRelease("32n", time, vel);
      break;
    }
    case "hat_closed":
    case "hat_open": {
      const open = instrument === "hat_open";
      const synth = keep(
        new Tone.MetalSynth({
          envelope: { attack: 0.001, decay: open ? 0.45 : 0.08, release: 0.02 },
          harmonicity: 5.1,
          modulationIndex: 32,
          resonance: 4000,
          octaves: 1.5,
          volume: -12,
        }),
      ).connect(channel);
      trigger = (time, vel) =>
        synth.triggerAttackRelease("C6", open ? "8n" : "32n", time, vel);
      break;
    }
    case "cowbell": {
      const synth = keep(
        new Tone.MetalSynth({
          harmonicity: 12,
          resonance: 800,
          modulationIndex: 20,
          envelope: { attack: 0.001, decay: 0.35, release: 0.05 },
          volume: -14,
        }),
      ).connect(channel);
      trigger = (time, vel) =>
        synth.triggerAttackRelease("D5", "16n", time, vel);
      break;
    }
    case "rim": {
      const synth = keep(
        new Tone.Synth({
          oscillator: { type: "square" },
          envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.02 },
          volume: -6,
        }),
      ).connect(channel);
      trigger = (time, vel) =>
        synth.triggerAttackRelease("C6", "64n", time, vel);
      break;
    }
  }
  return { channel, trigger, dispose: () => nodes.forEach((n) => n.dispose()) };
}

function melodicVoice(
  instrument: MelodicInstrument,
  channel: Tone.Channel,
): Voice {
  const nodes: { dispose: () => void }[] = [];
  const keep = <T extends { dispose: () => void }>(node: T) => {
    nodes.push(node);
    return node;
  };
  let trigger: Voice["trigger"];
  switch (instrument) {
    case "bass": {
      const synth = keep(
        new Tone.MonoSynth({
          oscillator: { type: "sawtooth" },
          filter: { Q: 2, type: "lowpass", rolloff: -24 },
          envelope: { attack: 0.005, decay: 0.2, sustain: 0.5, release: 0.15 },
          filterEnvelope: {
            attack: 0.005,
            decay: 0.18,
            sustain: 0.3,
            release: 0.2,
            baseFrequency: 120,
            octaves: 3,
          },
          volume: -6,
        }),
      ).connect(channel);
      trigger = (time, vel, pitch = 45, seconds = 0.2) =>
        synth.triggerAttackRelease(midiToNote(pitch), seconds, time, vel);
      break;
    }
    case "lead": {
      const synth = keep(
        new Tone.MonoSynth({
          oscillator: { type: "square" },
          filter: { Q: 1, type: "lowpass", rolloff: -12 },
          envelope: { attack: 0.01, decay: 0.15, sustain: 0.5, release: 0.15 },
          filterEnvelope: {
            attack: 0.01,
            decay: 0.2,
            sustain: 0.6,
            release: 0.2,
            baseFrequency: 600,
            octaves: 2.5,
          },
          volume: -12,
        }),
      ).connect(channel);
      trigger = (time, vel, pitch = 60, seconds = 0.2) =>
        synth.triggerAttackRelease(midiToNote(pitch), seconds, time, vel);
      break;
    }
    case "pad": {
      const filter = keep(
        new Tone.Filter({ frequency: 1400, type: "lowpass", rolloff: -12 }),
      ).connect(channel);
      const synth = keep(
        new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: "fatsawtooth", count: 3, spread: 24 },
          envelope: { attack: 0.15, decay: 0.3, sustain: 0.7, release: 0.8 },
          volume: -16,
        }),
      ).connect(filter);
      trigger = (time, vel, pitch = 60, seconds = 0.5) =>
        synth.triggerAttackRelease(midiToNote(pitch), seconds, time, vel);
      break;
    }
    case "pluck": {
      const synth = keep(
        new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: "triangle" },
          envelope: { attack: 0.001, decay: 0.25, sustain: 0, release: 0.2 },
          volume: -8,
        }),
      ).connect(channel);
      trigger = (time, vel, pitch = 60, seconds = 0.2) =>
        synth.triggerAttackRelease(midiToNote(pitch), seconds, time, vel);
      break;
    }
    case "keys": {
      const synth = keep(
        new Tone.PolySynth(Tone.FMSynth, {
          harmonicity: 3,
          modulationIndex: 6,
          envelope: { attack: 0.005, decay: 0.5, sustain: 0.2, release: 0.6 },
          modulationEnvelope: {
            attack: 0.002,
            decay: 0.3,
            sustain: 0.1,
            release: 0.4,
          },
          volume: -12,
        }),
      ).connect(channel);
      trigger = (time, vel, pitch = 60, seconds = 0.3) =>
        synth.triggerAttackRelease(midiToNote(pitch), seconds, time, vel);
      break;
    }
  }
  return { channel, trigger, dispose: () => nodes.forEach((n) => n.dispose()) };
}

function createVoice(instrument: Instrument, kind: Track["kind"]): Voice {
  const channel = new Tone.Channel({ volume: 0, pan: 0 }).toDestination();
  return kind === "drum"
    ? drumVoice(instrument as DrumInstrument, channel)
    : melodicVoice(instrument as MelodicInstrument, channel);
}

export interface EngineHooks {
  getSong: () => Song;
  onStep: (step: number) => void;
  onStop: () => void;
}

/**
 * Sequencer engine built on Tone.js. Reads the latest song on every 16th note, so edits
 * from the human or the agent are heard on the next step without restarting playback.
 */
export class Engine {
  private voices = new Map<string, Voice & { instrument: Instrument }>();
  private repeatId: number | null = null;
  private counter = 0;
  private hooks: EngineHooks;

  constructor(hooks: EngineHooks) {
    this.hooks = hooks;
  }

  /** Must be called from a user gesture at least once so the AudioContext can run. */
  async unlock() {
    await Tone.start();
    return Tone.getContext().state === "running";
  }

  get isUnlocked() {
    return Tone.getContext().state === "running";
  }

  get isPlaying() {
    return Tone.getTransport().state === "started";
  }

  syncTransport(song: Song) {
    const transport = Tone.getTransport();
    transport.bpm.value = song.bpm;
    transport.swing = song.swing;
    transport.swingSubdivision = "16n";
  }

  async play() {
    const running = await this.unlock();
    if (!running) return false;
    const transport = Tone.getTransport();
    if (transport.state === "started") return true;
    this.syncTransport(this.hooks.getSong());
    this.counter = 0;
    if (this.repeatId !== null) transport.clear(this.repeatId);
    this.repeatId = transport.scheduleRepeat(
      (time) => this.tick(time),
      "16n",
      0,
    );
    transport.start("+0.05");
    return true;
  }

  stop() {
    const transport = Tone.getTransport();
    if (this.repeatId !== null) {
      transport.clear(this.repeatId);
      this.repeatId = null;
    }
    transport.stop();
    transport.position = 0;
    this.counter = 0;
    this.hooks.onStop();
  }

  /** Audition a single hit right now (used when the human clicks a cell). */
  preview(track: Track, pitch?: number) {
    if (!this.isUnlocked) return;
    const voice = this.voiceFor(track);
    const seconds = Tone.Time("16n").toSeconds() * 2;
    voice.trigger(Tone.now(), 0.8, pitch, seconds);
  }

  dispose() {
    this.stop();
    for (const voice of this.voices.values()) {
      voice.dispose();
      voice.channel.dispose();
    }
    this.voices.clear();
  }

  private voiceFor(track: Track) {
    const existing = this.voices.get(track.id);
    if (existing && existing.instrument === track.instrument) return existing;
    if (existing) {
      existing.dispose();
      existing.channel.dispose();
    }
    const voice = {
      ...createVoice(track.instrument, track.kind),
      instrument: track.instrument,
    };
    this.voices.set(track.id, voice);
    return voice;
  }

  private tick(time: number) {
    const song = this.hooks.getSong();
    const total = totalSteps(song);
    const step = this.counter % total;
    this.counter += 1;
    this.syncTransport(song);

    const ids = new Set(song.tracks.map((t) => t.id));
    for (const [id, voice] of this.voices) {
      if (!ids.has(id)) {
        voice.dispose();
        voice.channel.dispose();
        this.voices.delete(id);
      }
    }

    const stepSeconds = Tone.Time("16n").toSeconds();
    for (const track of song.tracks) {
      const voice = this.voiceFor(track);
      voice.channel.volume.value = Tone.gainToDb(track.volume);
      voice.channel.mute = track.mute;
      voice.channel.solo = track.solo;
      if (track.kind === "drum") {
        const velocity = track.steps[step] ?? 0;
        if (velocity > 0) voice.trigger(time, velocity);
      } else {
        for (const note of track.notes) {
          if (note.step === step) {
            voice.trigger(
              time,
              note.velocity,
              note.pitch,
              stepSeconds * note.length * 0.9,
            );
          }
        }
      }
    }

    Tone.getDraw().schedule(() => this.hooks.onStep(step), time);
  }
}
