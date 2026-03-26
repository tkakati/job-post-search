"use client";

import { useEffect } from "react";
import { logger } from "@/lib/observability/logger";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error("frontend_global_error_boundary", {
      message: error.message,
      digest: error.digest,
    });
  }, [error]);

  return (
    <div className="mx-auto my-16 max-w-xl rounded-lg border border-destructive/30 bg-destructive/5 p-6">
      <h2 className="text-xl font-semibold text-destructive">Something went wrong</h2>
      <p className="mt-2 text-sm text-destructive/90">
        An unexpected UI error occurred. Please retry this action.
      </p>
      <button
        onClick={reset}
        className="mt-4 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
      >
        Try again
      </button>
    </div>
  );
}

