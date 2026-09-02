"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-4">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="text-muted-foreground text-sm">
        An unexpected error occurred. Please try again.
      </p>
      {error.digest && (
        <p className="text-muted-foreground font-mono text-xs">
          Reference: {error.digest}
        </p>
      )}
      <Button onClick={retry}>Try again</Button>
    </div>
  );
}
