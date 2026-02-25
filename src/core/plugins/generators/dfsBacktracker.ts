import {
  carvePatch,
  neighbors,
  OverlayFlag,
  type Grid,
} from "@/core/grid";
import type { CellPatch } from "@/core/patches";
import type { GeneratorPlugin } from "@/core/plugins/GeneratorPlugin";
import type {
  AlgorithmStepMeta,
  GeneratorRunOptions,
} from "@/core/plugins/types";
import type { RandomSource } from "@/core/rng";

interface DfsContext {
  grid: Grid;
  rng: RandomSource;
  started: boolean;
  stack: number[];
  visited: Uint8Array;
  visitedCount: number;
}

export const dfsBacktrackerGenerator: GeneratorPlugin<
  GeneratorRunOptions,
  AlgorithmStepMeta
> = {
  id: "dfs-backtracker",
  label: "Recursive Backtracker (DFS)",
  create({ grid, rng, options }) {
    const start =
      typeof options.startIndex === "number" &&
      options.startIndex >= 0 &&
      options.startIndex < grid.cellCount
        ? options.startIndex
        : rng.nextInt(grid.cellCount);

    const context: DfsContext = {
      grid,
      rng,
      started: false,
      stack: [start],
      visited: new Uint8Array(grid.cellCount),
      visitedCount: 0,
    };

    return {
      step: () => stepDfs(context),
    };
  },
};

function stepDfs(context: DfsContext) {
  const patches: CellPatch[] = [];

  if (!context.started) {
    context.started = true;
    const start = context.stack[0];
    context.visited[start] = 1;
    context.visitedCount = 1;
    patches.push({
      index: start,
      overlaySet: OverlayFlag.Visited | OverlayFlag.Frontier | OverlayFlag.Current,
    });

    return {
      done: false,
      patches,
      meta: {
        line: 1,
        visitedCount: context.visitedCount,
        frontierSize: context.stack.length,
      },
    };
  }

  if (context.stack.length === 0) {
    return {
      done: true,
      patches,
      meta: {
        line: 2,
        visitedCount: context.visitedCount,
        frontierSize: 0,
      },
    };
  }

  const current = context.stack[context.stack.length - 1] as number;
  const choices = neighbors(context.grid, current).filter(
    (neighbor) => context.visited[neighbor.index] === 0,
  );

  if (choices.length === 0) {
    const popped = context.stack.pop() as number;
    patches.push({
      index: popped,
      overlayClear: OverlayFlag.Current | OverlayFlag.Frontier,
    });

    if (context.stack.length > 0) {
      patches.push({
        index: context.stack[context.stack.length - 1] as number,
        overlaySet: OverlayFlag.Current,
      });
    }

    return {
      done: context.stack.length === 0,
      patches,
      meta: {
        line: 4,
        visitedCount: context.visitedCount,
        frontierSize: context.stack.length,
      },
    };
  }

  const pick = choices[context.rng.nextInt(choices.length)]!;
  context.visited[pick.index] = 1;
  context.visitedCount += 1;

  patches.push({
    index: current,
    overlayClear: OverlayFlag.Current,
  });
  patches.push(...carvePatch(current, pick.index, pick.direction.wall, pick.direction.opposite));
  patches.push({
    index: pick.index,
    overlaySet: OverlayFlag.Visited | OverlayFlag.Frontier | OverlayFlag.Current,
  });

  context.stack.push(pick.index);

  return {
    done: false,
    patches,
    meta: {
      line: 5,
      visitedCount: context.visitedCount,
      frontierSize: context.stack.length,
    },
  };
}
