"use client";

import dynamic from "next/dynamic";

import { Spinner } from "@/components/ui/spinner";

// The studio touches Web Audio, localStorage and document.modelContext, so it only renders in the browser.
const Studio = dynamic(() => import("./studio").then((m) => m.Studio), {
  ssr: false,
  loading: () => (
    <div className="flex flex-1 items-center justify-center py-32">
      <Spinner />
    </div>
  ),
});

export function StudioLoader() {
  return <Studio />;
}
