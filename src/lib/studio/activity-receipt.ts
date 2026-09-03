import { INSTRUMENT_BY_ID, isInstrument } from "./instruments";
import { findTrack } from "./song";
import type { ActivityEntry } from "./types";

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
