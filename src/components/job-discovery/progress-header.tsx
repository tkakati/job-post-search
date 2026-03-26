import { Badge } from "@/components/ui/badge";
import type { RunStatus } from "@/lib/types/api";

function copyForStatus(status: RunStatus) {
  if (status === "queued") return "Queued and preparing sources";
  if (status === "running") return "Searching across retrieval and fresh sources";
  if (status === "failed") return "Run failed";
  return "Results ready";
}

export function ProgressHeader({
  runId,
  status,
}: {
  runId: number;
  status: RunStatus;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-card/80 p-4 sm:p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Search run #{runId}</p>
          <h2 className="text-lg font-semibold tracking-tight">{copyForStatus(status)}</h2>
        </div>
        <Badge variant={status === "failed" ? "destructive" : "secondary"}>
          {status}
        </Badge>
      </div>
    </div>
  );
}

