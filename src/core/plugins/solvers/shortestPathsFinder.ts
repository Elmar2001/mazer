import { OverlayFlag, type Grid } from "@/core/grid";
import type { CellPatch } from "@/core/patches";
import type { SolverPlugin } from "@/core/plugins/SolverPlugin";
import type { AlgorithmStepMeta, SolverRunOptions } from "@/core/plugins/types";
import { getOpenNeighbors } from "@/core/plugins/solvers/helpers";

type Phase = "from-start" | "from-goal" | "mark";

interface ShortestPathsContext {
  grid: Grid;
  startIndex: number;
  goalIndex: number;
  started: boolean;
  phase: Phase;
  queue: number[];
  head: number;
  frontierFlags: Uint8Array;
  visitedFlags: Uint8Array;
  distStart: Int32Array;
  distGoal: Int32Array;
  current: number;
  visitedCount: number;
  frontierSize: number;
  shortestLength: number;
  pathCells: number[];
  pathCursor: number;
}

export const shortestPathsFinderSolver: SolverPlugin<
  SolverRunOptions,
  AlgorithmStepMeta
> = {
  id: "shortest-paths-finder",
  label: "Shortest Paths Finder (All)",
  create({ grid, options }) {
    const distStart = new Int32Array(grid.cellCount);
    const distGoal = new Int32Array(grid.cellCount);
    distStart.fill(-1);
    distGoal.fill(-1);

    const context: ShortestPathsContext = {
      grid,
      startIndex: options.startIndex,
      goalIndex: options.goalIndex,
      started: false,
      phase: "from-start",
      queue: [],
      head: 0,
      frontierFlags: new Uint8Array(grid.cellCount),
      visitedFlags: new Uint8Array(grid.cellCount),
      distStart,
      distGoal,
      current: -1,
      visitedCount: 0,
      frontierSize: 0,
      shortestLength: 0,
      pathCells: [],
      pathCursor: 0,
    };

    return {
      step: () => stepShortestPaths(context),
    };
  },
};

function stepShortestPaths(context: ShortestPathsContext) {
  const patches: CellPatch[] = [];

  if (!context.started) {
    context.started = true;

    if (context.startIndex === context.goalIndex) {
      patches.push({
        index: context.startIndex,
        overlaySet: OverlayFlag.Visited | OverlayFlag.Path,
      });

      return {
        done: true,
        patches,
        meta: {
          line: 1,
          solved: true,
          pathLength: 1,
          visitedCount: 1,
          frontierSize: 0,
        },
      };
    }

    context.queue.push(context.startIndex);
    context.distStart[context.startIndex] = 0;
    context.frontierFlags[context.startIndex] = 1;
    context.frontierSize = 1;

    patches.push({
      index: context.startIndex,
      overlaySet: OverlayFlag.Frontier,
    });

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

  if (context.phase === "mark") {
    if (context.pathCursor >= context.pathCells.length) {
      return {
        done: true,
        patches,
        meta: {
          line: 6,
          solved: context.pathCells.length > 0,
          pathLength: context.shortestLength,
          visitedCount: context.visitedCount,
          frontierSize: 0,
        },
      };
    }

    const cell = context.pathCells[context.pathCursor] as number;
    context.pathCursor += 1;

    context.current = cell;
    patches.push({
      index: cell,
      overlaySet: OverlayFlag.Path | OverlayFlag.Visited | OverlayFlag.Current,
      overlayClear: OverlayFlag.Frontier,
    });

    return {
      done: false,
      patches,
      meta: {
        line: 5,
        solved: false,
        pathLength: context.shortestLength,
        visitedCount: context.visitedCount,
        frontierSize: context.pathCells.length - context.pathCursor,
      },
    };
  }

  if (context.head >= context.queue.length) {
    if (context.phase === "from-start") {
      if (context.distStart[context.goalIndex] === -1) {
        return {
          done: true,
          patches,
          meta: {
            line: 3,
            solved: false,
            visitedCount: context.visitedCount,
            frontierSize: 0,
          },
        };
      }

      clearFrontier(context, patches);
      context.phase = "from-goal";
      context.queue = [context.goalIndex];
      context.head = 0;
      context.distGoal[context.goalIndex] = 0;
      context.frontierFlags[context.goalIndex] = 1;
      context.frontierSize = 1;

      patches.push({
        index: context.goalIndex,
        overlaySet: OverlayFlag.Frontier,
      });

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

    context.shortestLength = (context.distStart[context.goalIndex] as number) + 1;
    context.pathCells = collectAllShortestPathCells(context);
    context.pathCursor = 0;
    context.phase = "mark";

    clearFrontier(context, patches);

    return {
      done: false,
      patches,
      meta: {
        line: 4,
        solved: false,
        pathLength: context.shortestLength,
        visitedCount: context.visitedCount,
        frontierSize: context.pathCells.length,
      },
    };
  }

  const node = context.queue[context.head] as number;
  context.head += 1;
  context.current = node;

  if (context.frontierFlags[node] === 1) {
    context.frontierFlags[node] = 0;
    context.frontierSize = Math.max(0, context.frontierSize - 1);
    patches.push({
      index: node,
      overlayClear: OverlayFlag.Frontier,
    });
  }

  if (context.visitedFlags[node] === 0) {
    context.visitedFlags[node] = 1;
    context.visitedCount += 1;
    patches.push({
      index: node,
      overlaySet: OverlayFlag.Visited | OverlayFlag.Current,
    });
  } else {
    patches.push({
      index: node,
      overlaySet: OverlayFlag.Current,
    });
  }

  const dist = context.phase === "from-start" ? context.distStart : context.distGoal;

  for (const neighbor of getOpenNeighbors(context.grid, node)) {
    if (dist[neighbor] !== -1) {
      continue;
    }

    dist[neighbor] = (dist[node] as number) + 1;
    context.queue.push(neighbor);

    if (context.frontierFlags[neighbor] === 0) {
      context.frontierFlags[neighbor] = 1;
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

function clearFrontier(context: ShortestPathsContext, patches: CellPatch[]): void {
  for (let i = 0; i < context.frontierFlags.length; i += 1) {
    if (context.frontierFlags[i] === 0) {
      continue;
    }

    context.frontierFlags[i] = 0;
    patches.push({
      index: i,
      overlayClear: OverlayFlag.Frontier,
    });
  }

  context.frontierSize = 0;
}

function collectAllShortestPathCells(context: ShortestPathsContext): number[] {
  const shortestDistance = context.distStart[context.goalIndex] as number;
  if (shortestDistance < 0) {
    return [];
  }

  const cells: number[] = [];

  for (let i = 0; i < context.grid.cellCount; i += 1) {
    const fromStart = context.distStart[i] as number;
    const fromGoal = context.distGoal[i] as number;

    if (fromStart < 0 || fromGoal < 0) {
      continue;
    }

    if (fromStart + fromGoal !== shortestDistance) {
      continue;
    }

    cells.push(i);
  }

  cells.sort((a, b) => {
    const da = context.distStart[a] as number;
    const db = context.distStart[b] as number;
    if (da !== db) {
      return da - db;
    }

    return a - b;
  });

  return cells;
}
