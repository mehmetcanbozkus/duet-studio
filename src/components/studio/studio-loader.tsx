"use client";

import dynamic from "next/dynamic";

import { Spinner } from "@/components/ui/spinner";

// The studio touches Web Audio, localStorage and document.modelContext, so it only renders in the browser.
const Studio = dynamic(() => import("./studio").then((m) => m.Studio), {
  ssr: false,
  // The placeholder matches the studio's own `min-h-svh flex-1` box so the page
  // does not resize when the real UI swaps in (Lighthouse scores that as CLS).
  loading: () => (
    <div className="flex min-h-svh flex-1 items-center justify-center">
      <Spinner />
    </div>
  ),
});

export function StudioLoader() {
  return <Studio />;
}
