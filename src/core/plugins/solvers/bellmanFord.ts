import { OverlayFlag, type Grid } from "@/core/grid";
import type { CellPatch } from "@/core/patches";
import type { SolverPlugin } from "@/core/plugins/SolverPlugin";
import type { AlgorithmStepMeta, SolverRunOptions } from "@/core/plugins/types";
import { buildPath, getOpenNeighbors } from "@/core/plugins/solvers/helpers";

interface BellmanFordContext {
  grid: Grid;
  startIndex: number;
  goalIndex: number;
  started: boolean;
  finalized: boolean;
  dist: Float64Array;
  previousDist: Float64Array; // For synchronous generation updates
  parents: Int32Array;
  discovered: Uint8Array;
  inFrontier: Uint8Array;
  visitedCount: number;
  iteration: number;
  maxIterations: number;

  activeNodes: number[];
  nextActiveNodes: number[];
  currentIndex: number;
  changedInPass: boolean;
}

export const bellmanFordSolver: SolverPlugin<SolverRunOptions, AlgorithmStepMeta> = {
  id: "bellman-ford",
  label: "Bellman-Ford",
  create({ grid, options }) {
    const parents = new Int32Array(grid.cellCount);
    parents.fill(-1);

    const dist = new Float64Array(grid.cellCount);
    dist.fill(Number.POSITIVE_INFINITY);

    const previousDist = new Float64Array(grid.cellCount);
    previousDist.fill(Number.POSITIVE_INFINITY);

    const context: BellmanFordContext = {
      grid,
      startIndex: options.startIndex,
      goalIndex: options.goalIndex,
      started: false,
      finalized: false,
      dist,
      previousDist,
      parents,
      discovered: new Uint8Array(grid.cellCount),
      inFrontier: new Uint8Array(grid.cellCount),
      visitedCount: 0,
      iteration: 0,
      maxIterations: Math.max(1, grid.cellCount - 1),
      activeNodes: [],
      nextActiveNodes: [],
      currentIndex: -1,
      changedInPass: false,
    };

    return {
      step: () => stepBellmanFord(context),
    };
  },
};

function stepBellmanFord(context: BellmanFordContext) {
  const patches: CellPatch[] = [];

  if (!context.started) {
    context.started = true;
    context.dist[context.startIndex] = 0;
    context.previousDist[context.startIndex] = 0;
    context.parents[context.startIndex] = context.startIndex;
    context.discovered[context.startIndex] = 1;
    context.visitedCount = 1;

    // Pass 1 will process the start node
    context.activeNodes = [context.startIndex];
    context.nextActiveNodes = [];
    context.changedInPass = false;

    patches.push({
      index: context.startIndex,
      overlaySet: OverlayFlag.Visited | OverlayFlag.Frontier,
    });
    context.inFrontier[context.startIndex] = 1;

    return {
      done: false,
      patches,
      meta: {
        line: 1,
        visitedCount: context.visitedCount,
        frontierSize: context.activeNodes.length,
      },
    };
  }

  if (context.finalized) {
    return {
      done: true,
      patches: [],
      meta: {
        line: 5,
        solved: context.parents[context.goalIndex] !== -1,
        pathLength:
          context.parents[context.goalIndex] !== -1
            ? buildPath(context.startIndex, context.goalIndex, context.parents).length
            : 0,
        visitedCount: context.visitedCount,
        frontierSize: 0,
      },
    };
  }

  // Clear previous Current overlay
  if (context.currentIndex !== -1) {
    patches.push({
      index: context.currentIndex,
      overlayClear: OverlayFlag.Current,
    });
    context.currentIndex = -1;
  }

  // If the active layer is empty, we advance to the next iteration
  if (context.activeNodes.length === 0) {
    context.iteration += 1;

    if (!context.changedInPass || context.iteration >= context.maxIterations) {
      return finalizeBellmanFord(context, patches, context.changedInPass ? 5 : 4);
    }

    // Swap next generation into active
    context.activeNodes = context.nextActiveNodes;
    context.nextActiveNodes = [];
    context.previousDist.set(context.dist);
    context.changedInPass = false;

    // We can yield an empty patch so the visualizer "breathes" on generation boundary
    return {
      done: false,
      patches,
      meta: {
        line: 3,
        visitedCount: context.visitedCount,
        frontierSize: context.activeNodes.length,
      },
    };
  }

  // Pop one node from the active set
  const from = context.activeNodes.shift() as number;
  context.currentIndex = from;

  if (context.inFrontier[from] === 1) {
    context.inFrontier[from] = 0;
    patches.push({
      index: from,
      overlayClear: OverlayFlag.Frontier,
    });
  }

  patches.push({
    index: from,
    overlaySet: OverlayFlag.Current | OverlayFlag.Visited,
  });

  const baseDist = context.previousDist[from] as number;

  if (Number.isFinite(baseDist)) {
    for (const to of getOpenNeighbors(context.grid, from)) {
      const nextDist = baseDist + 1;

      if (nextDist < context.dist[to]) {
        context.dist[to] = nextDist;
        context.parents[to] = from;
        context.changedInPass = true;

        if (context.discovered[to] === 0) {
          context.discovered[to] = 1;
          context.visitedCount += 1;
          patches.push({
            index: to,
            overlaySet: OverlayFlag.Visited,
          });
        }

        if (context.inFrontier[to] === 0) {
          context.inFrontier[to] = 1;
          context.nextActiveNodes.push(to);
          patches.push({
            index: to,
            overlaySet: OverlayFlag.Frontier,
          });
        }
      }
    }
  }

  return {
    done: false,
    patches,
    meta: {
      line: 3,
      visitedCount: context.visitedCount,
      frontierSize: context.activeNodes.length + context.nextActiveNodes.length,
    },
  };
}

function finalizeBellmanFord(
  context: BellmanFordContext,
  patches: CellPatch[],
  line: number,
) {
  context.finalized = true;

  // Clear all frontier markers
  for (let i = 0; i < context.grid.cellCount; i += 1) {
    if (context.inFrontier[i] === 1) {
      patches.push({
        index: i,
        overlayClear: OverlayFlag.Frontier,
      });
    }
  }

  if (context.currentIndex !== -1) {
    patches.push({
      index: context.currentIndex,
      overlayClear: OverlayFlag.Current,
    });
    context.currentIndex = -1;
  }

  const path = buildPath(context.startIndex, context.goalIndex, context.parents);
  for (const index of path) {
    patches.push({
      index,
      overlaySet: OverlayFlag.Path,
    });
  }

  return {
    done: true,
    patches,
    meta: {
      line,
      solved: path.length > 0,
      pathLength: path.length,
      visitedCount: context.visitedCount,
      frontierSize: 0,
    },
  };
}
