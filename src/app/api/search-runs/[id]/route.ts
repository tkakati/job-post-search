import { cookies } from "next/headers";
import { z } from "zod";
import { SearchRunEnvelopeSchema } from "@/lib/schemas/api";
import { ensureAnonymousSession } from "@/lib/api/session";
import { getSearchRunResult } from "@/lib/api/search-runs";
import { apiError, apiOk } from "@/lib/api/response";
import { logger } from "@/lib/observability/logger";

export const runtime = "nodejs";

const ParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const params = await context.params;
    const parsed = ParamsSchema.safeParse(params);
    if (!parsed.success) {
      return apiError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Invalid run id",
        details: z.flattenError(parsed.error),
      });
    }

    const cookieStore = await cookies();
    const userSessionId = await ensureAnonymousSession(cookieStore);
    const envelope = await getSearchRunResult({
      userSessionId,
      runId: parsed.data.id,
    });
    const payload = SearchRunEnvelopeSchema.parse(envelope);

    if (payload.status === "failed" && payload.error === "Search run not found") {
      return apiError({
        status: 404,
        code: "NOT_FOUND",
        message: "Search run not found",
      });
    }
    return apiOk(payload, payload.status === "failed" ? 500 : 200);
  } catch (error) {
    logger.error("search_run_fetch_failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return apiError({
      status: 500,
      code: "INTERNAL_ERROR",
      message: "Failed to fetch search run",
    });
  }
}

