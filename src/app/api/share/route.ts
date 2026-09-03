import { put } from "@vercel/blob";
import { nanoid } from "nanoid";

import { SHARE_ID_SIZE, songBlobPath } from "@/lib/studio/share";
import { parseSong } from "@/lib/studio/song-schema";

/** Larger than any song this studio can make, so oversized bodies are refused rather than stored. */
const MAX_SONG_BYTES = 256 * 1024;

/**
 * Store a song and hand back a short id. Anyone can post here, so the body is size-capped and
 * re-parsed with `parseSong`: only well-formed songs, serialized by us, reach the blob store.
 */
export async function POST(request: Request) {
  // No blob store connected: not a failure, the browser falls back to an inline `#song=` link.
  if (!process.env.BLOB_READ_WRITE_TOKEN) return Response.json({ id: null });

  const body = await request.text();
  if (body.length > MAX_SONG_BYTES) {
    return Response.json({ error: "That song is too large" }, { status: 413 });
  }

  let song;
  try {
    song = parseSong(JSON.parse(body));
  } catch {
    return Response.json({ error: "Not a song" }, { status: 400 });
  }

  const id = nanoid(SHARE_ID_SIZE);
  try {
    // The id is already the random part of the pathname, and songs are never overwritten,
    // so `put` runs on its defaults: no random suffix, JSON content type from the extension.
    await put(songBlobPath(id), JSON.stringify(song), { access: "public" });
  } catch (error) {
    console.error("Could not store a shared song", error);
    return Response.json(
      { error: "Could not store the song" },
      { status: 502 },
    );
  }

  return Response.json({ id });
}
