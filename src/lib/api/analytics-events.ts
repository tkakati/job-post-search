import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { dbClient } from "@/lib/db";
import { analyticsEvents, searchRuns } from "@/lib/db/schema";
import type { AnalyticsEventInput } from "@/lib/types/api";
import { logger } from "@/lib/observability/logger";

const CLERK_USER_PREFIX = "clerk:";

export type AnalyticsEventContext = {
  userId: string;
  userSessionId: string;
  isAuthenticated: boolean;
};

export function toAnalyticsUserKey(context: AnalyticsEventContext) {
  if (context.userId.startsWith(CLERK_USER_PREFIX)) return context.userId;
  return `anon:${context.userSessionId}`;
}

function normalizeOccurredAt(value: string | undefined): Date {
  if (!value) return new Date();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return new Date();
  return parsed;
}

export async function resolveSearchIdForRun(runId: number): Promise<string | null> {
  const db = dbClient();
  const rows = await db
    .select({
      id: searchRuns.id,
      userSessionId: searchRuns.userSessionId,
      role: searchRuns.role,
      location: searchRuns.location,
      createdAt: searchRuns.createdAt,
    })
    .from(searchRuns)
    .where(eq(searchRuns.id, runId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const createdAtIso = row.createdAt instanceof Date ? row.createdAt.toISOString() : "";
  return `run:${row.id}:${row.userSessionId}:${createdAtIso}:${row.role}:${row.location}`;
}

export async function recordAnalyticsEvents(input: {
  context: AnalyticsEventContext;
  events: AnalyticsEventInput[];
  bestEffort?: boolean;
}) {
  if (input.events.length === 0) return 0;

  const db = dbClient();
  const userKey = toAnalyticsUserKey(input.context);
  const values = input.events.map((event) => {
    const properties = {
      userKey,
      ...(event.properties ?? {}),
    } as Record<string, unknown>;

    return {
      eventId: randomUUID(),
      eventName: event.eventName,
      eventVersion: "v1",
      source: event.source,
      occurredAt: normalizeOccurredAt(event.occurredAt),
      userId: input.context.userId,
      userSessionId: input.context.userSessionId,
      isAuthenticated: input.context.isAuthenticated,
      searchId: event.searchId ?? null,
      searchRunId: event.runId ?? null,
      iterationNumber: event.iterationIndex ?? null,
      queryId: event.queryId ?? null,
      leadId: event.leadId ?? null,
      propertiesJson: properties,
    };
  });

  try {
    await db.insert(analyticsEvents).values(values);
    return values.length;
  } catch (error) {
    if (input.bestEffort ?? true) {
      logger.warn("analytics_events_record_failed", {
        error: error instanceof Error ? error.message : "unknown",
        count: input.events.length,
      });
      return 0;
    }
    throw error;
  }
}

export async function recordAnalyticsEvent(input: {
  context: AnalyticsEventContext;
  event: AnalyticsEventInput;
  bestEffort?: boolean;
}) {
  return recordAnalyticsEvents({
    context: input.context,
    events: [input.event],
    bestEffort: input.bestEffort,
  });
}
