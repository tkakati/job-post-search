import { cn } from "@/lib/utils";
import * as React from "react";

type GraphData = {
  nodes: string[];
  edges: Array<{ source: string; target: string; conditional: boolean }>;
};

type Pt = { x: number; y: number };
type NodeDetails = {
  inputSummary?: string;
  outputSummary?: string;
  decision?: string;
  chosenTarget?: string;
  latencyMs?: number | null;
};

const NODE_W = 192;
const NODE_H = 72;

const KNOWN_LAYOUT: Record<string, { x: number; y: number }> = {
  START: { x: 40, y: 190 },
  // centered exactly between START and execution_routing (by node centers)
  planning_phase: { x: 250, y: 190 },
  execution_routing: { x: 460, y: 190 },
  retrieval_arm: { x: 690, y: 80 },
  query_generation: { x: 690, y: 300 },
  search: { x: 910, y: 300 },
  extraction_node: { x: 1130, y: 300 },
  combined_result: { x: 1130, y: 80 },
  scoring_node: { x: 1350, y: 80 },
  final_response_generation: { x: 1570, y: 80 },
  END: { x: 1790, y: 80 },
};

function buildNodePositions(graph: GraphData) {
  const positions = new Map<string, { x: number; y: number }>();
  for (const id of graph.nodes) {
    if (KNOWN_LAYOUT[id]) positions.set(id, KNOWN_LAYOUT[id]);
  }
  const unknown = graph.nodes
    .filter((n) => !positions.has(n))
    .sort((a, b) => a.localeCompare(b));
  unknown.forEach((id, idx) => {
    positions.set(id, { x: 240 + idx * 190, y: 380 });
  });
  return positions;
}

function left(p: Pt) {
  return { x: p.x, y: p.y + NODE_H / 2 };
}
function right(p: Pt) {
  return { x: p.x + NODE_W, y: p.y + NODE_H / 2 };
}
function topCenter(p: Pt) {
  return { x: p.x + NODE_W / 2, y: p.y };
}
function bottomCenter(p: Pt) {
  return { x: p.x + NODE_W / 2, y: p.y + NODE_H };
}

function decisionLeft(p: Pt) {
  // execution_routing is rendered as a 110x110 diamond offset by +40px.
  return { x: p.x + 40, y: p.y + NODE_H / 2 };
}

function decisionRight(p: Pt) {
  return { x: p.x + 150, y: p.y + NODE_H / 2 };
}

function pathFromPoints(points: Pt[]) {
  return points
    .map((p, idx) => `${idx === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");
}

function edgeLabel(source: string, target: string) {
  if (source === "execution_routing" && target === "retrieval_arm") {
    return "Using existing results";
  }
  if (source === "execution_routing" && target === "query_generation") {
    return "Running fresh search";
  }
  if (source === "retrieval_arm" && target === "query_generation") {
    return "Expand with search";
  }
  if (source === "retrieval_arm" && target === "combined_result") {
    return "Use retrieved leads";
  }
  if (source === "scoring_node" && target === "planning_phase") {
    return "Continue planning";
  }
  if (source === "scoring_node" && target === "final_response_generation") {
    return "Final results selected";
  }
  return "";
}

function planningDataFlowPath(
  positions: Map<string, { x: number; y: number }>,
): Pt[] | null {
  const scoring = positions.get("scoring_node");
  const planning = positions.get("planning_phase");
  if (!scoring || !planning) return null;
  const laneY = 30;
  const from = topCenter(scoring);
  const to = topCenter(planning);
  return [from, { x: from.x, y: laneY }, { x: to.x, y: laneY }, to];
}

function pathPoints(
  source: string,
  target: string,
  positions: Map<string, { x: number; y: number }>,
): Pt[] | null {
  const s = positions.get(source);
  const t = positions.get(target);
  if (!s || !t) return null;

  if (source === "START" && target === "planning_phase") {
    return [right(s), left(t)];
  }
  if (source === "planning_phase" && target === "execution_routing") {
    return [right(s), decisionLeft(t)];
  }
  if (source === "execution_routing" && target === "retrieval_arm") {
    const a = decisionRight(s);
    const b = left(t);
    return [a, { x: 640, y: a.y }, { x: 640, y: b.y }, b];
  }
  if (source === "execution_routing" && target === "query_generation") {
    const a = decisionRight(s);
    const b = left(t);
    return [a, { x: 640, y: a.y }, { x: 640, y: b.y }, b];
  }
  if (source === "retrieval_arm" && target === "query_generation") {
    const a = bottomCenter(s);
    const b = topCenter(t);
    return [a, { x: a.x, y: b.y }, b];
  }
  if (source === "retrieval_arm" && target === "combined_result") {
    return [right(s), left(t)];
  }
  if (source === "query_generation" && target === "search") {
    return [right(s), left(t)];
  }
  if (source === "search" && target === "extraction_node") {
    return [right(s), left(t)];
  }
  if (source === "extraction_node" && target === "combined_result") {
    const a = topCenter(s);
    const b = bottomCenter(t);
    return [a, { x: a.x, y: b.y }, b];
  }
  if (source === "combined_result" && target === "scoring_node") {
    return [right(s), left(t)];
  }
  if (source === "scoring_node" && target === "final_response_generation") {
    return [right(s), left(t)];
  }
  if (source === "final_response_generation" && target === "END") {
    return [right(s), left(t)];
  }
  if (source === "scoring_node" && target === "planning_phase") {
    // Exit from the TOP of scoring_node so this edge never shares the left anchor with
    // combined_result → scoring_node (avoids a T-junction in the middle of that segment).
    const LOOP_LANE_Y = 56;
    const a = topCenter(s);
    const b = topCenter(t);
    return [a, { x: a.x, y: LOOP_LANE_Y }, { x: b.x, y: LOOP_LANE_Y }, b];
  }

  const a = right(s);
  const b = left(t);
  const midX = a.x + (b.x - a.x) / 2;
  return [a, { x: midX, y: a.y }, { x: midX, y: b.y }, b];
}

function nodeClassForType(id: string) {
  if (id === "START" || id === "END") {
    return "rounded-full bg-slate-700/72 text-slate-50";
  }
  if (id === "planning_phase" || id === "query_generation") {
    return "rounded-[18px] bg-violet-500/46 text-violet-50";
  }
  if (id === "execution_routing") {
    return "bg-orange-400/40 text-orange-50";
  }
  if (id === "scoring_node") {
    return "rounded-[10px] bg-amber-500/28 text-amber-50";
  }
  if (id === "final_response_generation") {
    return "rounded-[10px] bg-emerald-500/28 text-emerald-50";
  }
  if (id === "extraction_node") {
    return "rounded-[10px] bg-slate-500/28 text-slate-100";
  }
  return "rounded-[10px] bg-slate-500/24 text-slate-100";
}

function nodeSubtitle(id: string, variant: "default" | "data-flow") {
  switch (id) {
    case "planning_phase":
      return variant === "data-flow"
        ? "Decision engine (uses scored results)"
        : "Decision engine";
    case "execution_routing":
      return "Route execution";
    case "retrieval_arm":
      return "Fetch existing leads";
    case "query_generation":
      return "Generate discovery queries";
    case "search":
      return "Fetch candidate posts";
    case "extraction_node":
      return "Extract structured job signals";
    case "combined_result":
      return "Merge, dedupe, mark new";
    case "scoring_node":
      return variant === "data-flow"
        ? "Evaluate leads -> produce signals"
        : "Evaluate (no decisions)";
    case "final_response_generation":
      return "Prepare final user results";
    default:
      return "";
  }
}

function NodeBox({
  id,
  label,
  activeNode,
  completedNodes,
  hasExecution,
  pos,
  onHover,
  onLeave,
  onSelect,
  isSelected,
  variant,
}: {
  id: string;
  label: string;
  activeNode: string | null;
  completedNodes: Set<string>;
  hasExecution: boolean;
  pos: { x: number; y: number };
  onHover: (id: string) => void;
  onLeave: () => void;
  onSelect: (id: string) => void;
  isSelected: boolean;
  variant: "default" | "data-flow";
}) {
  const isActive = activeNode === id;
  const isCompleted = completedNodes.has(id);
  const isDecision = id === "execution_routing";
  const isDefault = !isActive && !isCompleted;

  if (isDecision) {
    return (
      <button
        type="button"
        onMouseEnter={() => onHover(id)}
        onMouseLeave={onLeave}
        onClick={() => onSelect(id)}
        className={cn(
          "group absolute z-30 h-[110px] w-[110px] border border-orange-300/40 bg-orange-500/20 shadow-sm transition-all",
          isActive && "z-40 scale-[1.02] border-orange-100 bg-orange-500/32 shadow-[0_0_14px_rgba(251,146,60,0.22)]",
          isCompleted && !isActive && "opacity-70",
          hasExecution && isDefault && "opacity-50",
          isSelected && "z-40 ring-2 ring-cyan-300/90 shadow-[0_0_0_1px_rgba(34,211,238,0.42)]",
          !isActive && !isSelected && "hover:border-orange-200/55 hover:bg-orange-400/25 hover:opacity-90",
        )}
        style={{
          left: pos.x + 40,
          top: pos.y - 20,
          clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)",
        }}
      >
        <div className="flex h-full w-full flex-col items-center justify-center px-2 text-orange-50">
          <span className="max-w-full truncate whitespace-nowrap text-[13px] font-semibold">
            {label}
          </span>
        </div>
      </button>
    );
  }

  return (
    <button
      type="button"
      onMouseEnter={() => onHover(id)}
      onMouseLeave={onLeave}
      onClick={() => onSelect(id)}
      className={cn(
        "absolute z-20 border border-white/10 px-3 py-2 text-center shadow-sm transition-all duration-200",
        nodeClassForType(id),
        isActive &&
          "z-40 scale-[1.02] border-cyan-300/55 shadow-[0_0_14px_rgba(34,211,238,0.2)]",
        isCompleted && !isActive && "opacity-75",
        hasExecution && isDefault && "opacity-50",
        isSelected && "z-40 ring-2 ring-cyan-300/90 shadow-[0_0_0_1px_rgba(34,211,238,0.42)]",
        !isActive && !isSelected && "hover:border-slate-200/30 hover:bg-white/[0.06] hover:opacity-90",
      )}
      style={{
        left: pos.x,
        top: pos.y,
        width: NODE_W,
        minHeight: NODE_H,
        transformOrigin: "center center",
      }}
    >
      <div className="mb-1 flex justify-center">
        <span className="block truncate whitespace-nowrap text-center text-[14px] font-medium text-slate-50">
          {label}
        </span>
      </div>
      <div className="truncate whitespace-nowrap text-center text-[12px] text-white/80">
        {nodeSubtitle(id, variant)}
      </div>
    </button>
  );
}

export function AgentGraphDiagram({
  activeNode,
  graph,
  completedNodes = new Set<string>(),
  traversedEdges = new Set<string>(),
  nodeDetails = {},
  onNodeClick,
  variant = "default",
}: {
  activeNode: string | null;
  graph: GraphData;
  completedNodes?: Set<string>;
  traversedEdges?: Set<string>;
  nodeDetails?: Record<string, NodeDetails>;
  onNodeClick?: (nodeId: string) => void;
  variant?: "default" | "data-flow";
}) {
  const svgId = React.useId().replace(/:/g, "");
  const [hoveredNode, setHoveredNode] = React.useState<string | null>(null);
  const [selectedNode, setSelectedNode] = React.useState<string | null>(null);
  const [flashNode, setFlashNode] = React.useState<string | null>(null);
  const viewportRef = React.useRef<HTMLDivElement | null>(null);
  const [viewportSize, setViewportSize] = React.useState({ width: 0, height: 0 });
  const positions = React.useMemo(() => buildNodePositions(graph), [graph]);
  const hasExecution = completedNodes.size > 0 || activeNode !== null || traversedEdges.size > 0;
  const isTraversed = (from: string, to: string) => traversedEdges.has(`${from}->${to}`);

  const width = Math.max(
    1780,
    ...Array.from(positions.values()).map((p) => p.x + NODE_W + 80),
  );
  const height = Math.max(
    300,
    ...Array.from(positions.values()).map((p) => p.y + NODE_H + 8),
  );
  const scale = React.useMemo(() => {
    if (viewportSize.width <= 0 || viewportSize.height <= 0) return 1;
    const horizontal = (viewportSize.width - 8) / width;
    const vertical = (viewportSize.height - 8) / height;
    return Math.min(horizontal, vertical, 1);
  }, [viewportSize.width, viewportSize.height, width, height]);

  React.useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const update = () => {
      setViewportSize({
        width: el.clientWidth,
        height: el.clientHeight,
      });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const nodeEntries = graph.nodes
    .map((id) => ({ id, pos: positions.get(id) }))
    .filter(
      (entry): entry is { id: string; pos: { x: number; y: number } } =>
        Boolean(entry.pos),
    );

  const focusedNode = selectedNode ?? hoveredNode;
  const focusedDetails = focusedNode ? nodeDetails[focusedNode] : null;
  const focusedRoutingEdge =
    focusedNode === "execution_routing" && focusedDetails?.chosenTarget
      ? `execution_routing->${focusedDetails.chosenTarget}`
      : null;
  const isFocusedBranch = (from: string, to: string) =>
    focusedRoutingEdge != null && focusedRoutingEdge === `${from}->${to}`;
  const isEdgeHot = (from: string, to: string) =>
    isTraversed(from, to) || isFocusedBranch(from, to);

  React.useEffect(() => {
    if (!flashNode) return;
    const timer = window.setTimeout(() => setFlashNode(null), 1600);
    return () => window.clearTimeout(timer);
  }, [flashNode]);

  return (
    <div ref={viewportRef} className="h-[250px] w-full overflow-hidden rounded-lg bg-[#0b1020] p-2">
      <div
        className="relative origin-top-left"
        style={{
          width: `${width}px`,
          height: `${height}px`,
          transform: `scale(${scale})`,
        }}
      >
        <div className="pointer-events-none absolute left-[236px] top-0 z-[1] h-full w-[390px] rounded-md bg-violet-500/[0.12]" />
        <div className="pointer-events-none absolute left-[650px] top-0 z-[1] h-full w-[680px] rounded-md bg-sky-500/[0.1]" />
        <div className="pointer-events-none absolute left-[1340px] top-0 z-[1] h-full w-[210px] rounded-md bg-amber-400/[0.12]" />
        <div className="pointer-events-none absolute left-[246px] top-[6px] z-[2] rounded bg-[#111a33]/88 px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-slate-50">
          Planning Layer
        </div>
        <div className="pointer-events-none absolute left-[660px] top-[6px] z-[2] rounded bg-[#111a33]/88 px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-slate-50">
          Execution Layer
        </div>
        <div className="pointer-events-none absolute left-[1350px] top-[6px] z-[2] rounded bg-[#111a33]/88 px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-slate-50">
          Evaluation Layer
        </div>
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(148,163,184,0.15) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.15) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          className="absolute left-0 top-0 z-10"
          style={{ width: `${width}px`, height: `${height}px` }}
        >
          <defs>
            <marker
              id={`${svgId}-arrow`}
              markerWidth="8"
              markerHeight="8"
              refX="6"
              refY="3"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path d="M0,0 L0,6 L6,3 z" fill="#e2e8f0" />
            </marker>
          </defs>
          {graph.edges.map((edge, idx) => {
            const points = pathPoints(edge.source, edge.target, positions);
            const from = positions.get(edge.source);
            const to = positions.get(edge.target);
            if (!points || points.length < 2 || !from || !to) return null;
            const d = pathFromPoints(points);
            const pathId = `${svgId}-edge-${idx}-${edge.source}-${edge.target}`;
            const color = isEdgeHot(edge.source, edge.target) ? "#93c5fd" : "#64748b";
            const label = edgeLabel(edge.source, edge.target);
            const dashed = variant === "data-flow" ? false : edge.conditional;
            return (
              <g key={`${edge.source}-${edge.target}-${idx}`} className="group">
                <path
                  id={pathId}
                  d={d}
                  fill="none"
                  stroke={color}
                  strokeWidth={isEdgeHot(edge.source, edge.target) ? "2.0" : "1.05"}
                  strokeDasharray={dashed ? "5 5" : undefined}
                  markerEnd={`url(#${svgId}-arrow)`}
                  className={cn(
                    isEdgeHot(edge.source, edge.target) &&
                      "drop-shadow-[0_0_4px_rgba(147,197,253,0.45)]",
                    hasExecution && !isEdgeHot(edge.source, edge.target) && "opacity-35",
                  )}
                >
                  {label ? <title>{label}</title> : null}
                </path>
                {label ? (
                  <text
                    fontSize="10"
                    fill="#cbd5e1"
                    dy="-4"
                    className={cn(
                      "pointer-events-none opacity-0 transition-opacity duration-150 group-hover:opacity-100",
                      isEdgeHot(edge.source, edge.target) && "opacity-100",
                    )}
                    style={{ paintOrder: "stroke", stroke: "#0b1020", strokeWidth: 3 }}
                  >
                    <textPath
                      href={`#${pathId}`}
                      startOffset={
                        edge.source === "execution_routing" ? "62%" : "50%"
                      }
                      textAnchor="middle"
                    >
                      {label}
                    </textPath>
                  </text>
                ) : null}
              </g>
            );
          })}
          {variant === "data-flow" ? (() => {
            const dataFlowPoints = planningDataFlowPath(positions);
            if (!dataFlowPoints || dataFlowPoints.length < 2) return null;
            const dataFlowPathId = `${svgId}-data-flow-scoring-planning`;
            return (
              <g className="group">
                <path
                  id={dataFlowPathId}
                  d={pathFromPoints(dataFlowPoints)}
                  fill="none"
                  stroke="#22d3ee"
                  strokeWidth="1.4"
                  strokeDasharray="6 4"
                  markerEnd={`url(#${svgId}-arrow)`}
                  className="drop-shadow-[0_0_4px_rgba(34,211,238,0.35)]"
                >
                  <title>scored leads (N, scores, signals)</title>
                </path>
                <text
                  fontSize="10"
                  fill="#67e8f9"
                  dy="-4"
                  className="pointer-events-none opacity-100"
                  style={{ paintOrder: "stroke", stroke: "#0b1020", strokeWidth: 3 }}
                >
                  <textPath href={`#${dataFlowPathId}`} startOffset="54%" textAnchor="middle">
                    scored leads (N, scores, signals)
                  </textPath>
                </text>
              </g>
            );
          })() : null}
        </svg>
        {nodeEntries.map((entry) => (
          <NodeBox
            key={entry.id}
            id={entry.id}
            label={entry.id}
            activeNode={activeNode}
            completedNodes={completedNodes}
            hasExecution={hasExecution}
            pos={entry.pos}
            onHover={setHoveredNode}
            onLeave={() => setHoveredNode((prev) => (selectedNode ? prev : null))}
            onSelect={(id) => {
              setSelectedNode(id);
              setFlashNode(id);
              onNodeClick?.(id);
            }}
            isSelected={selectedNode === entry.id || flashNode === entry.id}
            variant={variant}
          />
        ))}
        {variant === "data-flow" ? (
          <>
            <div className="pointer-events-none absolute left-[250px] top-[88px] z-[25] max-w-[250px] rounded-md border border-cyan-300/35 bg-[#081126]/92 px-2.5 py-2 text-[10px] leading-4 text-cyan-100">
              <p>
                In the first iteration, existing data is retrieved and scored to see if
                there are &gt;20 high quality results for the user.
              </p>
            </div>
            <div className="pointer-events-none absolute bottom-[8px] right-[16px] z-[25] rounded bg-[#111a33]/90 px-2 py-1 text-[10px] text-slate-200">
              Solid: control flow | Dashed: data flow
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
