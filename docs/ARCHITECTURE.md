# Architecture

This document captures the detailed runtime architecture for Job Post Discovery.

## Agent Graph

Source of truth:
- `src/lib/agent/graph.ts`
- `src/lib/agent/graph-diagram.ts`

Current high-level flow:

```
START -> planning_phase -> execution_routing
      -> retrieval_arm and/or query_generation
      -> search -> extraction_node -> combined_result -> scoring_node
      -> planning_phase or final_response_generation
```

## Node Details

See:
- `src/lib/agent/nodes/planning-phase.ts`
- `src/lib/agent/nodes/execution-routing.ts`
- `src/lib/agent/nodes/retrieval-arm.ts`
- `src/lib/agent/nodes/query-generation.ts`
- `src/lib/agent/nodes/search.ts`
- `src/lib/agent/nodes/extraction.ts`
- `src/lib/agent/nodes/combined-result.ts`
- `src/lib/agent/nodes/scoring.ts`
- `src/lib/agent/nodes/final-response-generation.ts`

## Notes

This is a placeholder deep-dive document and should be expanded with:
- full state contract mapping
- per-node inputs/outputs
- stop-rule semantics
- iteration/routing examples
