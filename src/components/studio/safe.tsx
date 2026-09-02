"use client";

import type { ReactNode } from "react";
import { ErrorBoundary } from "react-error-boundary";

/**
 * Keeps an optional widget from taking the whole studio down. WebMCP hosts differ in what
 * document.modelContext exposes, so everything that talks to it renders inside one of these.
 */
export function Safe({
  name,
  silent = false,
  children,
}: {
  name: string;
  silent?: boolean;
  children: ReactNode;
}) {
  return (
    <ErrorBoundary
      fallbackRender={() =>
        silent ? null : (
          <p className="text-muted-foreground text-xs">
            {name} is unavailable in this browser.
          </p>
        )
      }
      onError={(error) => console.error(`[duet-studio] ${name} failed`, error)}
    >
      {children}
    </ErrorBoundary>
  );
}
