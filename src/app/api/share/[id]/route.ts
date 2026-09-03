import { get } from "@vercel/blob";

import { isShareId, songBlobPath } from "@/lib/studio/share";

/** Serve a stored song. The id is untrusted; the body is validated again in the browser. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!isShareId(id)) {
    return Response.json({ error: "Not a share link" }, { status: 400 });
  }

  let stored;
  try {
    stored = await get(songBlobPath(id), { access: "public" });
  } catch (error) {
    console.error("Could not read a shared song", error);
    return Response.json({ error: "Could not read the song" }, { status: 502 });
  }
  if (stored?.statusCode !== 200) {
    return Response.json({ error: "No such share link" }, { status: 404 });
  }

  // Ids are never reused, so a stored song can be cached for as long as anyone will keep it.
  return new Response(stored.stream, {
    headers: {
      "content-type": "application/json",
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
