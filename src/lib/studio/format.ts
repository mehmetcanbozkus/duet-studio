import { INSTRUMENT_BY_ID } from "./instruments";
import { midiToNote, velocityToChar } from "./theory";
import {
  STEPS_PER_BAR,
  totalSteps,
  type Selection,
  type Song,
  type Track,
} from "./types";

export function patternString(steps: number[]) {
  let out = "|";
  for (let i = 0; i < steps.length; i++) {
    out += velocityToChar(steps[i]);
    if ((i + 1) % STEPS_PER_BAR === 0) out += "|";
  }
  return out;
}

export function compactTrack(track: Track) {
  const base = {
    id: track.id,
    name: track.name,
    kind: track.kind,
    instrument: track.instrument,
    volume: Number(track.volume.toFixed(2)),
    mute: track.mute,
    solo: track.solo,
  };
  if (track.kind === "drum") {
    return { ...base, pattern: patternString(track.steps) };
  }
  return {
    ...base,
    range: `${midiToNote(track.lowNote)}-${midiToNote(track.highNote)}`,
    notes: [...track.notes]
      .sort((a, b) => a.step - b.step || a.pitch - b.pitch)
      .map((n) => ({
        step: n.step,
        note: midiToNote(n.pitch),
        length: n.length,
        velocity: Number(n.velocity.toFixed(2)),
      })),
  };
}

/** Human-and-agent readable snapshot of the song. */
export function describeSong(
  song: Song,
  extra: { playing: boolean; step: number; selection: Selection | null },
) {
  const total = totalSteps(song);
  const lines: string[] = [];
  lines.push(
    `"${song.title}" — ${song.bpm} BPM, swing ${Math.round(song.swing * 100)}%, ${song.bars} bar${song.bars > 1 ? "s" : ""} (${total} steps, ${STEPS_PER_BAR} per bar, steps are 0-indexed 16th notes), key ${song.key} ${song.scale.replace("_", " ")}.`,
  );
  lines.push(
    extra.playing
      ? `Transport: playing, at step ${extra.step}.`
      : "Transport: stopped.",
  );
  if (song.tracks.length === 0) {
    lines.push("No tracks yet. Use add_track.");
  } else {
    lines.push("Tracks:");
    song.tracks.forEach((track, index) => {
      const info = INSTRUMENT_BY_ID[track.instrument];
      const flags = [track.mute ? "muted" : null, track.solo ? "solo" : null]
        .filter(Boolean)
        .join(", ");
      const header = `${index + 1}. ${track.name} [${info.label.toLowerCase()}, id=${track.id}, vol ${track.volume.toFixed(2)}${flags ? ", " + flags : ""}]`;
      lines.push(header);
      if (track.kind === "drum") {
        lines.push(`   ${patternString(track.steps)}`);
      } else if (track.notes.length === 0) {
        lines.push("   (no notes)");
      } else {
        const notes = [...track.notes]
          .sort((a, b) => a.step - b.step || a.pitch - b.pitch)
          .map(
            (n) =>
              `${n.step}:${midiToNote(n.pitch)}${n.length > 1 ? `(${n.length})` : ""}`,
          );
        lines.push(`   ${notes.join(" ")}`);
      }
    });
  }
  if (extra.selection) {
    const track = song.tracks.find((t) => t.id === extra.selection?.trackId);
    if (track) {
      lines.push(
        `The human has selected steps ${extra.selection.from}-${extra.selection.to} on track "${track.name}" (id ${track.id}). Use edit_selection to act on exactly that range.`,
      );
    }
  }
  lines.push(
    "Pattern legend: X accent, x hit, o soft, . rest; bars separated by |. Melodic notation: step:Note(length in steps).",
  );
  return lines.join("\n");
}
