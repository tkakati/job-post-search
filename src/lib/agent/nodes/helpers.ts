import type { AgentGraphState } from "@/lib/agent/state";

export function appendDebug(state: AgentGraphState, message: string): string[] {
  return [...state.debugLog, `[iteration=${state.iteration}] ${message}`];
}

