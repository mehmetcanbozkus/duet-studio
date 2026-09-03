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

/** One step in the words the grid uses with the human: bars and steps counted from 1. */
export function stepLabel(step: number) {
  return `bar ${Math.floor(step / STEPS_PER_BAR) + 1} step ${(step % STEPS_PER_BAR) + 1}`;
}

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
/**
 * Chrome asks for a single tool output to stay near 1.5K characters. A song with several dense
 * melodic tracks blows past that, so the overview shortens its note lists until it fits and points
 * the agent at `get_song track=<id>`, which returns that one track in full.
 */
const OVERVIEW_BUDGET = 1400;
const NOTE_CAPS = [800, 400, 200, 100, 50];

export function describeSong(
  song: Song,
  extra: { playing: boolean; step: number; selection: Selection | null },
  focus?: Track,
) {
  const total = totalSteps(song);
  const head = [
    `"${song.title}" — ${song.bpm} BPM, swing ${Math.round(song.swing * 100)}%, ${song.bars} bar${song.bars > 1 ? "s" : ""} (steps 0-${total - 1}), key ${song.key} ${song.scale.replace("_", " ")}.`,
    extra.playing
      ? `Transport: playing, at step ${extra.step}.`
      : "Transport: stopped.",
  ];
  const tail: string[] = [];
  if (extra.selection) {
    const track = song.tracks.find((t) => t.id === extra.selection?.trackId);
    if (track) {
      tail.push(
        `The human has selected steps ${extra.selection.from}-${extra.selection.to} on track "${track.name}" (id ${track.id}). Use edit_selection to act on exactly that range.`,
      );
    }
  }

  const trackLines = (track: Track, index: number, noteCap: number) => {
    const flags = [track.mute ? "muted" : null, track.solo ? "solo" : null]
      .filter(Boolean)
      .join(", ");
    // The instrument id, not its label: every tool's `track` argument accepts it verbatim.
    const lines = [
      `${index + 1}. ${track.name} [${track.instrument}, id=${track.id}, vol ${track.volume.toFixed(2)}${flags ? ", " + flags : ""}]`,
    ];
    if (track.kind === "drum") lines.push(`   ${patternString(track.steps)}`);
    else if (track.notes.length === 0) lines.push("   (no notes)");
    else lines.push(`   ${notesString(track.notes, noteCap)}`);
    return lines;
  };

  if (focus) {
    const index = song.tracks.findIndex((t) => t.id === focus.id);
    return [
      ...head,
      `Track ${index + 1} of ${song.tracks.length}, in full:`,
      ...trackLines(focus, index, Number.MAX_SAFE_INTEGER),
      ...tail,
    ].join("\n");
  }

  if (song.tracks.length === 0) {
    return [...head, "No tracks yet. Use add_track.", ...tail].join("\n");
  }

  const render = (noteCap: number) => {
    const lines = [
      ...head,
      "Tracks:",
      ...song.tracks.flatMap((track, index) =>
        trackLines(track, index, noteCap),
      ),
    ];
    const shortened = lines.some((line) => line.includes("… +"));
    if (shortened) {
      lines.push(
        'Note lists above are shortened; read one track in full with get_song track="<id>".',
      );
    }
    return [...lines, ...tail].join("\n");
  };

  const last = NOTE_CAPS[NOTE_CAPS.length - 1];
  for (const cap of NOTE_CAPS) {
    const text = render(cap);
    if (text.length <= OVERVIEW_BUDGET || cap === last) return text;
  }
  return render(last);
}
