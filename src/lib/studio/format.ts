import { INSTRUMENT_BY_ID } from "./instruments";
import { midiToNote, velocityToChar } from "./theory";
import {
  STEPS_PER_BAR,
  totalSteps,
  type Note,
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

/** Human-facing position for a range of zero-indexed sequencer steps. */
export function stepRangeLabel(from: number, to: number) {
  const startBar = Math.floor(from / STEPS_PER_BAR) + 1;
  const endBar = Math.floor(to / STEPS_PER_BAR) + 1;
  if (startBar === endBar) {
    const start = (from % STEPS_PER_BAR) + 1;
    const end = (to % STEPS_PER_BAR) + 1;
    return `Bar ${startBar} · ${start === end ? "Step" : "Steps"} ${start === end ? start : `${start}–${end}`}`;
  }
  return `Bars ${startBar}–${endBar} · Song steps ${from + 1}–${to + 1}`;
}

/** Notes as "step:Note(length)" tokens, sorted by step then pitch. */
export function notesString(notes: Note[], maxChars = 800) {
  const sorted = [...notes].sort(
    (a, b) => a.step - b.step || a.pitch - b.pitch,
  );
  const tokens = sorted.map(
    (n) =>
      `${n.step}:${midiToNote(n.pitch)}${n.length > 1 ? `(${n.length})` : ""}`,
  );
  let out = "";
  for (let i = 0; i < tokens.length; i++) {
    const next = out ? `${out} ${tokens[i]}` : tokens[i];
    if (next.length > maxChars) {
      return `${out} … +${tokens.length - i} more (${tokens.length} notes total)`;
    }
    out = next;
  }
  return out;
}

/** One track, small enough to return from a write tool: what changed, nothing else. */
export function summarizeTrack(track: Track) {
  const base = { id: track.id, name: track.name, instrument: track.instrument };
  if (track.kind === "drum")
    return { ...base, pattern: patternString(track.steps) };
  return {
    ...base,
    notes: track.notes.length === 0 ? "(no notes)" : notesString(track.notes),
  };
}

/** One line: title, tempo, length and track names. */
export function songHeadline(song: Song) {
  const tracks =
    song.tracks.length === 0
      ? "no tracks"
      : `${song.tracks.length} track${song.tracks.length > 1 ? "s" : ""}: ${song.tracks.map((t) => t.name).join(", ")}`;
  return `"${song.title}" — ${song.bpm} BPM, ${song.bars} bar${song.bars > 1 ? "s" : ""}, ${tracks}.`;
}

/** Human-and-agent readable snapshot of the song. */
export function describeSong(
  song: Song,
  extra: { playing: boolean; step: number; selection: Selection | null },
) {
  const total = totalSteps(song);
  const lines: string[] = [];
  lines.push(
    `"${song.title}" — ${song.bpm} BPM, swing ${Math.round(song.swing * 100)}%, ${song.bars} bar${song.bars > 1 ? "s" : ""} (steps 0-${total - 1}), key ${song.key} ${song.scale.replace("_", " ")}.`,
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
        lines.push(`   ${notesString(track.notes)}`);
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
  return lines.join("\n");
}
