import { cookies } from "next/headers";
import { z } from "zod";
import { ensureAnonymousSession } from "@/lib/api/session";
import { getRecentHistory } from "@/lib/api/search-runs";
import { HistoryQuerySchema, HistoryResponseSchema } from "@/lib/schemas/api";
import { apiError, apiOk } from "@/lib/api/response";
import { logger } from "@/lib/observability/logger";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const parsed = HistoryQuerySchema.safeParse({
      limit: url.searchParams.get("limit") ?? undefined,
    });
    if (!parsed.success) {
      return apiError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Invalid query",
        details: z.flattenError(parsed.error),
      });
    }

    const cookieStore = await cookies();
    const userSessionId = await ensureAnonymousSession(cookieStore);
    const history = await getRecentHistory({
      userSessionId,
      limit: parsed.data.limit,
    });
    return apiOk(HistoryResponseSchema.parse(history));
  } catch (error) {
    logger.error("history_fetch_failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return apiError({
      status: 500,
      code: "INTERNAL_ERROR",
      message: "Failed to fetch history",
    });
  }
}

