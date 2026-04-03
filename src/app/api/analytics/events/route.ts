import { cookies } from "next/headers";
import { z } from "zod";
import { ensureUserSessionContext, readOptionalClerkUserId } from "@/lib/api/session";
import { recordAnalyticsEvents } from "@/lib/api/analytics-events";
import { apiError, apiOk } from "@/lib/api/response";
import { AnalyticsEventsBatchInputSchema } from "@/lib/schemas/api";
import { logger } from "@/lib/observability/logger";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = AnalyticsEventsBatchInputSchema.safeParse(body);
    if (!parsed.success) {
      return apiError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Invalid analytics events payload",
        details: z.flattenError(parsed.error),
      });
    }

    const cookieStore = await cookies();
    const clerkUserId = await readOptionalClerkUserId();
    const session = await ensureUserSessionContext({
      cookieStore,
      clerkUserId,
    });

    const accepted = await recordAnalyticsEvents({
      context: {
        userId: session.userId,
        userSessionId: session.userSessionId,
        isAuthenticated: session.isAuthenticated,
      },
      events: parsed.data.events,
      bestEffort: true,
    });

    return apiOk({ accepted });
  } catch (error) {
    logger.error("analytics_events_ingest_failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return apiError({
      status: 500,
      code: "INTERNAL_ERROR",
      message: "Failed to ingest analytics events",
    });
  }
}
