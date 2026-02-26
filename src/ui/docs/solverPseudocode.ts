import type { SolverPluginId } from "@/core/plugins/solvers";

export interface SolverPseudocodeDoc {
  title: string;
  summary: string;
  lines: string[];
}

export const SOLVER_PSEUDOCODE: Record<SolverPluginId, SolverPseudocodeDoc> = {
  "random-mouse": {
    title: "Random Mouse",
    summary: "Random local walking with safety fallback path recovery.",
    lines: [
      "initialize at start and mark visited/current",
      "if current is goal: reconstruct and finish",
      "pick random open neighbor and move",
      "record first-discovery parent edges",
      "if goal reached: mark path and finish",
      "if random budget exhausted: switch to shortest-path fallback",
    ],
  },
  bfs: {
    title: "Breadth-First Search (BFS)",
    summary: "Queue-based level expansion for shortest path on unweighted graph.",
    lines: [
      "initialize queue with start and mark as frontier",
      "if queue is empty: no path",
      "dequeue next cell and mark visited/current",
      "if current is goal: reconstruct path and finish",
      "enqueue each undiscovered open neighbor",
    ],
  },
  dfs: {
    title: "Depth-First Search (DFS)",
    summary: "Stack-driven deep exploration with backtracking.",
    lines: [
      "initialize stack with start and mark as frontier",
      "if stack is empty: no path",
      "pop top cell and mark visited/current",
      "if current is goal: reconstruct path and finish",
      "push undiscovered open neighbors",
    ],
  },
  astar: {
    title: "A* Search",
    summary: "Prioritize open set by g(n)+h(n) heuristic score.",
    lines: [
      "seed open set with start and initialize scores",
      "if open set is empty: no path",
      "pick node with minimum f-score from open set",
      "if current is goal: reconstruct path and finish",
      "relax neighbors and update open set entries",
    ],
  },
  "astar-euclidean": {
    title: "A* (Euclidean)",
    summary: "A* variant using Euclidean heuristic distance.",
    lines: [
      "seed open set with start and euclidean heuristic",
      "if open set is empty: no path",
      "pick node with minimum f-score",
      "if current is goal: reconstruct path and finish",
      "relax neighbors and update g/f scores",
    ],
  },
  dijkstra: {
    title: "Dijkstra",
    summary: "Expand the minimum distance frontier each step.",
    lines: [
      "initialize distance(start)=0 and push start",
      "if open set is empty: no path",
      "pick node with smallest known distance",
      "if current is goal: reconstruct path and finish",
      "relax neighbor distances and enqueue improvements",
    ],
  },
  "greedy-best-first": {
    title: "Greedy Best-First",
    summary: "Expand node closest to goal by heuristic only.",
    lines: [
      "initialize open set with start",
      "if open set is empty: no path",
      "pick node with smallest heuristic distance",
      "if current is goal: reconstruct path and finish",
      "add undiscovered open neighbors",
    ],
  },
  "bidirectional-bfs": {
    title: "Bidirectional BFS",
    summary: "Grow BFS frontiers from start and goal until they meet.",
    lines: [
      "initialize two frontiers: from start and from goal",
      "if either frontier is exhausted: no path",
      "expand one side (usually smaller frontier)",
      "if frontiers meet: stitch path and finish",
      "otherwise continue alternating expansions",
    ],
  },
  "collision-solver": {
    title: "Collision Solver",
    summary: "Bidirectional wave collision from both endpoints.",
    lines: [
      "initialize frontier from start and frontier from goal",
      "expand alternating (or smaller) frontier",
      "when waves touch: collision point found",
      "stitch both parent chains through collision",
      "mark combined shortest route(s)",
    ],
  },
  "dead-end-filling": {
    title: "Dead-End Filling",
    summary: "Iteratively remove dead ends, leaving the solution corridor.",
    lines: [
      "scan grid and enqueue non-endpoint dead ends",
      "if no dead ends exist: remaining cells are final path",
      "if queue exhausted: finalize remaining path",
      "remove one dead end cell from consideration",
      "update neighbor degrees and enqueue new dead ends",
    ],
  },
  "cul-de-sac-filler": {
    title: "Cul-de-sac Filler",
    summary: "Prune dead ends and trap-like branches iteratively.",
    lines: [
      "scan graph for removable cul-de-sac starts",
      "enqueue eligible cul-de-sac cells",
      "pop one candidate and remove from active maze",
      "update local degrees around removed node",
      "enqueue newly exposed cul-de-sacs",
      "remaining corridor encodes solution path(s)",
    ],
  },
  "blind-alley-sealer": {
    title: "Blind Alley Sealer",
    summary: "Seal blind alleys by structural elimination.",
    lines: [
      "identify blind alley entry points",
      "mark candidates for sealing",
      "seal one candidate and update neighbors",
      "propagate new blind alley candidates",
      "stop when no additional blind alleys remain",
    ],
  },
  "blind-alley-filler": {
    title: "Blind Alley Filler",
    summary: "Fill blind alleys progressively until route core remains.",
    lines: [
      "scan and queue blind alley cells",
      "fill next blind alley cell",
      "update adjacent topology state",
      "enqueue new blind alley exposures",
      "repeat until only viable routes remain",
    ],
  },
  "weighted-astar": {
    title: "Weighted A*",
    summary: "A* with inflated heuristic for speed-biased search.",
    lines: [
      "seed open set and weighted heuristic score",
      "if open set is empty: no path",
      "pick node with minimum weighted f-score",
      "if current is goal: reconstruct path and finish",
      "relax neighbors and update weighted priorities",
    ],
  },
  "lee-wavefront": {
    title: "Lee Wavefront",
    summary: "Wave expansion from goal, then reverse trace to start.",
    lines: [
      "initialize reverse wave from goal",
      "if wave cannot reach start: no path",
      "expand one wave node and record distances",
      "switch to trace phase once start distance is known",
      "trace downhill distance steps toward goal",
      "finish once trace reaches goal",
    ],
  },
  "flood-fill": {
    title: "Flood Fill",
    summary: "Distance flood from goal and descending trace from start.",
    lines: [
      "initialize flood wave from goal",
      "expand one wave layer and assign distances",
      "once start is reached, switch to trace mode",
      "walk to neighbor with strictly smaller distance",
      "mark traced shortest route and finish",
    ],
  },
  "shortest-path-finder": {
    title: "Shortest Path Finder",
    summary: "Single shortest route extraction on unweighted maze graph.",
    lines: [
      "run BFS from start",
      "track parent for first discovery of each node",
      "stop when goal is dequeued",
      "reconstruct one shortest path via parents",
      "mark path overlays and finish",
    ],
  },
  "shortest-paths-finder": {
    title: "Shortest Paths Finder (All)",
    summary: "Compute and mark all cells belonging to shortest routes.",
    lines: [
      "run BFS distances from start",
      "run BFS distances from goal",
      "derive shortest length from start to goal",
      "collect nodes where dStart + dGoal == shortest",
      "mark all collected shortest-path nodes",
      "finish after full shortest-set marking",
    ],
  },
  "wall-follower": {
    title: "Wall Follower (Right-Hand)",
    summary: "Local rule: keep right hand on wall while moving.",
    lines: [
      "initialize at start and mark visited",
      "if current already goal: reconstruct and finish",
      "pick next step by right-hand priority",
      "if goal reached after move: reconstruct and finish",
      "otherwise continue following wall",
    ],
  },
  "left-wall-follower": {
    title: "Wall Follower (Left-Hand)",
    summary: "Local rule: keep left hand on wall while moving.",
    lines: [
      "initialize at start and mark visited",
      "if current already goal: reconstruct and finish",
      "pick next step by left-hand priority",
      "if goal reached after move: reconstruct and finish",
      "otherwise continue following wall",
    ],
  },
  pledge: {
    title: "Pledge Algorithm",
    summary: "Wall-follow variant for escaping loops/islands.",
    lines: [
      "set preferred heading and turn counter",
      "move straight when heading is free",
      "otherwise enter wall-follow mode",
      "accumulate net turn count while tracing boundary",
      "leave wall when heading restored and counter is zero",
    ],
  },
  tremaux: {
    title: "Tremaux",
    summary: "Mark-based exploration that avoids over-traversed passages.",
    lines: [
      "mark traversed passage edges",
      "prefer unmarked exits at junctions",
      "if none, choose once-marked edge",
      "avoid twice-marked edge unless forced",
      "continue until goal discovered",
    ],
  },
  chain: {
    title: "Chain",
    summary: "Global-map guided chaining between expanding fronts.",
    lines: [
      "initialize chained frontiers from both ends",
      "expand and maintain chain links",
      "detect link collision between chains",
      "stitch chain segments into final route",
      "mark resulting path and finish",
    ],
  },
  "q-learning": {
    title: "Q-Learning (RL)",
    summary: "Reinforcement learning agent explores repeatedly, updating a Q-table until optimal path is learned.",
    lines: [
      "run training episode: agent walks maze with ε-greedy policy",
      "update Q(s,a) ← Q(s,a) + α·(r + γ·max Q(s') − Q(s,a))",
      "decay ε from exploration toward exploitation",
      "after training: follow greedy policy from start",
      "mark learned path and finish",
    ],
  },
  "ant-colony": {
    title: "Ant Colony Optimization",
    summary: "Simulated ants deposit pheromones; shorter paths get stronger trails guiding future ants.",
    lines: [
      "release ants: each walks maze weighted by pheromone intensity",
      "ants backtrack from dead ends to find alternate routes",
      "evaporate pheromones globally by decay factor ρ",
      "successful ants deposit pheromone inversely proportional to path length",
      "elite bonus: reinforce global best path each generation",
      "after training: trace best path found and finish",
    ],
  },
};
