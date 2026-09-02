import {
  compressToEncodedURIComponent,
  decompressFromEncodedURIComponent,
} from "lz-string";

import { parseSong } from "./song-schema";
import type { Song } from "./types";

export function encodeSong(song: Song): string {
  return compressToEncodedURIComponent(JSON.stringify(song));
}

/** Decode a share payload. Anyone can craft a link, so the result goes through `parseSong`. */
export function decodeSong(encoded: string): Song {
  const json = decompressFromEncodedURIComponent(encoded);
  if (!json) throw new Error("Could not decode song");
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("Could not decode song");
  }
  return parseSong(parsed);
}

export function songShareUrl(song: Song) {
  const url = new URL(window.location.href);
  url.hash = `song=${encodeSong(song)}`;
  return url.toString();
}

export type SharedSong = { song: Song } | { error: string } | null;

/** Null when the URL carries no song; `{ error }` when it carries something that is not one. */
export function readSongFromHash(): SharedSong {
  const match = /(?:^#|&)song=([^&]+)/.exec(window.location.hash);
  if (!match) return null;
  try {
    return { song: decodeSong(match[1]) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
