import {
  compressToEncodedURIComponent,
  decompressFromEncodedURIComponent,
} from "lz-string";

import type { Song } from "./types";

export function encodeSong(song: Song): string {
  return compressToEncodedURIComponent(JSON.stringify(song));
}

export function decodeSong(encoded: string): Song {
  const json = decompressFromEncodedURIComponent(encoded);
  if (!json) throw new Error("Could not decode song");
  const parsed = JSON.parse(json) as Song;
  if (!parsed || !Array.isArray(parsed.tracks)) throw new Error("Not a song");
  return parsed;
}

export function songShareUrl(song: Song) {
  const url = new URL(window.location.href);
  url.hash = `song=${encodeSong(song)}`;
  return url.toString();
}

export function readSongFromHash(): Song | null {
  const match = /(?:^#|&)song=([^&]+)/.exec(window.location.hash);
  if (!match) return null;
  try {
    return decodeSong(match[1]);
  } catch {
    return null;
  }
}
