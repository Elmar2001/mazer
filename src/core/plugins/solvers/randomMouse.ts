import { OverlayFlag, type Grid } from "@/core/grid";
import type { CellPatch } from "@/core/patches";
import type { SolverPlugin } from "@/core/plugins/SolverPlugin";
import type { AlgorithmStepMeta, SolverRunOptions } from "@/core/plugins/types";
import { buildPath, getOpenNeighbors } from "@/core/plugins/solvers/helpers";
import type { RandomSource } from "@/core/rng";

interface RandomMouseContext {
  grid: Grid;
  rng: RandomSource;
  startIndex: number;
  goalIndex: number;
  started: boolean;
  current: number;
  parents: Int32Array;
  discovered: Uint8Array;
  visited: Uint8Array;
  visitedCount: number;
}

export const randomMouseSolver: SolverPlugin<SolverRunOptions, AlgorithmStepMeta> = {
  id: "random-mouse",
  label: "Random Mouse",
  create({ grid, rng, options }) {
    const parents = new Int32Array(grid.cellCount);
    parents.fill(-1);

    const context: RandomMouseContext = {
      grid,
      rng,
      startIndex: options.startIndex,
      goalIndex: options.goalIndex,
      started: false,
      current: options.startIndex,
      parents,
      discovered: new Uint8Array(grid.cellCount),
      visited: new Uint8Array(grid.cellCount),
      visitedCount: 0,
    };

    return {
      step: () => stepRandomMouse(context),
    };
  },
};

function stepRandomMouse(context: RandomMouseContext) {
  const patches: CellPatch[] = [];

  if (!context.started) {
    context.started = true;
    context.discovered[context.startIndex] = 1;
    context.visited[context.startIndex] = 1;
    context.visitedCount = 1;
    context.parents[context.startIndex] = context.startIndex;

    patches.push({
      index: context.startIndex,
      overlaySet: OverlayFlag.Visited | OverlayFlag.Frontier | OverlayFlag.Current,
    });

    if (context.startIndex === context.goalIndex) {
      patches.push({
        index: context.startIndex,
        overlaySet: OverlayFlag.Path,
        overlayClear: OverlayFlag.Current | OverlayFlag.Frontier,
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

    return {
      done: false,
      patches,
      meta: {
        line: 1,
        visitedCount: context.visitedCount,
        frontierSize: 1,
      },
    };
  }

  patches.push({
    index: context.current,
    overlayClear: OverlayFlag.Current | OverlayFlag.Frontier,
  });

  if (context.current === context.goalIndex) {
    const path = buildPath(context.startIndex, context.goalIndex, context.parents);
    for (const cell of path) {
      patches.push({ index: cell, overlaySet: OverlayFlag.Path });
    }

    return {
      done: true,
      patches,
      meta: {
        line: 5,
        solved: true,
        pathLength: path.length,
        visitedCount: context.visitedCount,
        frontierSize: 0,
      },
    };
  }

  const options = getOpenNeighbors(context.grid, context.current);
  if (options.length === 0) {
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

  const previous = context.current;
  const next = options[context.rng.nextInt(options.length)] as number;
  context.current = next;

  if (context.discovered[next] === 0) {
    context.discovered[next] = 1;
    context.parents[next] = previous;
  }

  if (context.visited[next] === 0) {
    context.visited[next] = 1;
    context.visitedCount += 1;
  }

  patches.push({
    index: next,
    overlaySet: OverlayFlag.Visited | OverlayFlag.Frontier | OverlayFlag.Current,
  });

  if (next === context.goalIndex) {
    const path = buildPath(context.startIndex, context.goalIndex, context.parents);
    if (path.length > 0) {
      for (const cell of path) {
        patches.push({ index: cell, overlaySet: OverlayFlag.Path });
      }
    }

    patches.push({
      index: next,
      overlayClear: OverlayFlag.Current | OverlayFlag.Frontier,
    });

    return {
      done: true,
      patches,
      meta: {
        line: 5,
        solved: path.length > 0,
        pathLength: path.length,
        visitedCount: context.visitedCount,
        frontierSize: 0,
      },
    };
  }

  return {
    done: false,
    patches,
    meta: {
      line: 3,
      visitedCount: context.visitedCount,
      frontierSize: 1,
    },
  };
}
