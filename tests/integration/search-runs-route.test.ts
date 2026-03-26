import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: vi.fn(),
    set: vi.fn(),
  })),
}));

vi.mock("../../src/lib/api/session", () => ({
  ensureAnonymousSession: vi.fn(async () => "session-test"),
}));

vi.mock("../../src/lib/api/search-runs", () => ({
  startSearchRun: vi.fn(async () => ({
    runId: 123,
    status: "completed",
    pollAfterMs: null,
    result: {
      runId: 123,
      status: "completed",
      stopReason: "sufficient_new_leads",
      iterationsUsed: 2,
      summary: "Found leads",
      totalCounts: {
        retrieved: 2,
        generated: 3,
        merged: 4,
        newForUser: 4,
      },
      sourceBreakdown: {
        retrieved: 1,
        fresh: 2,
        both: 1,
      },
      debug: {
        plannerMode: "explore_heavy",
        retrievalRan: true,
        freshSearchRan: true,
        numExploreQueries: 2,
        iterationCount: 2,
        stopReason: "sufficient_new_leads",
        countBreakdowns: {
          retrieved: 2,
          generated: 3,
          merged: 4,
          newForUser: 4,
        },
      },
      leads: [],
      updatedAt: new Date().toISOString(),
    },
  })),
  getSearchRunResult: vi.fn(async () => ({
    runId: 123,
    status: "completed",
    pollAfterMs: null,
    result: {
      runId: 123,
      status: "completed",
      stopReason: "sufficient_new_leads",
      iterationsUsed: 2,
      summary: "Found leads",
      totalCounts: {
        retrieved: 2,
        generated: 3,
        merged: 4,
        newForUser: 4,
      },
      sourceBreakdown: {
        retrieved: 1,
        fresh: 2,
        both: 1,
      },
      debug: {
        plannerMode: "explore_heavy",
        retrievalRan: true,
        freshSearchRan: true,
        numExploreQueries: 2,
        iterationCount: 2,
        stopReason: "sufficient_new_leads",
        countBreakdowns: {
          retrieved: 2,
          generated: 3,
          merged: 4,
          newForUser: 4,
        },
      },
      leads: [],
      updatedAt: new Date().toISOString(),
    },
  })),
}));

describe("search-runs API integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts a run with clean envelope", async () => {
    const { POST } = await import("../../src/app/api/search-runs/route");
    const req = new Request("http://localhost/api/search-runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        role: "Frontend Engineer",
        location: "Remote",
        recencyPreference: "past-month",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; data: { runId: number } };
    expect(json.ok).toBe(true);
    expect(json.data.runId).toBe(123);
  });

  it("fetches run status payload for polling flow", async () => {
    const { GET } = await import("../../src/app/api/search-runs/[id]/route");
    const req = new Request("http://localhost/api/search-runs/123");
    const res = await GET(req, { params: Promise.resolve({ id: "123" }) });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      ok: boolean;
      data: { runId: number; result: { debug: { plannerMode: string | null } } };
    };
    expect(json.ok).toBe(true);
    expect(json.data.runId).toBe(123);
    expect(json.data.result.debug.plannerMode).toBe("explore_heavy");
  });
});

