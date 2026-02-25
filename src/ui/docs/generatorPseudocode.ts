import type { GeneratorPluginId } from "@/core/plugins/generators";

export interface GeneratorPseudocodeDoc {
  title: string;
  summary: string;
  lines: string[];
}

export const GENERATOR_PSEUDOCODE: Record<
  GeneratorPluginId,
  GeneratorPseudocodeDoc
> = {
  "dfs-backtracker": {
    title: "Recursive Backtracker (DFS)",
    summary: "Depth-first carve with backtracking stack.",
    lines: [
      "if first step: mark start visited and push on stack",
      "if stack is empty: finish",
      "current <- top(stack); unvisited <- neighbors(current)",
      "if unvisited is empty: pop stack and backtrack",
      "pick random unvisited neighbor and carve passage",
      "mark neighbor visited and push neighbor onto stack",
    ],
  },
  prim: {
    title: "Randomized Prim",
    summary: "Grow maze by sampling random frontier cells.",
    lines: [
      "if first step: visit start and seed frontier",
      "if frontier is empty: finish",
      "pick random cell from frontier",
      "connect it to one random visited neighbor",
      "mark cell visited and add its unvisited neighbors to frontier",
      "emit metrics and continue",
    ],
  },
  "prim-frontier-edges": {
    title: "Prim (Frontier Edges)",
    summary: "Prim variant that samples frontier edges directly.",
    lines: [
      "if first step: visit root and enqueue outgoing edges",
      "clear previous current marker",
      "pick random frontier edge until target is unvisited",
      "carve chosen edge and mark target visited/current",
      "enqueue target's outgoing edges to unvisited cells",
      "if no valid frontier edge remains: finish",
    ],
  },
  kruskal: {
    title: "Randomized Kruskal",
    summary: "Shuffle edges and union disjoint sets.",
    lines: [
      "if all components merged or no edges left: finish",
      "edge <- next shuffled edge",
      "if edge endpoints are in different sets: union and carve",
      "mark touched endpoints as visited overlays",
      "advance cursor and continue",
      "emit remaining frontier edge count",
    ],
  },
  "binary-tree": {
    title: "Binary Tree",
    summary: "Single pass with directional carve bias.",
    lines: [
      "if cursor reached end of grid: finish",
      "cell <- next cell in scan order",
      "candidate directions <- [north, west] when available",
      "if candidates exist: pick one and carve",
      "advance cursor",
      "emit single-cell frontier metrics",
    ],
  },
  sidewinder: {
    title: "Sidewinder",
    summary: "Build row runs and occasionally carve north.",
    lines: [
      "if row cursor is past last row: finish",
      "visit current row cell",
      "decide whether to close current horizontal run",
      "if closing run: carve north from random run member",
      "else: carve east to extend run",
      "advance x/y cursors to next step",
    ],
  },
  "aldous-broder": {
    title: "Aldous-Broder",
    summary: "Random walk; only carve on first visit.",
    lines: [
      "if first step: start random walk at random root",
      "if all cells visited: finish",
      "pick random neighbor of current cell",
      "if neighbor is unvisited: carve and mark visited",
      "move current pointer to picked neighbor",
      "emit walk frontier metrics",
    ],
  },
  "hunt-and-kill": {
    title: "Hunt-and-Kill",
    summary: "Alternate random walk and linear hunt phases.",
    lines: [
      "if first step: mark random start visited",
      "try random walk step to an unvisited neighbor",
      "if walk step exists: carve and move",
      "otherwise scan for unvisited cell adjacent to visited",
      "if scan finds one: connect it and continue walk",
      "if scan finds none: finish",
    ],
  },
  "growing-tree": {
    title: "Growing Tree",
    summary: "Use active list with newest/random selection bias.",
    lines: [
      "if first step: seed active list with start",
      "if active list empty: finish",
      "cell <- select active entry by policy",
      "if unvisited neighbor exists: carve and append neighbor",
      "else: remove cell from active list",
      "emit active-size frontier metrics",
    ],
  },
  "bfs-tree": {
    title: "Randomized BFS Tree",
    summary: "Queue-driven wavefront spanning tree.",
    lines: [
      "if first step: enqueue and visit start",
      "if queue exhausted: finish",
      "cell <- dequeue frontier head",
      "for each unvisited neighbor: carve, visit, enqueue",
      "set next queue head as current",
      "emit queue-based frontier metrics",
    ],
  },
  eller: {
    title: "Eller",
    summary: "Row-wise disjoint-set generation with prebuilt operations.",
    lines: [
      "if no pending operations: finish",
      "take next precomputed carve operation batch",
      "apply carve operations to grid",
      "mark touched cells as visited overlays",
      "advance operation cursor",
      "emit row-progress metrics",
    ],
  },
  houston: {
    title: "Houston (AB + Wilson)",
    summary: "Hybrid: early Aldous-Broder, then Wilson.",
    lines: [
      "if first step: initialize root and AB phase",
      "while AB target not reached: random walk and carve first visits",
      "switch to Wilson mode when AB threshold reached",
      "if Wilson walk empty: start from random unvisited node",
      "Wilson step: hit-tree => carve path, loop => erase, else extend",
      "finish when all cells are in tree",
    ],
  },
  wilson: {
    title: "Wilson",
    summary: "Loop-erased random walks into existing tree.",
    lines: [
      "if all nodes are in tree: finish",
      "if walk empty: start from random unvisited node",
      "take random walk step to neighboring node",
      "if walk hits tree: carve whole loop-erased walk",
      "if walk loops: erase cycle suffix",
      "else: extend walk frontier and continue",
    ],
  },
};
