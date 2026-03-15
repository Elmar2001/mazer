import { carvePatch, neighbors, OverlayFlag, type Grid } from "@/core/grid";
import type { CellPatch } from "@/core/patches";
import type { GeneratorPlugin } from "@/core/plugins/GeneratorPlugin";
import type {
  AlgorithmStepMeta,
  GeneratorRunOptions,
} from "@/core/plugins/types";
import type { RandomSource } from "@/core/rng";

interface PrimModifiedContext {
  grid: Grid;
  rng: RandomSource;
  started: boolean;
  active: number[];
  visited: Uint8Array;
  visitedCount: number;
  current: number;
}

export const primModifiedGenerator: GeneratorPlugin<
  GeneratorRunOptions,
  AlgorithmStepMeta
> = {
  id: "prim-modified",
  label: "Prim (Modified) (Growing Tree)",
  implementationKind: "alias",
  aliasOf: "growing-tree",
  create({ grid, rng, options }) {
    const start =
      typeof options.startIndex === "number" &&
      options.startIndex >= 0 &&
      options.startIndex < grid.cellCount
        ? options.startIndex
        : rng.nextInt(grid.cellCount);

    const context: PrimModifiedContext = {
      grid,
      rng,
      started: false,
      active: [start],
      visited: new Uint8Array(grid.cellCount),
      visitedCount: 0,
      current: -1,
    };

    return {
      step: () => stepPrimModified(context),
    };
  },
};

function stepPrimModified(context: PrimModifiedContext) {
  const patches: CellPatch[] = [];

  if (!context.started) {
    context.started = true;

    const start = context.active[0] as number;
    context.visited[start] = 1;
    context.visitedCount = 1;
    context.current = start;

    patches.push({
      index: start,
      overlaySet: OverlayFlag.Visited | OverlayFlag.Frontier | OverlayFlag.Current,
    });

    return {
      done: context.grid.cellCount <= 1,
      patches,
      meta: {
        line: 1,
        visitedCount: context.visitedCount,
        frontierSize: context.active.length,
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

  if (context.active.length === 0) {
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

  const activePos = context.rng.nextInt(context.active.length);
  const from = context.active[activePos] as number;
  const choices = neighbors(context.grid, from).filter(
    (neighbor) => context.visited[neighbor.index] === 0,
  );

  if (choices.length === 0) {
    context.active[activePos] = context.active[context.active.length - 1] as number;
    context.active.pop();

    patches.push({
      index: from,
      overlayClear: OverlayFlag.Frontier,
    });

    return {
      done: context.active.length === 0,
      patches,
      meta: {
        line: 5,
        visitedCount: context.visitedCount,
        frontierSize: context.active.length,
      },
    };
  }

  const pick = choices[context.rng.nextInt(choices.length)]!;
  context.visited[pick.index] = 1;
  context.visitedCount += 1;
  context.active.push(pick.index);
  context.current = pick.index;

  patches.push(...carvePatch(from, pick.index, pick.direction.wall, pick.direction.opposite));
  patches.push({
    index: pick.index,
    overlaySet: OverlayFlag.Visited | OverlayFlag.Frontier | OverlayFlag.Current,
  });

  return {
    done: false,
    patches,
    meta: {
      line: 4,
      visitedCount: context.visitedCount,
      frontierSize: context.active.length,
    },
  };
}
