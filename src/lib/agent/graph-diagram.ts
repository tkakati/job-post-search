export const AGENT_GRAPH_MERMAID = `flowchart TD
  A["START"] --> P["planning_phase<br/>Decision engine"]
  P --> R["execution_routing<br/>Route execution"]

  R -->|retrieval enabled| T["retrieval_arm<br/>Fetch existing leads"]
  R -->|retrieval disabled| Q["query_generation"]

  T -->|fresh enabled (both path, sequential)| Q
  T -->|fresh disabled (retrieval_only path)| C["combined_result"]

  Q --> S["search"]
  S --> X["extraction_node"]
  X --> C

  C --> D["scoring_node<br/>Evaluate (no decisions)"]
  D -->|taskComplete=false| P
  D -->|taskComplete=true (from planner policy)| F["final_response_generation"]
  F --> E["END"]`;

export const AGENT_GRAPH_MERMAID_DATA_FLOW = `flowchart TD
  A["START"] --> P["planning_phase<br/>Decision engine (uses scored results)"]
  P --> R["execution_routing<br/>Route execution"]

  R -->|retrieval enabled| T["retrieval_arm<br/>Fetch existing leads"]
  R -->|retrieval disabled| Q["query_generation"]

  T -->|fresh enabled (both path, sequential)| Q
  T -->|fresh disabled (retrieval_only path)| C["combined_result"]

  Q --> S["search"]
  S --> X["extraction_node"]
  X --> C

  C --> D["scoring_node<br/>Evaluate leads -> produce signals"]
  D -->|taskComplete=false| P
  D -->|taskComplete=true (from planner policy)| F["final_response_generation"]
  D -.->|"scored leads (N, scores, signals)"| P
  F --> E["END"]

  I["In the first iteration, existing data is retrieved and scored to see if there are >20 high quality results for the user."] -.-> P`;
