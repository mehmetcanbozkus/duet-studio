import { Engine } from "./engine";
import { useStudio } from "./store";

let engine: Engine | null = null;

export function getEngine() {
  if (!engine) {
    engine = new Engine({
      getSong: () => useStudio.getState().song,
      onStep: (step) => useStudio.getState().setCurrentStep(step),
      onStop: () => useStudio.getState().setPlaying(false),
    });
  }
  return engine;
}

/** Resume the AudioContext. Only succeeds inside (or after) a user gesture. */
export async function unlockAudio() {
  const ok = await getEngine().unlock();
  useStudio.getState().setAudioReady(ok);
  return ok;
}

export async function play() {
  const ok = await getEngine().play();
  useStudio.getState().setAudioReady(getEngine().isUnlocked);
  useStudio.getState().setPlaying(ok);
  return ok;
}

export function stop() {
  getEngine().stop();
  useStudio.getState().setPlaying(false);
}

export async function togglePlay() {
  if (useStudio.getState().playing) {
    stop();
    return false;
  }
  return play();
}
