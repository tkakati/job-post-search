import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: vi.fn(),
    set: vi.fn(),
  })),
}));

vi.mock("../../src/lib/api/session", () => ({
  ensureUserSessionContext: vi.fn(async () => ({
    userId: "clerk:user_123",
    userSessionId: "session_123",
    sessionScopeIds: ["session_123"],
    isAuthenticated: true,
  })),
  readOptionalClerkUserId: vi.fn(async () => "user_123"),
}));

vi.mock("../../src/lib/api/analytics", () => ({
  getAnalyticsSnapshot: vi.fn(async () => ({
    range: "30d",
    generatedAt: new Date().toISOString(),
    overview: {
      metrics: [],
      runTrend: [],
      sourceMix: [],
    },
    productUser: {
      metrics: [],
      topRoleLocations: [],
      engagementRates: [],
    },
    feedQuality: {
      metrics: [],
      qualityBadgeDistribution: [],
      fieldCompleteness: [],
    },
    agentSystem: {
      metrics: [],
      plannerModeDistribution: [],
      stopReasonDistribution: [],
      queryStrategyMix: [],
      runDurationBuckets: [],
      queryVolumeTrend: [],
      nodeLatencyMock: [],
    },
    experiments: {
      metrics: [],
      variants: [],
      notes: "mock",
    },
    provenance: {
      real: [],
      mock: [],
      mixed: [],
    },
  })),
}));

describe("analytics API integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns schema-valid analytics snapshot", async () => {
    const { GET } = await import("../../src/app/api/analytics/route");
    const req = new Request("http://localhost/api/analytics?range=30d");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      ok: boolean;
      data: { range: string; overview: { metrics: unknown[] } };
    };
    expect(json.ok).toBe(true);
    expect(json.data.range).toBe("30d");
    expect(Array.isArray(json.data.overview.metrics)).toBe(true);
  });
});
