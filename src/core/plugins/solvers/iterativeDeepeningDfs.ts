import { OverlayFlag, type Grid } from "@/core/grid";
import type { CellPatch } from "@/core/patches";
import type { SolverPlugin } from "@/core/plugins/SolverPlugin";
import type { AlgorithmStepMeta, SolverRunOptions } from "@/core/plugins/types";
import { getOpenNeighbors } from "@/core/plugins/solvers/helpers";

interface IddfsContext {
  grid: Grid;
  startIndex: number;
  goalIndex: number;
  started: boolean;
  finalized: boolean;
  solved: boolean;
  pathLength: number;
  depthLimit: number;
  maxDepth: number;
  globalSeen: Uint8Array;
  visitedCount: number;
  frontierNodes: number[];
  currentIndex: number;
}

interface DepthLimitedResult {
  found: boolean;
  path: number[];
  discovered: number[];
  frontier: number[];
  lastExplored: number;
}

export const iterativeDeepeningDfsSolver: SolverPlugin<
  SolverRunOptions,
  AlgorithmStepMeta
> = {
  id: "iterative-deepening-dfs",
  label: "Iterative Deepening DFS (IDDFS)",
  create({ grid, options }) {
    const context: IddfsContext = {
      grid,
      startIndex: options.startIndex,
      goalIndex: options.goalIndex,
      started: false,
      finalized: false,
      solved: false,
      pathLength: 0,
      depthLimit: 0,
      maxDepth: grid.cellCount,
      globalSeen: new Uint8Array(grid.cellCount),
      visitedCount: 0,
      frontierNodes: [],
      currentIndex: -1,
    };

    return {
      step: () => stepIterativeDeepeningDfs(context),
    };
  },
};

function stepIterativeDeepeningDfs(context: IddfsContext) {
  const patches: CellPatch[] = [];

  clearTransientMarkers(context, patches);

  if (!context.started) {
    context.started = true;
    context.globalSeen[context.startIndex] = 1;
    context.visitedCount = 1;
    context.frontierNodes = [context.startIndex];
    context.currentIndex = context.startIndex;

    patches.push({
      index: context.startIndex,
      overlaySet: OverlayFlag.Visited | OverlayFlag.Frontier | OverlayFlag.Current,
    });

    if (context.startIndex === context.goalIndex) {
      patches.push({
        index: context.startIndex,
        overlaySet: OverlayFlag.Path,
        overlayClear: OverlayFlag.Frontier | OverlayFlag.Current,
      });
      context.frontierNodes = [];
      context.currentIndex = -1;
      context.finalized = true;
      context.solved = true;
      context.pathLength = 1;

      return {
        done: true,
        patches,
        meta: {
          line: 1,
          solved: true,
          pathLength: 1,
          visitedCount: context.visitedCount,
          frontierSize: 0,
        },
      };
    }

    return {
      done: false,
      patches,
      meta: {
        line: 1,
        visitedCount: context.visitedCount,
        frontierSize: context.frontierNodes.length,
      },
    };
  }

  if (context.finalized) {
    return {
      done: true,
      patches,
      meta: {
        line: 5,
        solved: context.solved,
        pathLength: context.pathLength,
        visitedCount: context.visitedCount,
        frontierSize: 0,
      },
    };
  }

  const result = depthLimitedSearch(
    context.grid,
    context.startIndex,
    context.goalIndex,
    context.depthLimit,
  );

  for (const index of result.discovered) {
    if (context.globalSeen[index] === 1) {
      continue;
    }

    context.globalSeen[index] = 1;
    context.visitedCount += 1;
    patches.push({
      index,
      overlaySet: OverlayFlag.Visited,
    });
  }

  if (result.found) {
    for (const index of result.path) {
      patches.push({
        index,
        overlaySet: OverlayFlag.Path,
      });
    }

    context.finalized = true;
    context.solved = true;
    context.pathLength = result.path.length;

    return {
      done: true,
      patches,
      meta: {
        line: 3,
        solved: true,
        pathLength: result.path.length,
        visitedCount: context.visitedCount,
        frontierSize: 0,
      },
    };
  }

  context.depthLimit += 1;
  if (context.depthLimit > context.maxDepth) {
    context.finalized = true;
    context.solved = false;
    context.pathLength = 0;
    return {
      done: true,
      patches,
      meta: {
        line: 5,
        solved: false,
        visitedCount: context.visitedCount,
        frontierSize: 0,
      },
    };
  }

  context.frontierNodes = result.frontier;
  for (const index of context.frontierNodes) {
    patches.push({
      index,
      overlaySet: OverlayFlag.Frontier,
    });
  }

  context.currentIndex = result.lastExplored;
  patches.push({
    index: context.currentIndex,
    overlaySet: OverlayFlag.Current,
  });

  return {
    done: false,
    patches,
    meta: {
      line: 4,
      visitedCount: context.visitedCount,
      frontierSize: context.frontierNodes.length,
    },
  };
}

function clearTransientMarkers(
  context: IddfsContext,
  patches: CellPatch[],
): void {
  const markers = new Set<number>();

  if (context.currentIndex !== -1) {
    markers.add(context.currentIndex);
  }

  for (const index of context.frontierNodes) {
    markers.add(index);
  }

  for (const index of markers) {
    patches.push({
      index,
      overlayClear: OverlayFlag.Current | OverlayFlag.Frontier,
    });
  }

  context.currentIndex = -1;
  context.frontierNodes = [];
}

function depthLimitedSearch(
  grid: Grid,
  start: number,
  goal: number,
  depthLimit: number,
): DepthLimitedResult {
  const path = [start];
  const inPath = new Uint8Array(grid.cellCount);
  const discoveredFlags = new Uint8Array(grid.cellCount);
  const frontierFlags = new Uint8Array(grid.cellCount);
  const discovered: number[] = [];
  const frontier: number[] = [];
  let lastExplored = start;

  // Track the shallowest depth at which each node was visited.
  // Nodes already visited at depth <= current are skipped to avoid
  // exponential path explosion in loopy mazes.
  const bestDepth = new Uint16Array(grid.cellCount);
  bestDepth.fill(0xFFFF);

  const dfs = (node: number, depth: number): boolean => {
    inPath[node] = 1;
    bestDepth[node] = depth;
    lastExplored = node;

    if (discoveredFlags[node] === 0) {
      discoveredFlags[node] = 1;
      discovered.push(node);
    }

    if (node === goal) {
      return true;
    }

    if (depth >= depthLimit) {
      if (frontierFlags[node] === 0) {
        frontierFlags[node] = 1;
        frontier.push(node);
      }

      inPath[node] = 0;
      return false;
    }

    for (const neighbor of getOpenNeighbors(grid, node)) {
      if (inPath[neighbor] === 1) {
        continue;
      }

      if (bestDepth[neighbor] <= depth + 1) {
        continue;
      }

      path.push(neighbor);
      if (dfs(neighbor, depth + 1)) {
        return true;
      }
      path.pop();
    }

    inPath[node] = 0;
    return false;
  };

  const found = dfs(start, 0);

  return {
    found,
    path: found ? [...path] : [],
    discovered,
    frontier,
    lastExplored,
  };
}
