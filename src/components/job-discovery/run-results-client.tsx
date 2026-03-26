"use client";

import * as React from "react";
import { ProgressHeader } from "@/components/job-discovery/progress-header";
import { RunStatusIndicator } from "@/components/job-discovery/run-status-indicator";
import { ResultsLoading } from "@/components/job-discovery/results-loading";
import { ErrorState } from "@/components/job-discovery/error-state";
import { EmptyState } from "@/components/job-discovery/empty-state";
import { ResultsGrid } from "@/components/job-discovery/results-grid";
import { DebugDrawer } from "@/components/job-discovery/debug-drawer";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { LeadCardViewModel } from "@/lib/types/contracts";
import type { SearchRunEnvelope } from "@/lib/types/api";
import { useLeadTracking } from "@/lib/client/use-lead-tracking";
import { readApiErrorMessage } from "@/lib/client/api-error";
import { summarizeUiError } from "@/lib/client/error-presentation";

export function RunResultsClient({ runId }: { runId: number }) {
  const [run, setRun] = React.useState<SearchRunEnvelope | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [dismissedRunFailure, setDismissedRunFailure] = React.useState(false);
  const tracking = useLeadTracking(runId);

  const fetchRun = React.useCallback(async () => {
    setError(null);
    const res = await fetch(`/api/search-runs/${runId}`, {
      credentials: "same-origin",
      cache: "no-store",
    });
    const body = (await res.json().catch(() => null)) as
      | { ok: true; data: SearchRunEnvelope }
      | { ok: false; error: { message: string } }
      | null;
    const json = body && "ok" in body && body.ok ? body.data : null;
    if (!res.ok || !json) {
      throw new Error(readApiErrorMessage(body, "Could not fetch run status."));
    }
    setRun(json);
    return json;
  }, [runId]);

  React.useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      try {
        const current = await fetchRun();
        if (cancelled) return;
        if (current.status === "queued" || current.status === "running") {
          timer = setTimeout(poll, current.pollAfterMs ?? 1200);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            summarizeUiError({
              source: "run",
              rawMessage: err instanceof Error ? err.message : "Could not load results.",
            }),
          );
        }
      }
    }

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [fetchRun]);

  React.useEffect(() => {
    if (run?.status === "failed") {
      setDismissedRunFailure(false);
    }
  }, [run?.status, run?.error]);

  const retryFetchRun = React.useCallback(async () => {
    try {
      setError(null);
      await fetchRun();
    } catch (err) {
      setError(
        summarizeUiError({
          source: "run",
          rawMessage: err instanceof Error ? err.message : "Could not load results.",
        }),
      );
    }
  }, [fetchRun]);

  async function handleLeadClick(lead: LeadCardViewModel) {
    void tracking.trackClicked(lead);
    void tracking.trackOpened(lead);
  }

  if (error) {
    return (
      <ErrorState
        message={error}
        onRetry={() => {
          void retryFetchRun();
        }}
        onDismiss={() => setError(null)}
      />
    );
  }

  const status = run?.status ?? "running";
  const result = run?.result;
  const isMaxIterations = result?.stopReason === "max_iterations";
  const isPartialResult =
    !!result && result.leads.length > 0 && result.totalCounts.newForUser < 5;

  return (
    <div className="space-y-4">
      <ProgressHeader runId={runId} status={status} />
      <RunStatusIndicator status={status} pollAfterMs={run?.pollAfterMs ?? null} />

      {status === "failed" && !dismissedRunFailure ? (
        <ErrorState
          message={summarizeUiError({
            source: "run",
            rawMessage: run?.error ?? "Search run failed.",
          })}
          onRetry={() => {
            void retryFetchRun();
          }}
          onDismiss={() => setDismissedRunFailure(true)}
        />
      ) : null}

      {!result && (status === "queued" || status === "running") ? <ResultsLoading /> : null}

      {result ? (
        <>
          <Card className="border-border/70 p-4 sm:p-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{result.stopReason ?? "in_progress"}</Badge>
              <Badge variant="secondary">{result.iterationsUsed} iterations</Badge>
              <Badge variant="secondary">{result.totalCounts.newForUser} new leads</Badge>
              <Badge variant="secondary">{result.leads.length} shown results</Badge>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">{result.summary}</p>
            <div className="mt-4 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
              <p>Retrieved: {result.sourceBreakdown.retrieved}</p>
              <p>Fresh: {result.sourceBreakdown.fresh}</p>
              <p>Both: {result.sourceBreakdown.both}</p>
              <p>Updated: {new Date(result.updatedAt).toLocaleString()}</p>
            </div>
          </Card>

          {isPartialResult ? (
            <Card className="border-border/70 bg-muted/40 p-4 text-sm text-muted-foreground">
              Returning best available leads so far. You can rerun to discover more.
            </Card>
          ) : null}

          {isMaxIterations ? (
            <Card className="border-border/70 bg-muted/40 p-4 text-sm text-muted-foreground">
              Max iterations reached. Showing the highest-signal leads found.
            </Card>
          ) : null}

          {result.leads.length === 0 ? (
            <EmptyState
              title="No new leads this time"
              message="We ran retrieval and search but did not find new opportunities in this run."
              suggestion="Try a broader location, adjust recency preference, or search again later."
            />
          ) : (
            <ResultsGrid
              leads={result.leads}
              onLeadClick={handleLeadClick}
              onLeadHelpful={(lead) => void tracking.trackHelpful(lead)}
              onLeadNotHelpful={(lead) => void tracking.trackNotHelpful(lead)}
              onLeadHidden={(lead) => void tracking.trackHidden(lead)}
            />
          )}

          <DebugDrawer result={result} />
        </>
      ) : null}
    </div>
  );
}
