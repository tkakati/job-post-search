"use client";

import * as React from "react";

import type { JobDiscoveryResponse } from "@/lib/agent/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

const RECENCY_OPTIONS: Array<{
  label: string;
  value: "past-24h" | "past-week" | "past-month";
}> = [
  { label: "Past 24 hours", value: "past-24h" },
  { label: "Past week", value: "past-week" },
  { label: "Past month", value: "past-month" },
];

export function JobDiscoveryClient() {
  const [role, setRole] = React.useState("");
  const [location, setLocation] = React.useState("");
  const [recencyPreference, setRecencyPreference] = React.useState<
    "past-24h" | "past-week" | "past-month"
  >("past-week");

  const [result, setResult] = React.useState<JobDiscoveryResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    setResult(null);

    try {
      const res = await fetch("/api/discover", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ role, location, recencyPreference }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.error ?? "Request failed");
        return;
      }

      setResult(json as JobDiscoveryResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4">
      <div className="mb-6">
        <h1 className="text-balance text-3xl font-semibold tracking-tight">HireFeed</h1>
        <p className="mt-2 text-muted-foreground">
          Enter a role + location + recency. The agent will retrieve stored leads and
          optionally generate fresh leads, then return the best new options.
        </p>
      </div>

      <Card className="p-6">
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label htmlFor="role">Role</Label>
            <Input
              id="role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="e.g. Frontend Engineer"
              required
              maxLength={80}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="location">Location</Label>
            <Input
              id="location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. San Francisco, CA"
              required
              maxLength={80}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="recency">Recency preference</Label>
            <select
              id="recency"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              value={recencyPreference}
              onChange={(e) =>
                setRecencyPreference(
                  e.target.value as "past-24h" | "past-week" | "past-month",
                )
              }
            >
              {RECENCY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Discovering..." : "Discover new leads"}
            </Button>
            {result?.newLeadsCount ? (
              <Badge variant="secondary" className="rounded-md">
                {result.newLeadsCount} new for you
              </Badge>
            ) : null}
          </div>
        </form>
      </Card>

      {error ? (
        <div className="mt-4 rounded-lg border border-destructive bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {result ? (
        <div className="mt-6 space-y-4">
          <Card className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm text-muted-foreground">Agent decision</div>
                <div className="mt-1 flex items-center gap-2">
                  <Badge>{result.mode}</Badge>
                  <Badge variant="secondary">{result.iterationsUsed} iterations</Badge>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm text-muted-foreground">Performance</div>
                <div className="mt-1 text-sm">
                  total: {result.performance.totalMs}ms (retrieval {result.performance.retrievalMs}ms,
                  search {result.performance.searchMs}ms, combine {result.performance.combineMs}ms)
                </div>
              </div>
            </div>

            <Separator className="my-4" />
            <div className="text-base font-medium">{result.summary}</div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {result.leads.map((lead) => (
                <a
                  key={lead.url}
                  href={lead.url}
                  target="_blank"
                  rel="noreferrer"
                  className="group rounded-lg border border-border bg-card p-4 transition hover:-translate-y-0.5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium">{lead.title}</div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        {lead.company ? `${lead.company} · ` : ""}
                        {lead.source}
                      </div>
                    </div>
                    <Badge variant="secondary" className="h-fit rounded-md">
                      new
                    </Badge>
                  </div>
                  {lead.createdAt ? (
                    <div className="mt-3 text-xs text-muted-foreground">
                      {new Date(lead.createdAt).toLocaleDateString()}
                    </div>
                  ) : null}
                </a>
              ))}
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
