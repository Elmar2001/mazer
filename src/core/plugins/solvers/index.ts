import { aStarSolver } from "@/core/plugins/solvers/astar";
import { aStarEuclideanSolver } from "@/core/plugins/solvers/aStarEuclidean";
import { bfsSolver } from "@/core/plugins/solvers/bfs";
import { bidirectionalBfsSolver } from "@/core/plugins/solvers/bidirectionalBfs";
import { deadEndFillingSolver } from "@/core/plugins/solvers/deadEndFilling";
import { dijkstraSolver } from "@/core/plugins/solvers/dijkstra";
import { dfsSolver } from "@/core/plugins/solvers/dfs";
import { greedyBestFirstSolver } from "@/core/plugins/solvers/greedyBestFirst";
import { leftWallFollowerSolver } from "@/core/plugins/solvers/leftWallFollower";
import { wallFollowerSolver } from "@/core/plugins/solvers/wallFollower";
import { weightedAStarSolver } from "@/core/plugins/solvers/weightedAstar";

export const solverPlugins = [
  bfsSolver,
  dfsSolver,
  aStarSolver,
  aStarEuclideanSolver,
  dijkstraSolver,
  greedyBestFirstSolver,
  bidirectionalBfsSolver,
  deadEndFillingSolver,
  weightedAStarSolver,
  wallFollowerSolver,
  leftWallFollowerSolver,
] as const;

export type SolverPluginId = (typeof solverPlugins)[number]["id"];
