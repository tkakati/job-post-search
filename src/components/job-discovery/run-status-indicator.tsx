import { Skeleton } from "@/components/ui/skeleton";
import type { RunStatus } from "@/lib/types/api";

export function RunStatusIndicator({
  status,
  pollAfterMs,
}: {
  status: RunStatus;
  pollAfterMs: number | null;
}) {
  const isActive = status === "queued" || status === "running";
  if (!isActive) return null;

  return (
    <div className="rounded-xl border border-border/70 bg-card p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium">Running job discovery agent</p>
          <p className="text-sm text-muted-foreground">
            This can take a few seconds while retrieval and search complete.
          </p>
        </div>
        <span className="text-xs text-muted-foreground">
          polling {pollAfterMs ?? 1200}ms
        </span>
      </div>
      <div className="mt-4 grid gap-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-4/5" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    </div>
  );
}

