import { OverlayFlag, type Grid } from "@/core/grid";
import type { CellPatch } from "@/core/patches";
import type { SolverPlugin } from "@/core/plugins/SolverPlugin";
import type { AlgorithmStepMeta, SolverRunOptions } from "@/core/plugins/types";
import {
  buildPath,
  getOpenNeighbors,
  manhattan,
} from "@/core/plugins/solvers/helpers";

interface GreedyContext {
  grid: Grid;
  startIndex: number;
  goalIndex: number;
  started: boolean;
  open: number[];
  openFlags: Uint8Array;
  closedFlags: Uint8Array;
  discovered: Uint8Array;
  parents: Int32Array;
  currentIndex: number;
  visitedCount: number;
  frontierSize: number;
}

export const greedyBestFirstSolver: SolverPlugin<
  SolverRunOptions,
  AlgorithmStepMeta
> = {
  id: "greedy-best-first",
  label: "Greedy Best-First",
  create({ grid, options }) {
    const parents = new Int32Array(grid.cellCount);
    parents.fill(-1);

    const context: GreedyContext = {
      grid,
      startIndex: options.startIndex,
      goalIndex: options.goalIndex,
      started: false,
      open: [],
      openFlags: new Uint8Array(grid.cellCount),
      closedFlags: new Uint8Array(grid.cellCount),
      discovered: new Uint8Array(grid.cellCount),
      parents,
      currentIndex: -1,
      visitedCount: 0,
      frontierSize: 0,
    };

    return {
      step: () => stepGreedy(context),
    };
  },
};

function stepGreedy(context: GreedyContext) {
  const patches: CellPatch[] = [];

  if (!context.started) {
    context.started = true;
    context.open.push(context.startIndex);
    context.openFlags[context.startIndex] = 1;
    context.discovered[context.startIndex] = 1;
    context.parents[context.startIndex] = context.startIndex;
    context.frontierSize = 1;

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

  const openPick = pickClosestByHeuristic(context.open, context);
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

  for (const neighbor of getOpenNeighbors(context.grid, current)) {
    if (context.discovered[neighbor] === 1) {
      continue;
    }

    context.discovered[neighbor] = 1;
    context.parents[neighbor] = current;
    context.open.push(neighbor);
    context.openFlags[neighbor] = 1;
    context.frontierSize += 1;

    patches.push({ index: neighbor, overlaySet: OverlayFlag.Frontier });
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

function pickClosestByHeuristic(
  items: number[],
  context: GreedyContext,
): number {
  let best = 0;
  let bestScore = manhattan(
    context.grid.width,
    items[0] as number,
    context.goalIndex,
  );

  for (let i = 1; i < items.length; i += 1) {
    const score = manhattan(
      context.grid.width,
      items[i] as number,
      context.goalIndex,
    );

    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }

  return best;
}
