"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SearchRunEnvelope } from "@/lib/types/api";
import { readApiErrorMessage } from "@/lib/client/api-error";

const RECENCY_OPTIONS = [
  { label: "Past 24 hours", value: "past-24h" },
  { label: "Past week", value: "past-week" },
  { label: "Past month", value: "past-month" },
];

export function SearchForm() {
  const router = useRouter();
  const [role, setRole] = React.useState("");
  const [location, setLocation] = React.useState("");
  const [recencyPreference, setRecencyPreference] = React.useState<
    "past-24h" | "past-week" | "past-month"
  >("past-week");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/search-runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          role,
          location,
          recencyPreference,
        }),
      });
      const body = (await res.json().catch(() => null)) as
        | { ok: true; data: SearchRunEnvelope }
        | { ok: false; error: { message: string } }
        | null;
      const payload = body && "ok" in body && body.ok ? body.data : null;
      if (!res.ok || !payload?.runId || payload.status === "failed") {
        setError(readApiErrorMessage(body, "Could not start this search run."));
        return;
      }
      router.push(`/job-discovery/runs/${payload.runId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected request error.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card className="border-border/70 bg-card/70 p-5 shadow-sm backdrop-blur sm:p-6">
      <form className="space-y-5" onSubmit={onSubmit}>
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="role">Role</Label>
            <Input
              id="role"
              required
              maxLength={120}
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="Senior Product Designer"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="location">Location</Label>
            <Input
              id="location"
              required
              maxLength={120}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Remote (US) or London"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="recency">Recency preference</Label>
          <select
            id="recency"
            value={recencyPreference}
            onChange={(e) =>
              setRecencyPreference(
                e.target.value as "past-24h" | "past-week" | "past-month",
              )
            }
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-1 focus-visible:ring-ring"
          >
            {RECENCY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            We remember what has already been shown in your current session.
          </p>
          <Button type="submit" disabled={isSubmitting} className="sm:min-w-52">
            {isSubmitting ? "Starting search..." : "Find New Hiring Leads"}
          </Button>
        </div>
      </form>

      {error ? (
        <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}
    </Card>
  );
}

