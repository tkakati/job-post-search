import { z } from "zod";
import { apiError, apiOk } from "@/lib/api/response";
import { runApifyLinkedinContentDebug } from "@/lib/search/providers/apify-linkedin-content-provider";

export const runtime = "nodejs";

const DebugApifyInputSchema = z.object({
  sourceUrl: z.string().url(),
  queryText: z.string().optional(),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = DebugApifyInputSchema.safeParse(body);
  if (!parsed.success) {
    return apiError({
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Invalid debug apify input",
      details: z.flattenError(parsed.error),
    });
  }

  try {
    const out = await runApifyLinkedinContentDebug({
      sourceUrl: parsed.data.sourceUrl,
      queryText: parsed.data.queryText,
      maxPayloadAttempts: 1,
      strictCostMode: true,
    });
    return apiOk(out);
  } catch (error) {
    return apiError({
      status: 500,
      code: "APIFY_DEBUG_FAILED",
      message: error instanceof Error ? error.message : "Apify debug probe failed",
    });
  }
}
