import { aStarSolver } from "@/core/plugins/solvers/astar";
import { aStarEuclideanSolver } from "@/core/plugins/solvers/aStarEuclidean";
import { bfsSolver } from "@/core/plugins/solvers/bfs";
import { bellmanFordSolver } from "@/core/plugins/solvers/bellmanFord";
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
import { geneticSolver } from "@/core/plugins/solvers/genetic";
import { greedyBestFirstSolver } from "@/core/plugins/solvers/greedyBestFirst";
import { leftWallFollowerSolver } from "@/core/plugins/solvers/leftWallFollower";
import { leeWavefrontSolver } from "@/core/plugins/solvers/leeWavefront";
import { iterativeDeepeningDfsSolver } from "@/core/plugins/solvers/iterativeDeepeningDfs";
import { pledgeSolver } from "@/core/plugins/solvers/pledge";
import { randomMouseSolver } from "@/core/plugins/solvers/randomMouse";
import { rrtStarSolver } from "@/core/plugins/solvers/rrtStar";
import { shortestPathFinderSolver } from "@/core/plugins/solvers/shortestPathFinder";
import { shortestPathsFinderSolver } from "@/core/plugins/solvers/shortestPathsFinder";
import { tremauxSolver } from "@/core/plugins/solvers/tremaux";
import { wallFollowerSolver } from "@/core/plugins/solvers/wallFollower";
import { weightedAStarSolver } from "@/core/plugins/solvers/weightedAstar";
import { qLearningSolver } from "@/core/plugins/solvers/qlearning";
import { antColonySolver } from "@/core/plugins/solvers/antColony";

export const solverPlugins = [
  randomMouseSolver,
  bfsSolver,
  dfsSolver,
  aStarSolver,
  aStarEuclideanSolver,
  bellmanFordSolver,
  iterativeDeepeningDfsSolver,
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
  geneticSolver,
  rrtStarSolver,
  shortestPathFinderSolver,
  shortestPathsFinderSolver,
  collisionSolver,
  wallFollowerSolver,
  leftWallFollowerSolver,
  pledgeSolver,
  tremauxSolver,
  chainSolver,
  qLearningSolver,
  antColonySolver,
] as const;

export type SolverPluginId = (typeof solverPlugins)[number]["id"];
