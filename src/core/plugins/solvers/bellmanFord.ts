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
  parents: Int32Array;
  discovered: Uint8Array;
  visitedCount: number;
  iteration: number;
  maxIterations: number;
  frontierNodes: number[];
  currentIndex: number;
}

export const bellmanFordSolver: SolverPlugin<SolverRunOptions, AlgorithmStepMeta> = {
  id: "bellman-ford",
  label: "Bellman-Ford",
  create({ grid, options }) {
    const parents = new Int32Array(grid.cellCount);
    parents.fill(-1);

    const dist = new Float64Array(grid.cellCount);
    dist.fill(Number.POSITIVE_INFINITY);

    const context: BellmanFordContext = {
      grid,
      startIndex: options.startIndex,
      goalIndex: options.goalIndex,
      started: false,
      finalized: false,
      dist,
      parents,
      discovered: new Uint8Array(grid.cellCount),
      visitedCount: 0,
      iteration: 0,
      maxIterations: Math.max(1, grid.cellCount - 1),
      frontierNodes: [],
      currentIndex: -1,
    };

    return {
      step: () => stepBellmanFord(context),
    };
  },
};

function stepBellmanFord(context: BellmanFordContext) {
  const patches: CellPatch[] = [];

  clearTransientMarkers(context, patches);

  if (!context.started) {
    context.started = true;
    context.dist[context.startIndex] = 0;
    context.parents[context.startIndex] = context.startIndex;
    context.discovered[context.startIndex] = 1;
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
        solved: context.parents[context.goalIndex] !== -1,
        pathLength:
          context.parents[context.goalIndex] !== -1
            ? buildPath(
                context.startIndex,
                context.goalIndex,
                context.parents,
              ).length
            : 0,
        visitedCount: context.visitedCount,
        frontierSize: 0,
      },
    };
  }

  const relaxed = relaxPass(context);
  context.iteration += 1;

  for (const index of relaxed.improvedNodes) {
    if (context.discovered[index] === 0) {
      context.discovered[index] = 1;
      context.visitedCount += 1;
      patches.push({
        index,
        overlaySet: OverlayFlag.Visited,
      });
    }
  }

  if (!relaxed.changed || context.iteration >= context.maxIterations) {
    return finalizeBellmanFord(context, patches, relaxed.changed ? 5 : 4);
  }

  context.frontierNodes = relaxed.improvedNodes;
  for (const index of context.frontierNodes) {
    patches.push({
      index,
      overlaySet: OverlayFlag.Frontier,
    });
  }

  context.currentIndex =
    context.frontierNodes[0] ?? context.startIndex;
  patches.push({
    index: context.currentIndex,
    overlaySet: OverlayFlag.Current,
  });

  return {
    done: false,
    patches,
    meta: {
      line: 3,
      visitedCount: context.visitedCount,
      frontierSize: context.frontierNodes.length,
    },
  };
}

function finalizeBellmanFord(
  context: BellmanFordContext,
  patches: CellPatch[],
  line: number,
) {
  context.finalized = true;
  context.frontierNodes = [];
  context.currentIndex = -1;

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

function clearTransientMarkers(
  context: BellmanFordContext,
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

function relaxPass(context: BellmanFordContext): {
  changed: boolean;
  improvedNodes: number[];
} {
  let changed = false;
  const improvedFlag = new Uint8Array(context.grid.cellCount);
  const improvedNodes: number[] = [];
  const previousDist = context.dist.slice();

  for (let from = 0; from < context.grid.cellCount; from += 1) {
    const baseDist = previousDist[from] as number;
    if (!Number.isFinite(baseDist)) {
      continue;
    }

    for (const to of getOpenNeighbors(context.grid, from)) {
      const nextDist = baseDist + 1;
      if (nextDist >= context.dist[to]) {
        continue;
      }

      context.dist[to] = nextDist;
      context.parents[to] = from;
      changed = true;

      if (improvedFlag[to] === 0) {
        improvedFlag[to] = 1;
        improvedNodes.push(to);
      }
    }
  }

  return {
    changed,
    improvedNodes,
  };
}
