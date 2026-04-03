import { cookies } from "next/headers";
import { z } from "zod";
import { ensureUserSessionContext, readOptionalClerkUserId } from "@/lib/api/session";
import { getAnalyticsSnapshot } from "@/lib/api/analytics";
import { AnalyticsQuerySchema, AnalyticsResponseSchema } from "@/lib/schemas/api";
import { apiError, apiOk } from "@/lib/api/response";
import { logger } from "@/lib/observability/logger";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const parsed = AnalyticsQuerySchema.safeParse({
      range: url.searchParams.get("range") ?? undefined,
    });
    if (!parsed.success) {
      return apiError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Invalid analytics query",
        details: z.flattenError(parsed.error),
      });
    }

    const cookieStore = await cookies();
    const clerkUserId = await readOptionalClerkUserId();
    const session = await ensureUserSessionContext({
      cookieStore,
      clerkUserId,
    });

    const snapshot = await getAnalyticsSnapshot({
      sessionScopeIds: session.sessionScopeIds,
      range: parsed.data.range,
    });

    return apiOk(AnalyticsResponseSchema.parse(snapshot));
  } catch (error) {
    logger.error("analytics_fetch_failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return apiError({
      status: 500,
      code: "INTERNAL_ERROR",
      message: "Failed to fetch analytics",
    });
  }
}
