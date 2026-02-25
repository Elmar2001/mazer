import type { SolverPluginId } from "@/core/plugins/solvers";

export interface SolverPseudocodeDoc {
  title: string;
  summary: string;
  lines: string[];
}

export const SOLVER_PSEUDOCODE: Record<SolverPluginId, SolverPseudocodeDoc> = {
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
};
