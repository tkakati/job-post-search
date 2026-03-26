import { describe, expect, it } from "vitest";
import {
  HistoryQuerySchema,
  LeadEventInputSchema,
  LeadFeedbackInputSchema,
  SearchRunEnvelopeSchema,
  StartSearchRunInputSchema,
} from "../../src/lib/schemas/api";

describe("api contracts", () => {
  it("validates start search-run payload", () => {
    const parsed = StartSearchRunInputSchema.parse({
      role: "Frontend Engineer",
      location: "Remote",
      recencyPreference: "past-month",
    });
    expect(parsed.recencyPreference).toBe("past-month");
  });

  it("rejects invalid lead event payload", () => {
    const parsed = LeadEventInputSchema.safeParse({
      eventType: "invalid",
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts expanded lead event taxonomy", () => {
    const opened = LeadEventInputSchema.parse({ eventType: "opened" });
    const clicked = LeadEventInputSchema.parse({ eventType: "clicked" });
    const helpful = LeadEventInputSchema.parse({ eventType: "helpful" });
    const notHelpful = LeadEventInputSchema.parse({ eventType: "not_helpful" });
    const hidden = LeadEventInputSchema.parse({ eventType: "hidden" });
    expect(opened.eventType).toBe("opened");
    expect(clicked.eventType).toBe("clicked");
    expect(helpful.eventType).toBe("helpful");
    expect(notHelpful.eventType).toBe("not_helpful");
    expect(hidden.eventType).toBe("hidden");
  });

  it("accepts optional lead feedback payload", () => {
    const parsed = LeadFeedbackInputSchema.parse({
      useful: true,
      score: 4,
      notes: "Relevant post",
    });
    expect(parsed.useful).toBe(true);
    expect(parsed.score).toBe(4);
  });

  it("parses history query with default limit", () => {
    const parsed = HistoryQuerySchema.parse({});
    expect(parsed.limit).toBe(20);
  });

  it("keeps polling-friendly run envelope shape", () => {
    const payload = SearchRunEnvelopeSchema.parse({
      runId: 1,
      status: "completed",
      pollAfterMs: null,
      result: {
        runId: 1,
        status: "completed",
        stopReason: "max_iterations",
        iterationsUsed: 3,
        summary: "Done",
        totalCounts: {
          retrieved: 1,
          generated: 2,
          merged: 2,
          newForUser: 2,
        },
        sourceBreakdown: {
          retrieved: 1,
          fresh: 1,
          both: 0,
        },
        debug: {
          plannerMode: "explore_heavy",
          retrievalRan: true,
          freshSearchRan: true,
          numExploreQueries: 2,
          iterationCount: 2,
          stopReason: "max_iterations",
          countBreakdowns: {
            retrieved: 1,
            generated: 2,
            merged: 2,
            newForUser: 2,
          },
        },
        leads: [],
        updatedAt: new Date().toISOString(),
      },
    });
    expect(payload.status).toBe("completed");
    expect(payload.result?.runId).toBe(1);
  });
});

