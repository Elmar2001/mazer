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

interface SidewinderContext {
  grid: Grid;
  rng: RandomSource;
  x: number;
  y: number;
  runStartX: number;
  current: number;
  visitedCount: number;
}

export const sidewinderGenerator: GeneratorPlugin<
  GeneratorRunOptions,
  AlgorithmStepMeta
> = {
  id: "sidewinder",
  label: "Sidewinder",
  create({ grid, rng }) {
    const context: SidewinderContext = {
      grid,
      rng,
      x: 0,
      y: 0,
      runStartX: 0,
      current: -1,
      visitedCount: 0,
    };

    return {
      step: () => stepSidewinder(context),
    };
  },
};

function stepSidewinder(context: SidewinderContext) {
  const patches: CellPatch[] = [];

  if (context.current !== -1) {
    patches.push({
      index: context.current,
      overlayClear: OverlayFlag.Current,
    });
  }

  if (context.y >= context.grid.height) {
    return {
      done: true,
      patches,
      meta: {
        line: 1,
        visitedCount: context.visitedCount,
        frontierSize: 0,
      },
    };
  }

  const index = context.y * context.grid.width + context.x;
  context.current = index;
  context.visitedCount += 1;

  patches.push({
    index,
    overlaySet: OverlayFlag.Visited | OverlayFlag.Current,
  });

  const atEasternBoundary = context.x === context.grid.width - 1;
  const atNorthernBoundary = context.y === 0;
  const shouldCloseOut =
    atEasternBoundary ||
    (!atNorthernBoundary && context.rng.nextInt(2) === 0);

  if (shouldCloseOut) {
    if (!atNorthernBoundary) {
      const runLength = context.x - context.runStartX + 1;
      const pickX = context.runStartX + context.rng.nextInt(runLength);
      const runCell = context.y * context.grid.width + pickX;
      const northCell = runCell - context.grid.width;

      patches.push(
        ...carvePatch(runCell, northCell, WallFlag.North, WallFlag.South),
      );
    }

    context.runStartX = context.x + 1;
  } else {
    const eastCell = index + 1;
    patches.push(...carvePatch(index, eastCell, WallFlag.East, WallFlag.West));
  }

  if (atEasternBoundary) {
    context.x = 0;
    context.y += 1;
    context.runStartX = 0;
  } else {
    context.x += 1;
  }

  const done = context.y >= context.grid.height;
  if (done) {
    patches.push({ index, overlayClear: OverlayFlag.Current });
    context.current = -1;
  }

  return {
    done,
    patches,
    meta: {
      line: shouldCloseOut ? 4 : 5,
      visitedCount: context.visitedCount,
      frontierSize: done ? 0 : 1,
    },
  };
}
