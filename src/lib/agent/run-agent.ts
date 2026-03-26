import type { UserInput } from "@/lib/types/contracts";
import {
  createInitialAgentGraphState,
  AgentGraphStateSchema,
} from "@/lib/agent/state";
import { createAgentGraph } from "@/lib/agent/graph";

export type RunAgentInput = UserInput & {
  searchRunId?: number | null;
  maxIterations?: number;
  targetHighQualityLeads?: number;
  shownLeadIdentityKeys?: string[];
};

/**
 * Simple entrypoint for invoking the LangGraph agent skeleton.
 */
export async function runAgent(input: RunAgentInput) {
  const initial = createInitialAgentGraphState({
    userSessionId: input.userSessionId,
    searchRunId: input.searchRunId ?? null,
    role: input.role,
    location: input.location,
    locationIsHardFilter: input.locationIsHardFilter ?? false,
    employmentType: input.employmentType ?? null,
    recencyPreference: input.recencyPreference,
    maxIterations: input.maxIterations ?? 3,
    targetHighQualityLeads: input.targetHighQualityLeads ?? 20,
    shownLeadIdentityKeys: input.shownLeadIdentityKeys ?? [],
  });

  const graph = createAgentGraph();
  const result = await graph.invoke(initial);

  // Explicit parsing keeps runtime contracts deterministic and debuggable.
  const state = AgentGraphStateSchema.parse(result);
  return state;
}
