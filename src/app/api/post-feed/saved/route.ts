import { cookies } from "next/headers";
import { ensureUserSessionContext, readOptionalClerkUserId } from "@/lib/api/session";
import { getSavedPostFeed } from "@/lib/api/search-runs";
import { apiError, apiOk } from "@/lib/api/response";
import { SavedPostFeedResponseSchema } from "@/lib/schemas/api";
import { logger } from "@/lib/observability/logger";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedRecency = searchParams.get("recencyPreference");
    const recencyPreference =
      requestedRecency === "past-24h" ||
      requestedRecency === "past-week" ||
      requestedRecency === "past-month"
        ? requestedRecency
        : "past-week";

    const cookieStore = await cookies();
    const clerkUserId = await readOptionalClerkUserId();
    const session = await ensureUserSessionContext({
      cookieStore,
      clerkUserId,
    });

    const savedFeed = await getSavedPostFeed({
      sessionScopeIds: session.sessionScopeIds,
      limit: 300,
      recencyPreference,
    });

    return apiOk(SavedPostFeedResponseSchema.parse(savedFeed));
  } catch (error) {
    logger.error("saved_post_feed_fetch_failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return apiError({
      status: 500,
      code: "INTERNAL_ERROR",
      message: "Failed to fetch saved post feed.",
    });
  }
}
