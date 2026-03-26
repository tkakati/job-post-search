import { ResultsLoading } from "@/components/job-discovery/results-loading";
import { ProgressHeader } from "@/components/job-discovery/progress-header";
import { RunStatusIndicator } from "@/components/job-discovery/run-status-indicator";

export default function RunLoading() {
  return (
    <div className="space-y-4">
      <ProgressHeader runId={0} status="running" />
      <RunStatusIndicator status="running" pollAfterMs={1200} />
      <ResultsLoading />
    </div>
  );
}

