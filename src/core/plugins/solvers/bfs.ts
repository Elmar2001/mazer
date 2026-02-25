import { OverlayFlag, type Grid } from "@/core/grid";
import type { CellPatch } from "@/core/patches";
import type { SolverPlugin } from "@/core/plugins/SolverPlugin";
import type { AlgorithmStepMeta, SolverRunOptions } from "@/core/plugins/types";
import { buildPath, getOpenNeighbors } from "@/core/plugins/solvers/helpers";

interface BfsContext {
  grid: Grid;
  startIndex: number;
  goalIndex: number;
  started: boolean;
  queue: number[];
  head: number;
  parents: Int32Array;
  discovered: Uint8Array;
  visited: Uint8Array;
  frontier: Uint8Array;
  currentIndex: number;
  visitedCount: number;
  frontierSize: number;
}

export const bfsSolver: SolverPlugin<SolverRunOptions, AlgorithmStepMeta> = {
  id: "bfs",
  label: "Breadth-First Search (BFS)",
  create({ grid, options }) {
    const parents = new Int32Array(grid.cellCount);
    parents.fill(-1);

    const context: BfsContext = {
      grid,
      startIndex: options.startIndex,
      goalIndex: options.goalIndex,
      started: false,
      queue: [],
      head: 0,
      parents,
      discovered: new Uint8Array(grid.cellCount),
      visited: new Uint8Array(grid.cellCount),
      frontier: new Uint8Array(grid.cellCount),
      currentIndex: -1,
      visitedCount: 0,
      frontierSize: 0,
    };

    return {
      step: () => stepBfs(context),
    };
  },
};

function stepBfs(context: BfsContext) {
  const patches: CellPatch[] = [];

  if (!context.started) {
    context.started = true;
    context.queue.push(context.startIndex);
    context.discovered[context.startIndex] = 1;
    context.frontier[context.startIndex] = 1;
    context.frontierSize = 1;
    context.parents[context.startIndex] = context.startIndex;

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

  if (context.head >= context.queue.length) {
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

  const current = context.queue[context.head] as number;
  context.head += 1;
  context.currentIndex = current;

  if (context.frontier[current] === 1) {
    context.frontier[current] = 0;
    context.frontierSize -= 1;
    patches.push({
      index: current,
      overlayClear: OverlayFlag.Frontier,
    });
  }

  if (context.visited[current] === 0) {
    context.visited[current] = 1;
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
    context.queue.push(neighbor);

    if (context.frontier[neighbor] === 0) {
      context.frontier[neighbor] = 1;
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
