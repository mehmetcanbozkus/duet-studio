import { INSTRUMENT_BY_ID, isInstrument } from "./instruments";
import { notesString, patternString, songHeadline } from "./format";
import { findTrack } from "./song";
import type { ActivityEntry, Song, Track } from "./types";

function argsOf(entry: ActivityEntry): Record<string, unknown> | null {
  return typeof entry.args === "object" && entry.args !== null
    ? (entry.args as Record<string, unknown>)
    : null;
}

function words(value: unknown) {
  return String(value).replaceAll("_", " ");
}

function titleCase(value: unknown) {
  const text = words(value);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function trackName(entry: ActivityEntry, ref: unknown) {
  if (ref === undefined) return undefined;
  if (entry.before) {
    try {
      return findTrack(entry.before, String(ref)).name;
    } catch {
      // The receipt still works when an old or invalid reference cannot be resolved.
    }
  }
  return String(ref);
}

function percent(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? `${Math.round(number * 100)}%` : undefined;
}

export interface ActivityDetail {
  label: string;
  value: string;
}

function inputDetails(args: Record<string, unknown>) {
  const lines = Object.entries(args).map(([key, value]) => {
    const rendered = typeof value === "string" ? value : JSON.stringify(value);
    return `${titleCase(key)}: ${rendered}`;
  });
  const text = lines.join("\n");
  return text.length > 500 ? `${text.slice(0, 497)}…` : text;
}

function trackSnapshot(track: Track) {
  const info = INSTRUMENT_BY_ID[track.instrument];
  const flags = [
    track.mute ? "Muted" : undefined,
    track.solo ? "Solo" : undefined,
  ]
    .filter(Boolean)
    .join(" · ");
  const header = `${track.name} · ${info.label} · Volume ${percent(track.volume)}${flags ? ` · ${flags}` : ""}`;
  const content =
    track.kind === "drum"
      ? patternString(track.steps)
      : track.notes.length === 0
        ? "No notes"
        : notesString(track.notes, 240);
  return `${header}\n${content}`;
}

function changedTrackIds(before: Song, after: Song) {
  const ids = new Set([
    ...before.tracks.map((track) => track.id),
    ...after.tracks.map((track) => track.id),
  ]);
  return [...ids].filter((id) => {
    const previous = before.tracks.find((track) => track.id === id);
    const next = after.tracks.find((track) => track.id === id);
    return JSON.stringify(previous) !== JSON.stringify(next);
  });
}

function songMetadataChanged(before: Song, after: Song) {
  return (
    before.title !== after.title ||
    before.bpm !== after.bpm ||
    before.swing !== after.swing ||
    before.bars !== after.bars ||
    before.key !== after.key ||
    before.scale !== after.scale
  );
}

/** Compact input and before/after evidence for an expandable session receipt. */
export function activityDetails(entry: ActivityEntry): ActivityDetail[] {
  const details: ActivityDetail[] = [];
  const args = argsOf(entry);
  if (args && Object.keys(args).length > 0) {
    details.push({ label: "Input", value: inputDetails(args) });
  }
  if (!entry.before || !entry.after) return details;

  const changed = changedTrackIds(entry.before, entry.after);
  if (!songMetadataChanged(entry.before, entry.after) && changed.length === 1) {
    const id = changed[0];
    const before = entry.before.tracks.find((track) => track.id === id);
    const after = entry.after.tracks.find((track) => track.id === id);
    details.push({
      label: "Before",
      value: before ? trackSnapshot(before) : "Track not present",
    });
    details.push({
      label: "After",
      value: after ? trackSnapshot(after) : "Track removed",
    });
    return details;
  }

  details.push({ label: "Before", value: songHeadline(entry.before) });
  details.push({ label: "After", value: songHeadline(entry.after) });
  return details;
}

/** Turn raw tool calls into short, human-readable receipts for the shared session log. */
export function activityReceipt(entry: ActivityEntry) {
  const args = argsOf(entry);
  if (!entry.tool) return entry.label;

  if (entry.error) {
    return entry.label === `${entry.tool} failed`
      ? `${titleCase(entry.tool)} failed`
      : entry.label;
  }
  if (!args) return entry.label;

  switch (entry.tool) {
    case "set_tempo": {
      const details = [
        args.bpm === undefined
          ? undefined
          : `${Math.round(Number(args.bpm))} BPM`,
        args.swing === undefined ? undefined : `Swing ${percent(args.swing)}`,
      ].filter(Boolean);
      return details.length > 0
        ? `Tempo · ${details.join(" · ")}`
        : entry.label;
    }

    case "set_song_meta": {
      const details = [
        typeof args.title === "string" && args.title.trim()
          ? `“${args.title.trim()}”`
          : undefined,
        args.key === undefined ? undefined : String(args.key),
        args.scale === undefined ? undefined : words(args.scale),
        args.bars === undefined
          ? undefined
          : `${String(args.bars)} ${Number(args.bars) === 1 ? "bar" : "bars"}`,
      ].filter(Boolean);
      return details.length > 0 ? `Song · ${details.join(" · ")}` : entry.label;
    }

    case "add_track": {
      const instrument = String(args.instrument);
      const name =
        typeof args.name === "string" && args.name.trim()
          ? args.name.trim()
          : isInstrument(instrument)
            ? INSTRUMENT_BY_ID[instrument].label
            : titleCase(instrument);
      return `${name} track added`;
    }

    case "remove_track": {
      const name = trackName(entry, args.track);
      return name ? `${name} removed` : entry.label;
    }

    case "update_track": {
      const name = trackName(entry, args.track);
      const details = [
        typeof args.name === "string" && args.name.trim()
          ? `Renamed “${args.name.trim()}”`
          : undefined,
        args.volume === undefined
          ? undefined
          : `Volume ${percent(args.volume)}`,
        typeof args.mute === "boolean"
          ? args.mute
            ? "Muted"
            : "Unmuted"
          : undefined,
        typeof args.solo === "boolean"
          ? `Solo ${args.solo ? "on" : "off"}`
          : undefined,
      ].filter(Boolean);
      return name && details.length > 0
        ? `${name} · ${details.join(" · ")}`
        : entry.label;
    }

    case "set_drum_pattern": {
      const name = trackName(entry, args.track);
      const euclid =
        typeof args.euclid === "object" && args.euclid !== null
          ? (args.euclid as Record<string, unknown>)
          : null;
      const kind = euclid
        ? `Euclidean ${String(euclid.hits)}/${String(euclid.steps)} written`
        : "Pattern written";
      const bar =
        args.bar === undefined ? undefined : `Bar ${String(args.bar)}`;
      return name ? [name, bar, kind].filter(Boolean).join(" · ") : entry.label;
    }

    case "set_notes": {
      const name = trackName(entry, args.track);
      const count = Array.isArray(args.notes) ? args.notes.length : undefined;
      if (!name || count === undefined) return entry.label;
      return `${name} · ${count} note${count === 1 ? "" : "s"} ${args.mode === "merge" ? "merged" : "written"}`;
    }

    case "set_chords": {
      const name =
        trackName(entry, args.track) ??
        entry.before?.tracks.find(
          (track) =>
            track.kind === "melodic" &&
            (track.instrument === "pad" || track.instrument === "keys"),
        )?.name ??
        "Chords";
      return typeof args.progression === "string"
        ? `${name} · ${args.progression.trim()} written`
        : entry.label;
    }

    case "humanize": {
      const name = trackName(entry, args.track) ?? "All tracks";
      return `${name} · Humanized ${percent(args.amount ?? 0.3)}`;
    }

    case "edit_selection": {
      const action =
        args.action === "scale_velocity"
          ? "Velocity scaled"
          : args.action === "set_pattern"
            ? "Pattern written"
            : args.action === "set_notes"
              ? "Notes written"
              : args.action === "transpose"
                ? `Transposed ${String(args.semitones)} semitones`
                : args.action === "clear"
                  ? "Cleared"
                  : undefined;
      return action ? `Selection · ${action}` : entry.label;
    }

    default:
      return entry.label;
  }
}
