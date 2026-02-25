import { connectedNeighbors, OverlayFlag, type Grid } from "@/core/grid";
import type { CellPatch } from "@/core/patches";
import type { SolverPlugin } from "@/core/plugins/SolverPlugin";
import type { AlgorithmStepMeta, SolverRunOptions } from "@/core/plugins/types";

interface DeadEndContext {
  grid: Grid;
  startIndex: number;
  goalIndex: number;
  started: boolean;
  degree: Uint8Array;
  removed: Uint8Array;
  inQueue: Uint8Array;
  queue: number[];
  head: number;
  current: number;
  frontierSize: number;
}

export const deadEndFillingSolver: SolverPlugin<
  SolverRunOptions,
  AlgorithmStepMeta
> = {
  id: "dead-end-filling",
  label: "Dead-End Filling",
  create({ grid, options }) {
    const context: DeadEndContext = {
      grid,
      startIndex: options.startIndex,
      goalIndex: options.goalIndex,
      started: false,
      degree: new Uint8Array(grid.cellCount),
      removed: new Uint8Array(grid.cellCount),
      inQueue: new Uint8Array(grid.cellCount),
      queue: [],
      head: 0,
      current: -1,
      frontierSize: 0,
    };

    return {
      step: () => stepDeadEndFilling(context),
    };
  },
};

function stepDeadEndFilling(context: DeadEndContext) {
  const patches: CellPatch[] = [];

  if (!context.started) {
    context.started = true;

    for (let i = 0; i < context.grid.cellCount; i += 1) {
      const degree = connectedNeighbors(context.grid, i).length;
      context.degree[i] = degree;

      if (i === context.startIndex || i === context.goalIndex) {
        continue;
      }

      if (degree <= 1) {
        context.inQueue[i] = 1;
        context.queue.push(i);
        context.frontierSize += 1;
        patches.push({ index: i, overlaySet: OverlayFlag.Frontier });
      }
    }

    if (context.queue.length === 0) {
      const pathLength = setFinalPath(context, patches);
      return {
        done: true,
        patches,
        meta: {
          line: 2,
          solved: true,
          pathLength,
          frontierSize: 0,
        },
      };
    }

    return {
      done: false,
      patches,
      meta: {
        line: 1,
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

  if (context.head >= context.queue.length) {
    const pathLength = setFinalPath(context, patches);
    return {
      done: true,
      patches,
      meta: {
        line: 3,
        solved: true,
        pathLength,
        frontierSize: 0,
      },
    };
  }

  const cell = context.queue[context.head] as number;
  context.head += 1;

  if (context.inQueue[cell] === 1) {
    context.inQueue[cell] = 0;
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
        line: 4,
        frontierSize: context.frontierSize,
      },
    };
  }

  context.removed[cell] = 1;
  context.current = cell;
  patches.push({
    index: cell,
    overlaySet: OverlayFlag.Visited | OverlayFlag.Current,
    overlayClear: OverlayFlag.Path,
  });

  for (const neighbor of connectedNeighbors(context.grid, cell)) {
    if (context.removed[neighbor] === 1) {
      continue;
    }

    const nextDegree = Math.max(0, (context.degree[neighbor] as number) - 1);
    context.degree[neighbor] = nextDegree;

    if (neighbor === context.startIndex || neighbor === context.goalIndex) {
      continue;
    }

    if (nextDegree <= 1 && context.inQueue[neighbor] === 0) {
      context.inQueue[neighbor] = 1;
      context.queue.push(neighbor);
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
      frontierSize: context.frontierSize,
    },
  };
}

function setFinalPath(context: DeadEndContext, patches: CellPatch[]): number {
  let pathLength = 0;

  for (let i = 0; i < context.grid.cellCount; i += 1) {
    if (context.removed[i] === 1) {
      continue;
    }

    pathLength += 1;
    patches.push({
      index: i,
      overlaySet: OverlayFlag.Path,
      overlayClear: OverlayFlag.Frontier,
    });
  }

  if (context.current !== -1) {
    patches.push({
      index: context.current,
      overlayClear: OverlayFlag.Current,
    });
    context.current = -1;
  }

  return pathLength;
}
