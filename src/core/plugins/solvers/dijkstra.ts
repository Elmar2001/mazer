import { OverlayFlag, type Grid } from "@/core/grid";
import type { CellPatch } from "@/core/patches";
import type { SolverPlugin } from "@/core/plugins/SolverPlugin";
import type { AlgorithmStepMeta, SolverRunOptions } from "@/core/plugins/types";
import { buildPath, getOpenNeighbors } from "@/core/plugins/solvers/helpers";

interface DijkstraContext {
  grid: Grid;
  startIndex: number;
  goalIndex: number;
  started: boolean;
  open: number[];
  openFlags: Uint8Array;
  closedFlags: Uint8Array;
  parents: Int32Array;
  dist: Float64Array;
  currentIndex: number;
  visitedCount: number;
  frontierSize: number;
}

export const dijkstraSolver: SolverPlugin<SolverRunOptions, AlgorithmStepMeta> = {
  id: "dijkstra",
  label: "Dijkstra",
  create({ grid, options }) {
    const parents = new Int32Array(grid.cellCount);
    parents.fill(-1);

    const dist = new Float64Array(grid.cellCount);
    dist.fill(Number.POSITIVE_INFINITY);

    const context: DijkstraContext = {
      grid,
      startIndex: options.startIndex,
      goalIndex: options.goalIndex,
      started: false,
      open: [],
      openFlags: new Uint8Array(grid.cellCount),
      closedFlags: new Uint8Array(grid.cellCount),
      parents,
      dist,
      currentIndex: -1,
      visitedCount: 0,
      frontierSize: 0,
    };

    return {
      step: () => stepDijkstra(context),
    };
  },
};

function stepDijkstra(context: DijkstraContext) {
  const patches: CellPatch[] = [];

  if (!context.started) {
    context.started = true;
    context.open.push(context.startIndex);
    context.openFlags[context.startIndex] = 1;
    context.frontierSize = 1;
    context.parents[context.startIndex] = context.startIndex;
    context.dist[context.startIndex] = 0;

    patches.push({
      index: context.startIndex,
      overlaySet: OverlayFlag.Frontier,
    });

    return {
      done: false,
      patches,
      meta: {
        visitedCount: context.visitedCount,
        frontierSize: context.frontierSize,
      },
    };
  }

  if (context.currentIndex !== -1) {
    patches.push({
      index: context.currentIndex,
      overlayClear: OverlayFlag.Current,
    });
    context.currentIndex = -1;
  }

  if (context.open.length === 0) {
    return {
      done: true,
      patches,
      meta: {
        visitedCount: context.visitedCount,
        frontierSize: 0,
        solved: false,
      },
    };
  }

  const openPick = pickMinByDistance(context.open, context.dist);
  const current = context.open[openPick] as number;

  context.open[openPick] = context.open[context.open.length - 1] as number;
  context.open.pop();

  if (context.openFlags[current] === 1) {
    context.openFlags[current] = 0;
    context.frontierSize -= 1;
    patches.push({
      index: current,
      overlayClear: OverlayFlag.Frontier,
    });
  }

  context.currentIndex = current;

  if (context.closedFlags[current] === 0) {
    context.closedFlags[current] = 1;
    context.visitedCount += 1;
    patches.push({
      index: current,
      overlaySet: OverlayFlag.Visited | OverlayFlag.Current,
    });
  }

  if (current === context.goalIndex) {
    const path = buildPath(context.startIndex, context.goalIndex, context.parents);
    for (const index of path) {
      patches.push({ index, overlaySet: OverlayFlag.Path });
    }

    patches.push({
      index: current,
      overlayClear: OverlayFlag.Current,
    });
    context.currentIndex = -1;

    return {
      done: true,
      patches,
      meta: {
        visitedCount: context.visitedCount,
        frontierSize: context.frontierSize,
        solved: true,
        pathLength: path.length,
      },
    };
  }

  const currentDist = context.dist[current] as number;

  for (const neighbor of getOpenNeighbors(context.grid, current)) {
    if (context.closedFlags[neighbor] === 1) {
      continue;
    }

    const tentative = currentDist + 1;
    if (tentative >= context.dist[neighbor]) {
      continue;
    }

    context.parents[neighbor] = current;
    context.dist[neighbor] = tentative;

    if (context.openFlags[neighbor] === 0) {
      context.openFlags[neighbor] = 1;
      context.open.push(neighbor);
      context.frontierSize += 1;
      patches.push({ index: neighbor, overlaySet: OverlayFlag.Frontier });
    }
  }

  return {
    done: false,
    patches,
    meta: {
      visitedCount: context.visitedCount,
      frontierSize: context.frontierSize,
    },
  };
}

function pickMinByDistance(items: number[], dist: Float64Array): number {
  let best = 0;
  let bestDist = dist[items[0] as number] as number;

  for (let i = 1; i < items.length; i += 1) {
    const currentDist = dist[items[i] as number] as number;
    if (currentDist < bestDist) {
      bestDist = currentDist;
      best = i;
    }
  }

  return best;
}
