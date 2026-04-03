import { beforeEach, describe, expect, it, vi } from "vitest";

const recordAnalyticsEventsMock = vi.fn();

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

vi.mock("../../src/lib/api/analytics-events", () => ({
  recordAnalyticsEvents: recordAnalyticsEventsMock,
}));

describe("analytics events API integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recordAnalyticsEventsMock.mockResolvedValue(1);
  });

  it("returns 400 for invalid payload", async () => {
    const { POST } = await import("../../src/app/api/analytics/events/route");
    const req = new Request("http://localhost/api/analytics/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ events: [] }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = (await res.json()) as { ok: boolean; error: { code: string } };
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it("ingests valid event batches", async () => {
    const { POST } = await import("../../src/app/api/analytics/events/route");
    const req = new Request("http://localhost/api/analytics/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        events: [
          {
            eventName: "search_submitted",
            source: "client",
            properties: {
              role: "Product Manager",
              location: "Seattle",
              maxIterations: 2,
            },
          },
        ],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; data: { accepted: number } };
    expect(json.ok).toBe(true);
    expect(json.data.accepted).toBe(1);
    expect(recordAnalyticsEventsMock).toHaveBeenCalledTimes(1);
  });
});
