import { RunResultsClient } from "@/components/job-discovery/run-results-client";

export default async function RunResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const p = await params;
  const runId = Number(p.id);
  if (!Number.isFinite(runId) || runId <= 0) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-destructive">
        Invalid run id.
      </div>
    );
  }
  return <RunResultsClient runId={runId} />;
}

