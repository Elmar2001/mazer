import {
  carvePatch,
  OverlayFlag,
  WallFlag,
  type Grid,
} from "@/core/grid";
import type { CellPatch } from "@/core/patches";
import type { GeneratorPlugin } from "@/core/plugins/GeneratorPlugin";
import type {
  AlgorithmStepMeta,
  GeneratorRunOptions,
} from "@/core/plugins/types";
import type { RandomSource } from "@/core/rng";

interface BinaryTreeContext {
  grid: Grid;
  rng: RandomSource;
  cursor: number;
  current: number;
  visitedCount: number;
}

export const binaryTreeGenerator: GeneratorPlugin<
  GeneratorRunOptions,
  AlgorithmStepMeta
> = {
  id: "binary-tree",
  label: "Binary Tree",
  create({ grid, rng }) {
    const context: BinaryTreeContext = {
      grid,
      rng,
      cursor: 0,
      current: -1,
      visitedCount: 0,
    };

    return {
      step: () => stepBinaryTree(context),
    };
  },
};

function stepBinaryTree(context: BinaryTreeContext) {
  const patches: CellPatch[] = [];

  if (context.current !== -1) {
    patches.push({
      index: context.current,
      overlayClear: OverlayFlag.Current,
    });
  }

  if (context.cursor >= context.grid.cellCount) {
    return {
      done: true,
      patches,
      meta: {
        visitedCount: context.visitedCount,
        frontierSize: 0,
      },
    };
  }

  const index = context.cursor;
  context.cursor += 1;
  context.current = index;
  context.visitedCount += 1;

  patches.push({
    index,
    overlaySet: OverlayFlag.Visited | OverlayFlag.Current,
  });

  const x = index % context.grid.width;
  const y = Math.floor(index / context.grid.width);

  const options: Array<{ to: number; wallFrom: WallFlag; wallTo: WallFlag }> = [];

  if (y > 0) {
    options.push({
      to: index - context.grid.width,
      wallFrom: WallFlag.North,
      wallTo: WallFlag.South,
    });
  }

  if (x > 0) {
    options.push({
      to: index - 1,
      wallFrom: WallFlag.West,
      wallTo: WallFlag.East,
    });
  }

  if (options.length > 0) {
    const pick = options[context.rng.nextInt(options.length)]!;
    patches.push(...carvePatch(index, pick.to, pick.wallFrom, pick.wallTo));
  }

  const done = context.cursor >= context.grid.cellCount;
  if (done) {
    patches.push({ index, overlayClear: OverlayFlag.Current });
    context.current = -1;
  }

  return {
    done,
    patches,
    meta: {
      visitedCount: context.visitedCount,
      frontierSize: done ? 0 : 1,
    },
  };
}
