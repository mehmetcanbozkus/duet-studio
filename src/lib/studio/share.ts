import {
  compressToEncodedURIComponent,
  decompressFromEncodedURIComponent,
} from "lz-string";

import { parseSong } from "./song-schema";
import type { Song } from "./types";

export const SHARE_ID_SIZE = 10;

/** Query parameter carrying a stored song id, e.g. `/?s=V1StGXR8Z5`. */
const SHARE_PARAM = "s";
// nanoid's alphabet, so an id is safe in both a URL and a blob pathname.
const SHARE_ID = new RegExp(`^[A-Za-z0-9_-]{${SHARE_ID_SIZE}}$`);

/** Share ids come from URLs, so they are checked before they reach the blob store. */
export function isShareId(value: string): boolean {
  return SHARE_ID.test(value);
}

export function songBlobPath(id: string): string {
  return `songs/${id}.json`;
}

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

/** Self-contained link: the whole song rides in the hash. Thousands of characters long. */
export function songHashUrl(song: Song): string {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = `song=${encodeSong(song)}`;
  return url.toString();
}

export interface ShareLink {
  url: string;
  /** False when the song had to be inlined in the URL because link storage was unavailable. */
  short: boolean;
}

/**
 * Store the song and return a short link. Deployments with no blob store answer `{ id: null }`,
 * and anything else that goes wrong throws, so Share always ends up with a link: the
 * self-contained hash link when the song could not be stored.
 */
export async function createShareLink(song: Song): Promise<ShareLink> {
  try {
    const response = await fetch("/api/share", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(song),
    });
    if (response.ok) {
      const { id } = (await response.json()) as { id?: unknown };
      if (typeof id === "string" && isShareId(id)) {
        const url = new URL(window.location.href);
        url.hash = "";
        url.search = `?${SHARE_PARAM}=${id}`;
        return { url: url.toString(), short: true };
      }
    }
  } catch {
    // Fall through to the inline link.
  }
  return { url: songHashUrl(song), short: false };
}

/** The stored-song id in the current URL, if it carries one. */
export function readShareId(): string | null {
  const id = new URLSearchParams(window.location.search).get(SHARE_PARAM);
  return id && isShareId(id) ? id : null;
}

export async function fetchSharedSong(id: string): Promise<Song> {
  const response = await fetch(`/api/share/${id}`);
  if (response.status === 404) {
    throw new Error("That share link no longer exists.");
  }
  if (!response.ok) throw new Error("Could not load the shared song.");
  return parseSong(await response.json());
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
