import { cookies } from "next/headers";
import { z } from "zod";
import {
  SearchRunEnvelopeSchema,
  StartSearchRunInputSchema,
} from "@/lib/schemas/api";
import { ensureAnonymousSession } from "@/lib/api/session";
import { startSearchRun } from "@/lib/api/search-runs";
import { apiError, apiOk } from "@/lib/api/response";
import { logger } from "@/lib/observability/logger";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = StartSearchRunInputSchema.safeParse(body);
    if (!parsed.success) {
      return apiError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Invalid input",
        details: z.flattenError(parsed.error),
      });
    }

    const cookieStore = await cookies();
    const userSessionId = await ensureAnonymousSession(cookieStore);
    const envelope = await startSearchRun({
      userSessionId,
      ...parsed.data,
    });

    const payload = SearchRunEnvelopeSchema.parse(envelope);
    const status = payload.status === "failed" ? 500 : 200;
    logger.info("search_run_created", {
      runId: payload.runId,
      status: payload.status,
      userSessionId,
    });
    return apiOk(payload, status);
  } catch (error) {
    logger.error("search_run_create_failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return apiError({
      status: 500,
      code: "INTERNAL_ERROR",
      message: "Failed to create search run",
    });
  }
}

