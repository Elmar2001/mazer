import { OverlayFlag, type Grid } from "@/core/grid";
import type { CellPatch } from "@/core/patches";
import type { SolverPlugin } from "@/core/plugins/SolverPlugin";
import type { AlgorithmStepMeta, SolverRunOptions } from "@/core/plugins/types";
import { buildPath, getOpenNeighbors } from "@/core/plugins/solvers/helpers";

type CulDeSacPhase = "prune" | "search" | "trace";

interface CulDeSacContext {
  grid: Grid;
  startIndex: number;
  goalIndex: number;
  started: boolean;
  phase: CulDeSacPhase;
  degree: Uint8Array;
  removed: Uint8Array;
  inPruneQueue: Uint8Array;
  pruneQueue: number[];
  pruneHead: number;
  searchQueue: number[];
  searchHead: number;
  discovered: Uint8Array;
  frontier: Uint8Array;
  visited: Uint8Array;
  parents: Int32Array;
  path: number[];
  pathCursor: number;
  current: number;
  visitedCount: number;
  frontierSize: number;
}

export const culDeSacFillerSolver: SolverPlugin<
  SolverRunOptions,
  AlgorithmStepMeta
> = {
  id: "cul-de-sac-filler",
  label: "Cul-de-sac Filler",
  implementationKind: "native",
  create({ grid, options }) {
    const parents = new Int32Array(grid.cellCount);
    parents.fill(-1);

    const context: CulDeSacContext = {
      grid,
      startIndex: options.startIndex,
      goalIndex: options.goalIndex,
      started: false,
      phase: "prune",
      degree: new Uint8Array(grid.cellCount),
      removed: new Uint8Array(grid.cellCount),
      inPruneQueue: new Uint8Array(grid.cellCount),
      pruneQueue: [],
      pruneHead: 0,
      searchQueue: [],
      searchHead: 0,
      discovered: new Uint8Array(grid.cellCount),
      frontier: new Uint8Array(grid.cellCount),
      visited: new Uint8Array(grid.cellCount),
      parents,
      path: [],
      pathCursor: 0,
      current: -1,
      visitedCount: 0,
      frontierSize: 0,
    };

    return {
      step: () => stepCulDeSac(context),
    };
  },
};

function stepCulDeSac(context: CulDeSacContext) {
  const patches: CellPatch[] = [];

  if (!context.started) {
    context.started = true;

    if (context.startIndex === context.goalIndex) {
      markVisited(context, context.startIndex, patches);
      patches.push({
        index: context.startIndex,
        overlaySet: OverlayFlag.Path,
      });

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

    initializePrunePhase(context, patches);

    return {
      done: false,
      patches,
      meta: {
        line: 1,
        visitedCount: context.visitedCount,
        frontierSize: context.frontierSize,
      },
    };
  }

  if (context.current !== -1) {
    patches.push({
      index: context.current,
      overlayClear: OverlayFlag.Current,
    });
    context.current = -1;
  }

  if (context.phase === "prune") {
    if (context.pruneHead < context.pruneQueue.length) {
      return processPruneStep(context, patches);
    }

    beginSearchPhase(context, patches);

    return {
      done: false,
      patches,
      meta: {
        line: 3,
        visitedCount: context.visitedCount,
        frontierSize: context.frontierSize,
      },
    };
  }

  if (context.phase === "search") {
    return processSearchStep(context, patches);
  }

  return processTraceStep(context, patches);
}

function initializePrunePhase(
  context: CulDeSacContext,
  patches: CellPatch[],
): void {
  for (let i = 0; i < context.grid.cellCount; i += 1) {
    context.degree[i] = getOpenNeighbors(context.grid, i).length;
  }

  for (let i = 0; i < context.grid.cellCount; i += 1) {
    if (i === context.startIndex || i === context.goalIndex) {
      continue;
    }

    if ((context.degree[i] as number) <= 1) {
      context.inPruneQueue[i] = 1;
      context.pruneQueue.push(i);
      context.frontierSize += 1;
      patches.push({
        index: i,
        overlaySet: OverlayFlag.Frontier,
      });
    }
  }
}

function processPruneStep(context: CulDeSacContext, patches: CellPatch[]) {
  const cell = context.pruneQueue[context.pruneHead] as number;
  context.pruneHead += 1;

  if (context.inPruneQueue[cell] === 1) {
    context.inPruneQueue[cell] = 0;
    context.frontierSize = Math.max(0, context.frontierSize - 1);
    patches.push({
      index: cell,
      overlayClear: OverlayFlag.Frontier,
    });
  }

  if (context.removed[cell] === 1) {
    return {
      done: false,
      patches,
      meta: {
        line: 2,
        visitedCount: context.visitedCount,
        frontierSize: context.frontierSize,
      },
    };
  }

  context.removed[cell] = 1;
  context.current = cell;
  markVisited(context, cell, patches);
  patches.push({
    index: cell,
    overlaySet: OverlayFlag.Current,
    overlayClear: OverlayFlag.Path,
  });

  for (const neighbor of getOpenNeighbors(context.grid, cell)) {
    if (context.removed[neighbor] === 1) {
      continue;
    }

    const nextDegree = Math.max(0, (context.degree[neighbor] as number) - 1);
    context.degree[neighbor] = nextDegree;

    if (neighbor === context.startIndex || neighbor === context.goalIndex) {
      continue;
    }

    if (nextDegree <= 1 && context.inPruneQueue[neighbor] === 0) {
      context.inPruneQueue[neighbor] = 1;
      context.pruneQueue.push(neighbor);
      context.frontierSize += 1;
      patches.push({
        index: neighbor,
        overlaySet: OverlayFlag.Frontier,
      });
    }
  }

  return {
    done: false,
    patches,
    meta: {
      line: 2,
      visitedCount: context.visitedCount,
      frontierSize: context.frontierSize,
    },
  };
}

function beginSearchPhase(context: CulDeSacContext, patches: CellPatch[]): void {
  context.phase = "search";
  clearPruneFrontier(context, patches);

  context.searchQueue = [context.startIndex];
  context.searchHead = 0;
  context.discovered[context.startIndex] = 1;
  context.parents[context.startIndex] = context.startIndex;
  context.frontier[context.startIndex] = 1;
  context.frontierSize = 1;

  patches.push({
    index: context.startIndex,
    overlaySet: OverlayFlag.Frontier,
  });
}

function processSearchStep(context: CulDeSacContext, patches: CellPatch[]) {
  if (context.searchHead >= context.searchQueue.length) {
    return {
      done: true,
      patches,
      meta: {
        line: 6,
        solved: false,
        visitedCount: context.visitedCount,
        frontierSize: 0,
      },
    };
  }

  const node = context.searchQueue[context.searchHead] as number;
  context.searchHead += 1;
  context.current = node;

  if (context.frontier[node] === 1) {
    context.frontier[node] = 0;
    context.frontierSize = Math.max(0, context.frontierSize - 1);
    patches.push({
      index: node,
      overlayClear: OverlayFlag.Frontier,
    });
  }

  markVisited(context, node, patches);
  patches.push({
    index: node,
    overlaySet: OverlayFlag.Current,
  });

  if (node === context.goalIndex) {
    context.path = buildPath(context.startIndex, context.goalIndex, context.parents);
    context.pathCursor = 0;
    context.phase = "trace";
    clearSearchFrontier(context, patches);

    return {
      done: false,
      patches,
      meta: {
        line: 4,
        visitedCount: context.visitedCount,
        frontierSize: context.path.length,
      },
    };
  }

  for (const neighbor of getOpenNeighbors(context.grid, node)) {
    if (context.removed[neighbor] === 1 || context.discovered[neighbor] === 1) {
      continue;
    }

    context.discovered[neighbor] = 1;
    context.parents[neighbor] = node;
    context.searchQueue.push(neighbor);

    if (context.frontier[neighbor] === 0) {
      context.frontier[neighbor] = 1;
      context.frontierSize += 1;
      patches.push({
        index: neighbor,
        overlaySet: OverlayFlag.Frontier,
      });
    }
  }

  return {
    done: false,
    patches,
    meta: {
      line: 5,
      visitedCount: context.visitedCount,
      frontierSize: context.frontierSize,
    },
  };
}

function processTraceStep(context: CulDeSacContext, patches: CellPatch[]) {
  if (context.pathCursor >= context.path.length) {
    return {
      done: true,
      patches,
      meta: {
        line: 7,
        solved: context.path.length > 0,
        pathLength: context.path.length,
        visitedCount: context.visitedCount,
        frontierSize: 0,
      },
    };
  }

  const index = context.path[context.pathCursor] as number;
  context.pathCursor += 1;
  context.current = index;

  markVisited(context, index, patches);
  patches.push({
    index,
    overlaySet: OverlayFlag.Path | OverlayFlag.Current,
    overlayClear: OverlayFlag.Frontier,
  });

  const done = context.pathCursor >= context.path.length;
  if (done) {
    patches.push({
      index,
      overlayClear: OverlayFlag.Current,
    });
    context.current = -1;
  }

  return {
    done,
    patches,
    meta: {
      line: 7,
      solved: done,
      pathLength: context.path.length,
      visitedCount: context.visitedCount,
      frontierSize: context.path.length - context.pathCursor,
    },
  };
}

function clearPruneFrontier(context: CulDeSacContext, patches: CellPatch[]): void {
  for (let i = 0; i < context.inPruneQueue.length; i += 1) {
    if (context.inPruneQueue[i] === 0) {
      continue;
    }

    context.inPruneQueue[i] = 0;
    patches.push({
      index: i,
      overlayClear: OverlayFlag.Frontier,
    });
  }

  context.frontierSize = 0;
}

function clearSearchFrontier(context: CulDeSacContext, patches: CellPatch[]): void {
  for (let i = 0; i < context.frontier.length; i += 1) {
    if (context.frontier[i] === 0) {
      continue;
    }

    context.frontier[i] = 0;
    patches.push({
      index: i,
      overlayClear: OverlayFlag.Frontier,
    });
  }

  context.frontierSize = 0;
}

function markVisited(context: CulDeSacContext, index: number, patches: CellPatch[]): void {
  if (context.visited[index] === 1) {
    return;
  }

  context.visited[index] = 1;
  context.visitedCount += 1;
  patches.push({
    index,
    overlaySet: OverlayFlag.Visited,
  });
}
