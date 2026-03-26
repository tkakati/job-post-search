"use client";

import * as React from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { HistoryResponse } from "@/lib/types/api";

export function RecentHistory() {
  const [history, setHistory] = React.useState<HistoryResponse | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const res = await fetch("/api/history?limit=5", { credentials: "same-origin" });
        const body = (await res.json().catch(() => null)) as
          | { ok: true; data: HistoryResponse }
          | { ok: false; error: { message: string } }
          | null;
        const json = body && "ok" in body && body.ok ? body.data : null;
        if (active && res.ok && json) setHistory(json);
      } finally {
        if (active) setIsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <Card className="border-border/70 p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Recent searches</h3>
        <Badge variant="secondary">Session memory</Badge>
      </div>
      {isLoading ? (
        <p className="mt-3 text-sm text-muted-foreground">Loading recent runs...</p>
      ) : history?.items?.length ? (
        <ul className="mt-3 space-y-2">
          {history.items.map((item) => (
            <li key={item.runId}>
              <Link
                href={`/job-discovery/runs/${item.runId}`}
                className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2 text-sm transition hover:bg-muted/50"
              >
                <span className="truncate">
                  {item.role} · {item.location}
                </span>
                <span className="text-xs text-muted-foreground">
                  {item.iterationCount} iters
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          No recent runs yet. Start your first discovery search.
        </p>
      )}
    </Card>
  );
}

