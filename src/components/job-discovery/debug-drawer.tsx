import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { SearchRunResult } from "@/lib/types/api";

export function DebugDrawer({ result }: { result: SearchRunResult }) {
  return (
    <details className="group">
      <summary className="cursor-pointer list-none rounded-xl border border-border/70 bg-card px-4 py-3 text-sm font-medium hover:bg-muted/30">
        <span className="inline-flex items-center gap-2">
          Debug details
          <Badge variant="secondary">advanced</Badge>
        </span>
      </summary>
      <Card className="mt-2 border-border/70 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <DebugItem label="Planner mode" value={result.debug.plannerMode ?? "n/a"} />
          <DebugItem
            label="Retrieval ran"
            value={result.debug.retrievalRan ? "yes" : "no"}
          />
          <DebugItem
            label="Fresh search ran"
            value={result.debug.freshSearchRan ? "yes" : "no"}
          />
          <DebugItem
            label="numExploreQueries"
            value={String(result.debug.numExploreQueries)}
          />
          <DebugItem
            label="Iteration count"
            value={String(result.debug.iterationCount)}
          />
          <DebugItem
            label="Stop reason"
            value={result.debug.stopReason ?? "in_progress"}
          />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <DebugItem
            label="Retrieved count"
            value={String(result.debug.countBreakdowns.retrieved)}
          />
          <DebugItem
            label="Generated count"
            value={String(result.debug.countBreakdowns.generated)}
          />
          <DebugItem
            label="Merged count"
            value={String(result.debug.countBreakdowns.merged)}
          />
          <DebugItem
            label="New-for-user"
            value={String(result.debug.countBreakdowns.newForUser)}
          />
        </div>
      </Card>
    </details>
  );
}

function DebugItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/60 bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}

