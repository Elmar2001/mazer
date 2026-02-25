import { aStarSolver } from "@/core/plugins/solvers/astar";
import { bfsSolver } from "@/core/plugins/solvers/bfs";
import { bidirectionalBfsSolver } from "@/core/plugins/solvers/bidirectionalBfs";
import { deadEndFillingSolver } from "@/core/plugins/solvers/deadEndFilling";
import { dijkstraSolver } from "@/core/plugins/solvers/dijkstra";
import { dfsSolver } from "@/core/plugins/solvers/dfs";
import { greedyBestFirstSolver } from "@/core/plugins/solvers/greedyBestFirst";

export const solverPlugins = [
  bfsSolver,
  dfsSolver,
  aStarSolver,
  dijkstraSolver,
  greedyBestFirstSolver,
  bidirectionalBfsSolver,
  deadEndFillingSolver,
] as const;

export type SolverPluginId = (typeof solverPlugins)[number]["id"];
