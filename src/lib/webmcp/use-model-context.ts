"use client";

import { useSyncExternalStore } from "react";

import { getModelContext, type ModelContext } from "./types";

// document.modelContext may be injected after the page loads (extensions, hosts that attach late).
// One shared poll serves every subscriber instead of one timer per tool.
const DETECT_INTERVAL_MS = 500;
const DETECT_ATTEMPTS = 20;

const listeners = new Set<() => void>();
let polling = false;

function notify() {
  for (const listener of listeners) listener();
}

function pollForHost() {
  if (polling) return;
  polling = true;
  let attempts = 0;
  const timer = setInterval(() => {
    if (getModelContext()) {
      clearInterval(timer);
      polling = false;
      notify();
    } else if (++attempts >= DETECT_ATTEMPTS) {
      clearInterval(timer);
      polling = false;
    }
  }, DETECT_INTERVAL_MS);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!getModelContext()) pollForHost();
  return () => {
    listeners.delete(listener);
  };
}

const getServerSnapshot = () => null;

/** The host's model context once it exists; null before that (and always on the server). */
export function useModelContext(): ModelContext | null {
  return useSyncExternalStore(subscribe, getModelContext, getServerSnapshot);
}
