"use client";

import { useEffect } from "react";
import Link from "next/link";
import { logger } from "@/lib/observability/logger";

export default function ProductError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error("frontend_product_error_boundary", {
      message: error.message,
      digest: error.digest,
    });
  }, [error]);

  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6">
      <h2 className="text-lg font-semibold text-destructive">We hit a product error</h2>
      <p className="mt-2 text-sm text-destructive/90">
        You can retry this page, or start a new search run.
      </p>
      <div className="mt-4 flex gap-2">
        <button
          onClick={reset}
          className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
        >
          Retry
        </button>
        <Link
          href="/job-discovery"
          className="rounded-md border border-border px-4 py-2 text-sm"
        >
          New search
        </Link>
      </div>
    </div>
  );
}

