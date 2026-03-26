import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import type { AgentGraphState } from "@/lib/agent/state";
import {
  planningPhaseNode,
} from "@/lib/agent/nodes/planning-phase";
import {
  executionRoutingNode,
  routeFromExecution,
} from "@/lib/agent/nodes/execution-routing";
import {
  retrievalArmNode,
  routeAfterRetrieval,
} from "@/lib/agent/nodes/retrieval-arm";
import { queryGenerationNode } from "@/lib/agent/nodes/query-generation";
import { searchNode } from "@/lib/agent/nodes/search";
import { extractionNode } from "@/lib/agent/nodes/extraction";
import {
  combinedResultNode,
} from "@/lib/agent/nodes/combined-result";
import { routeAfterScoring, scoringNode } from "@/lib/agent/nodes/scoring";
import { finalResponseGenerationNode } from "@/lib/agent/nodes/final-response-generation";

const AgentStateAnnotation = Annotation.Root({
  userSessionId: Annotation<string>(),
  searchRunId: Annotation<AgentGraphState["searchRunId"]>(),
  role: Annotation<string>(),
  location: Annotation<string>(),
  locationIsHardFilter: Annotation<boolean>(),
  employmentType: Annotation<AgentGraphState["employmentType"]>(),
  recencyPreference: Annotation<AgentGraphState["recencyPreference"]>(),
  userRoleEmbedding: Annotation<AgentGraphState["userRoleEmbedding"]>(),
  iteration: Annotation<number>(),
  maxIterations: Annotation<number>(),
  targetHighQualityLeads: Annotation<number>(),
  roleLocationKey: Annotation<string>(),
  retrievalSummarySignal: Annotation<AgentGraphState["retrievalSummarySignal"]>(),
  priorIterationContext: Annotation<AgentGraphState["priorIterationContext"]>(),

  plannerOutput: Annotation<AgentGraphState["plannerOutput"]>(),
  retrievalResults: Annotation<AgentGraphState["retrievalResults"]>(),
  generatedQueries: Annotation<AgentGraphState["generatedQueries"]>(),
  generatedQueryHistory: Annotation<AgentGraphState["generatedQueryHistory"]>(),
  searchResults: Annotation<AgentGraphState["searchResults"]>(),
  extractionResults: Annotation<AgentGraphState["extractionResults"]>(),
  combinedResults: Annotation<AgentGraphState["combinedResults"]>(),
  scoringResults: Annotation<AgentGraphState["scoringResults"]>(),
  finalResponse: Annotation<AgentGraphState["finalResponse"]>(),

  stopReason: Annotation<AgentGraphState["stopReason"]>(),
  taskComplete: Annotation<boolean>(),

  shownLeadIdentityKeys: Annotation<string[]>(),
  debugLog: Annotation<string[]>(),
});

/**
 * Graph flow:
 * START -> planning_phase -> execution_routing
 * -> retrieval_arm and/or query_generation
 * -> search -> extraction_node -> combined_result -> scoring_node
 * -> planning_phase or final_response_generation
 */
export function createAgentGraph() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const graph = new StateGraph(AgentStateAnnotation) as any;

  graph.addNode("planning_phase", planningPhaseNode);
  graph.addNode("execution_routing", executionRoutingNode);
  graph.addNode("retrieval_arm", retrievalArmNode);
  graph.addNode("query_generation", queryGenerationNode);
  graph.addNode("search", searchNode);
  graph.addNode("extraction_node", extractionNode);
  graph.addNode("combined_result", combinedResultNode);
  graph.addNode("scoring_node", scoringNode);
  graph.addNode("final_response_generation", finalResponseGenerationNode);

  graph.addEdge(START, "planning_phase");
  graph.addEdge("planning_phase", "execution_routing");

  graph.addConditionalEdges("execution_routing", routeFromExecution, {
    retrieval_arm: "retrieval_arm",
    query_generation: "query_generation",
  });

  graph.addConditionalEdges("retrieval_arm", routeAfterRetrieval, {
    query_generation: "query_generation",
    combined_result: "combined_result",
  });

  graph.addEdge("query_generation", "search");
  graph.addEdge("search", "extraction_node");
  graph.addEdge("extraction_node", "combined_result");

  graph.addEdge("combined_result", "scoring_node");
  graph.addConditionalEdges("scoring_node", routeAfterScoring, {
    planning_phase: "planning_phase",
    final_response_generation: "final_response_generation",
  });

  graph.addEdge("final_response_generation", END);
  graph.validate();

  return graph.compile();
}
