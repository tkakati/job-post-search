import { cookies } from "next/headers";
import { z } from "zod";
import { ensureAnonymousSession } from "@/lib/api/session";
import { LeadFeedbackInputSchema } from "@/lib/schemas/api";
import { recordLeadFeedback } from "@/lib/api/search-runs";
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
    const parsedBody = LeadFeedbackInputSchema.safeParse(body);
    if (!parsedBody.success) {
      return apiError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Invalid input",
        details: z.flattenError(parsedBody.error),
      });
    }

    const cookieStore = await cookies();
    const userSessionId = await ensureAnonymousSession(cookieStore);
    await recordLeadFeedback({
      userSessionId,
      leadId: parsedParams.data.id,
      ...parsedBody.data,
    });
    return apiOk({ tracked: true });
  } catch (error) {
    logger.error("lead_feedback_track_failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return apiError({
      status: 500,
      code: "INTERNAL_ERROR",
      message: "Failed to track lead feedback",
    });
  }
}

