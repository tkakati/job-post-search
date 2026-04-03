import { cookies } from "next/headers";
import { z } from "zod";
import { ensureUserSessionContext, readOptionalClerkUserId } from "@/lib/api/session";
import { LeadEventInputSchema } from "@/lib/schemas/api";
import { recordAnalyticsEvent } from "@/lib/api/analytics-events";
import { recordLeadEvent } from "@/lib/api/search-runs";
import { apiError, apiOk } from "@/lib/api/response";
import { logger } from "@/lib/observability/logger";

export const runtime = "nodejs";

const ParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const params = await context.params;
    const parsedParams = ParamsSchema.safeParse(params);
    if (!parsedParams.success) {
      return apiError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Invalid lead id",
        details: z.flattenError(parsedParams.error),
      });
    }

    const body = await req.json().catch(() => null);
    const parsedBody = LeadEventInputSchema.safeParse(body);
    if (!parsedBody.success) {
      return apiError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Invalid input",
        details: z.flattenError(parsedBody.error),
      });
    }

    const cookieStore = await cookies();
    const clerkUserId = await readOptionalClerkUserId();
    const session = await ensureUserSessionContext({
      cookieStore,
      clerkUserId,
    });
    await recordLeadEvent({
      userSessionId: session.userSessionId,
      leadId: parsedParams.data.id,
      ...parsedBody.data,
    });

    const normalizedType =
      parsedBody.data.eventType === "open"
        ? "opened"
        : parsedBody.data.eventType === "click"
          ? "clicked"
          : parsedBody.data.eventType;
    if (normalizedType === "opened" || normalizedType === "clicked") {
      void recordAnalyticsEvent({
        context: {
          userId: session.userId,
          userSessionId: session.userSessionId,
          isAuthenticated: session.isAuthenticated,
        },
        event: {
          eventName: normalizedType === "opened" ? "post_viewed" : "external_post_clicked",
          source: "api",
          runId: parsedBody.data.searchRunId,
          leadId: parsedParams.data.id,
          properties: {
            sourceBadge: parsedBody.data.metadata?.sourceBadge ?? null,
            score:
              typeof parsedBody.data.metadata?.score === "number"
                ? parsedBody.data.metadata.score
                : null,
          },
        },
        bestEffort: true,
      });
    }
    return apiOk({ tracked: true });
  } catch (error) {
    logger.error("lead_event_track_failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return apiError({
      status: 500,
      code: "INTERNAL_ERROR",
      message: "Failed to track lead event",
    });
  }
}
