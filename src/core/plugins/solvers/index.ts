import { aStarSolver } from "@/core/plugins/solvers/astar";
import { aStarEuclideanSolver } from "@/core/plugins/solvers/aStarEuclidean";
import { bfsSolver } from "@/core/plugins/solvers/bfs";
import { blindAlleyFillerSolver } from "@/core/plugins/solvers/blindAlleyFiller";
import { blindAlleySealerSolver } from "@/core/plugins/solvers/blindAlleySealer";
import { bidirectionalBfsSolver } from "@/core/plugins/solvers/bidirectionalBfs";
import { chainSolver } from "@/core/plugins/solvers/chain";
import { collisionSolver } from "@/core/plugins/solvers/collisionSolver";
import { culDeSacFillerSolver } from "@/core/plugins/solvers/culDeSacFiller";
import { deadEndFillingSolver } from "@/core/plugins/solvers/deadEndFilling";
import { dijkstraSolver } from "@/core/plugins/solvers/dijkstra";
import { dfsSolver } from "@/core/plugins/solvers/dfs";
import { floodFillSolver } from "@/core/plugins/solvers/floodFill";
import { greedyBestFirstSolver } from "@/core/plugins/solvers/greedyBestFirst";
import { leftWallFollowerSolver } from "@/core/plugins/solvers/leftWallFollower";
import { leeWavefrontSolver } from "@/core/plugins/solvers/leeWavefront";
import { pledgeSolver } from "@/core/plugins/solvers/pledge";
import { randomMouseSolver } from "@/core/plugins/solvers/randomMouse";
import { shortestPathFinderSolver } from "@/core/plugins/solvers/shortestPathFinder";
import { shortestPathsFinderSolver } from "@/core/plugins/solvers/shortestPathsFinder";
import { tremauxSolver } from "@/core/plugins/solvers/tremaux";
import { wallFollowerSolver } from "@/core/plugins/solvers/wallFollower";
import { weightedAStarSolver } from "@/core/plugins/solvers/weightedAstar";

export const solverPlugins = [
  randomMouseSolver,
  bfsSolver,
  dfsSolver,
  aStarSolver,
  aStarEuclideanSolver,
  dijkstraSolver,
  greedyBestFirstSolver,
  bidirectionalBfsSolver,
  deadEndFillingSolver,
  culDeSacFillerSolver,
  blindAlleySealerSolver,
  blindAlleyFillerSolver,
  weightedAStarSolver,
  floodFillSolver,
  leeWavefrontSolver,
  shortestPathFinderSolver,
  shortestPathsFinderSolver,
  collisionSolver,
  wallFollowerSolver,
  leftWallFollowerSolver,
  pledgeSolver,
  tremauxSolver,
  chainSolver,
] as const;

export type SolverPluginId = (typeof solverPlugins)[number]["id"];
