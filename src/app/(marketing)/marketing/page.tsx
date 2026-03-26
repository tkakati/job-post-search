import Link from "next/link";

export default function MarketingPage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-12">
      <div>
        <div className="text-sm font-medium text-muted-foreground">
          AI Job Discovery Agent
        </div>
        <h1 className="mt-2 text-balance text-4xl font-semibold tracking-tight">
          Find new leads for roles you actually care about.
        </h1>
        <p className="mt-3 text-pretty text-muted-foreground">
          This MVP skeleton demonstrates a deterministic planner + retrieval from stored leads +
          fresh search generation with a bounded iteration loop.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-6">
        <div className="text-sm font-medium">Try it</div>
        <div className="mt-2 text-sm text-muted-foreground">
          Enter a role, location, and recency preference to generate leads.
        </div>
        <div className="mt-4">
          <Link
            href="/job-discovery"
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Open job discovery
          </Link>
        </div>
      </div>
    </div>
  );
}

