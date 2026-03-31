import { cookies } from "next/headers";
import { ensureUserSessionContext, readOptionalClerkUserId } from "@/lib/api/session";
import { runAgent } from "@/lib/agent/run-agent";
import {
  fetchHiddenLeadExclusions,
  fetchPriorShownIdentitySet,
  purgeExpiredLeads,
} from "@/lib/api/search-runs";
import { DiscoverInputSchema } from "@/lib/schemas/discover";
import { apiError, apiOk } from "@/lib/api/response";
import { logger } from "@/lib/observability/logger";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = DiscoverInputSchema.safeParse(json);
  if (!parsed.success) {
    return apiError({
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Invalid input",
      details: parsed.error.flatten(),
    });
  }

  const cookieStore = await cookies();
  const clerkUserId = await readOptionalClerkUserId();
  const session = await ensureUserSessionContext({
    cookieStore,
    clerkUserId,
  });

  const { role, location, recencyPreference } = parsed.data;

  try {
    await purgeExpiredLeads({ olderThanDays: 31 });
    const shownLeadIdentityKeys = Array.from(
      await fetchPriorShownIdentitySet({
        userSessionId: session.userSessionId,
        sessionScopeIds: session.sessionScopeIds,
      }),
    );
    const hiddenExclusions = await fetchHiddenLeadExclusions({
      userSessionId: session.userSessionId,
      sessionScopeIds: session.sessionScopeIds,
    });
    const state = await runAgent({
      userSessionId: session.userSessionId,
      role,
      location,
      recencyPreference,
      shownLeadIdentityKeys,
      hiddenLeadIdentityKeys: Array.from(hiddenExclusions.hiddenIdentityKeys),
      hiddenLeadCanonicalUrls: Array.from(hiddenExclusions.hiddenCanonicalUrls),
    });
    return apiOk({
      runId: state.searchRunId ?? null,
      roleLocationKey: state.roleLocationKey,
      iteration: state.iteration,
      final: state.finalResponse,
      debugLog: state.debugLog,
    });
  } catch (err) {
    logger.error("discover_failed", {
      error: err instanceof Error ? err.message : "unknown",
    });
    return apiError({
      status: 500,
      code: "INTERNAL_ERROR",
      message: "Job discovery failed",
    });
  }
}
