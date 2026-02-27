import { OverlayFlag, type Grid } from "@/core/grid";
import type { CellPatch } from "@/core/patches";
import type { SolverPlugin } from "@/core/plugins/SolverPlugin";
import { buildPath, getOpenNeighbors } from "@/core/plugins/solvers/helpers";
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
  finalizing: boolean;
  finalPath: number[];
  finalPathCursor: number;
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
      finalizing: false,
      finalPath: [],
      finalPathCursor: 0,
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
      const degree = getOpenNeighbors(context.grid, i).length;
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
      const final = initializeFinalPath(context);
      if (!final.solved) {
        return {
          done: true,
          patches,
          meta: {
            line: 2,
            solved: false,
            pathLength: 0,
            frontierSize: 0,
          },
        };
      }

      return {
        done: false,
        patches,
        meta: {
          line: 2,
          solved: false,
          pathLength: final.pathLength,
          frontierSize: final.pathLength,
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

  if (context.finalizing) {
    return stepFinalPath(context, patches);
  }

  if (context.head >= context.queue.length) {
    const final = initializeFinalPath(context);
    if (!final.solved) {
      return {
        done: true,
        patches,
        meta: {
          line: 3,
          solved: false,
          pathLength: 0,
          frontierSize: 0,
        },
      };
    }

    return {
      done: false,
      patches,
      meta: {
        line: 3,
        solved: false,
        pathLength: final.pathLength,
        frontierSize: final.pathLength,
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

  for (const neighbor of getOpenNeighbors(context.grid, cell)) {
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

function initializeFinalPath(
  context: DeadEndContext,
): { pathLength: number; solved: boolean } {
  const path = findPathOnRemainingGraph(context);
  context.finalPath = path;
  context.finalPathCursor = 0;
  context.finalizing = path.length > 0;

  return {
    pathLength: path.length,
    solved: path.length > 0,
  };
}

function stepFinalPath(context: DeadEndContext, patches: CellPatch[]) {
  if (context.finalPathCursor >= context.finalPath.length) {
    context.finalizing = false;
    return {
      done: true,
      patches,
      meta: {
        line: 3,
        solved: true,
        pathLength: context.finalPath.length,
        frontierSize: 0,
      },
    };
  }

  const index = context.finalPath[context.finalPathCursor] as number;
  context.finalPathCursor += 1;
  context.current = index;

  patches.push({
    index,
    overlaySet: OverlayFlag.Path | OverlayFlag.Current,
    overlayClear: OverlayFlag.Frontier,
  });

  return {
    done: false,
    patches,
    meta: {
      line: 3,
      solved: false,
      pathLength: context.finalPath.length,
      frontierSize: Math.max(0, context.finalPath.length - context.finalPathCursor),
    },
  };
}

function findPathOnRemainingGraph(context: DeadEndContext): number[] {
  const parents = new Int32Array(context.grid.cellCount);
  parents.fill(-1);

  if (
    context.removed[context.startIndex] === 1 ||
    context.removed[context.goalIndex] === 1
  ) {
    return [];
  }

  const queue = [context.startIndex];
  let head = 0;
  parents[context.startIndex] = context.startIndex;

  while (head < queue.length) {
    const node = queue[head] as number;
    head += 1;

    if (node === context.goalIndex) {
      break;
    }

    for (const neighbor of getOpenNeighbors(context.grid, node)) {
      if (context.removed[neighbor] === 1 || parents[neighbor] !== -1) {
        continue;
      }

      parents[neighbor] = node;
      queue.push(neighbor);
    }
  }

  return buildPath(context.startIndex, context.goalIndex, parents);
}
