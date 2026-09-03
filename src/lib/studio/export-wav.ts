import audioBufferToWav from "audiobuffer-to-wav";

import { downloadBlob, songFilename } from "./download";
import { renderSongOffline } from "./engine";
import type { Song } from "./types";

export async function exportWav(song: Song) {
  const audio = await renderSongOffline(song);
  const wav = audioBufferToWav(audio);
  const filename = songFilename(song.title, "wav");
  downloadBlob(new Blob([wav], { type: "audio/wav" }), filename);
  return filename;
}
