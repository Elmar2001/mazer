import type { SolverPlugin } from "@/core/plugins/SolverPlugin";
import type { StepMeta } from "@/core/patches";
import {
  type MazeTopology,
  type PluginTier,
  type SolverCompatibility,
  type SolverGuarantee,
} from "@/core/plugins/pluginMetadata";

import { aStarSolver } from "@/core/plugins/solvers/astar";
import { aStarEuclideanSolver } from "@/core/plugins/solvers/aStarEuclidean";
import { antColonySolver } from "@/core/plugins/solvers/antColony";
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
import { iterativeDeepeningDfsSolver } from "@/core/plugins/solvers/iterativeDeepeningDfs";
import { leftWallFollowerSolver } from "@/core/plugins/solvers/leftWallFollower";
import { leeWavefrontSolver } from "@/core/plugins/solvers/leeWavefront";
import { pledgeSolver } from "@/core/plugins/solvers/pledge";
import { qLearningSolver } from "@/core/plugins/solvers/qlearning";
import { randomMouseSolver } from "@/core/plugins/solvers/randomMouse";
import { rrtStarSolver } from "@/core/plugins/solvers/rrtStar";
import { shortestPathFinderSolver } from "@/core/plugins/solvers/shortestPathFinder";
import { shortestPathsFinderSolver } from "@/core/plugins/solvers/shortestPathsFinder";
import { tremauxSolver } from "@/core/plugins/solvers/tremaux";
import { wallFollowerSolver } from "@/core/plugins/solvers/wallFollower";
import { weightedAStarSolver } from "@/core/plugins/solvers/weightedAstar";
import { physarumSolver } from "@/core/plugins/solvers/physarum";
import { electricCircuitSolver } from "@/core/plugins/solvers/electricCircuit";
import { idaStarSolver } from "@/core/plugins/solvers/idaStar";
import { potentialFieldSolver } from "@/core/plugins/solvers/potentialField";
import { frontierExplorerSolver } from "@/core/plugins/solvers/frontierExplorer";
import { fringeSearchSolver } from "@/core/plugins/solvers/fringeSearch";

const ADVANCED_SOLVERS = new Set<string>([
  "weighted-astar",
  "greedy-best-first",
  "iterative-deepening-dfs",
  "q-learning",
  "ant-colony",
  "genetic",
  "rrt-star",
  "physarum",
  "electric-circuit",
  "potential-field",
]);

const NO_LOOPY_SUPPORT = new Set<string>([
  "wall-follower",
  "left-wall-follower",
  "random-mouse",
  "pledge",
]);

const NO_WEAVE_SUPPORT = new Set<string>([
  "wall-follower",
  "left-wall-follower",
  "pledge",
]);

const GUARANTEED_SOLVERS = new Set<string>([
  "bfs",
  "dfs",
  "astar",
  "astar-euclidean",
  "dijkstra",
  "bellman-ford",
  "bidirectional-bfs",
  "dead-end-filling",
  "cul-de-sac-filler",
  "lee-wavefront",
  "flood-fill",
  "shortest-path-finder",
  "shortest-paths-finder",
  "tremaux",
  "chain",
  "collision-solver",
  "blind-alley-sealer",
  "blind-alley-filler",
  "ida-star",
  "frontier-explorer",
  "fringe-search",
]);

type AnySolverPlugin = SolverPlugin<Record<string, unknown>, StepMeta>;

function getSolverTier(plugin: AnySolverPlugin): PluginTier {
  if (plugin.implementationKind === "alias") {
    return "alias";
  }

  if (ADVANCED_SOLVERS.has(plugin.id)) {
    return "advanced";
  }

  return "research-core";
}

function getSolverGuarantee(pluginId: string): SolverGuarantee {
  if (GUARANTEED_SOLVERS.has(pluginId)) {
    return "guaranteed";
  }

  if (pluginId === "random-mouse") {
    return "incomplete";
  }

  return "heuristic";
}

function getSolverCompatibility(plugin: AnySolverPlugin): SolverCompatibility {
  const topologies: MazeTopology[] = ["perfect-planar"];

  if (!NO_LOOPY_SUPPORT.has(plugin.id)) {
    topologies.push("loopy-planar");
  }

  if (!NO_WEAVE_SUPPORT.has(plugin.id)) {
    topologies.push("weave");
  }

  return {
    topologies,
    guarantee: getSolverGuarantee(plugin.id),
  };
}

function withSolverMetadata<T extends AnySolverPlugin>(plugin: T): T {
  return {
    ...plugin,
    tier: getSolverTier(plugin),
    solverCompatibility: getSolverCompatibility(plugin),
  } as T;
}

export const solverPlugins = [
  withSolverMetadata(randomMouseSolver),
  withSolverMetadata(bfsSolver),
  withSolverMetadata(dfsSolver),
  withSolverMetadata(aStarSolver),
  withSolverMetadata(aStarEuclideanSolver),
  withSolverMetadata(bellmanFordSolver),
  withSolverMetadata(iterativeDeepeningDfsSolver),
  withSolverMetadata(dijkstraSolver),
  withSolverMetadata(greedyBestFirstSolver),
  withSolverMetadata(bidirectionalBfsSolver),
  withSolverMetadata(deadEndFillingSolver),
  withSolverMetadata(culDeSacFillerSolver),
  withSolverMetadata(blindAlleySealerSolver),
  withSolverMetadata(blindAlleyFillerSolver),
  withSolverMetadata(weightedAStarSolver),
  withSolverMetadata(floodFillSolver),
  withSolverMetadata(leeWavefrontSolver),
  withSolverMetadata(geneticSolver),
  withSolverMetadata(rrtStarSolver),
  withSolverMetadata(shortestPathFinderSolver),
  withSolverMetadata(shortestPathsFinderSolver),
  withSolverMetadata(collisionSolver),
  withSolverMetadata(wallFollowerSolver),
  withSolverMetadata(leftWallFollowerSolver),
  withSolverMetadata(pledgeSolver),
  withSolverMetadata(tremauxSolver),
  withSolverMetadata(chainSolver),
  withSolverMetadata(qLearningSolver),
  withSolverMetadata(antColonySolver),
  withSolverMetadata(physarumSolver),
  withSolverMetadata(electricCircuitSolver),
  withSolverMetadata(idaStarSolver),
  withSolverMetadata(potentialFieldSolver),
  withSolverMetadata(frontierExplorerSolver),
  withSolverMetadata(fringeSearchSolver),
] as const;

export type SolverPluginId = (typeof solverPlugins)[number]["id"];
