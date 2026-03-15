import { carvePatch, OverlayFlag, WallFlag, type Grid } from "@/core/grid";
import type { CellPatch } from "@/core/patches";
import type { GeneratorPlugin } from "@/core/plugins/GeneratorPlugin";
import type {
  AlgorithmStepMeta,
  GeneratorRunOptions,
} from "@/core/plugins/types";
import type { RandomSource } from "@/core/rng";

interface DivisionContext {
  steps: CellPatch[][];
  cursor: number;
  touched: Uint8Array;
  visitedCount: number;
  current: number;
}

export const recursiveDivisionGenerator: GeneratorPlugin<
  GeneratorRunOptions,
  AlgorithmStepMeta
> = {
  id: "recursive-division",
  label: "Recursive Division",
  create({ grid, rng }) {
    const context: DivisionContext = {
      steps: buildRecursiveDivisionSteps(grid, rng),
      cursor: 0,
      touched: new Uint8Array(grid.cellCount),
      visitedCount: 0,
      current: -1,
    };

    return {
      step: () => stepRecursiveDivision(context),
    };
  },
};

function stepRecursiveDivision(context: DivisionContext) {
  const patches: CellPatch[] = [];

  if (context.current !== -1) {
    patches.push({
      index: context.current,
      overlayClear: OverlayFlag.Current,
    });
    context.current = -1;
  }

  if (context.cursor >= context.steps.length) {
    return {
      done: true,
      patches,
      meta: {
        line: 6,
        visitedCount: context.visitedCount,
        frontierSize: 0,
      },
    };
  }

  const stepPatches = context.steps[context.cursor] as CellPatch[];
  context.cursor += 1;

  for (const patch of stepPatches) patches.push(patch);

  for (const patch of stepPatches) {
    if (context.touched[patch.index] === 1) {
      continue;
    }

    context.touched[patch.index] = 1;
    context.visitedCount += 1;
    patches.push({
      index: patch.index,
      overlaySet: OverlayFlag.Visited,
    });
  }

  if (stepPatches.length > 0) {
    context.current = stepPatches[0]!.index;
    patches.push({
      index: context.current,
      overlaySet: OverlayFlag.Current,
    });
  }

  return {
    done: context.cursor >= context.steps.length,
    patches,
    meta: {
      line: context.cursor <= 1 ? 1 : 4,
      visitedCount: context.visitedCount,
      frontierSize: context.steps.length - context.cursor,
    },
  };
}

function buildRecursiveDivisionSteps(grid: Grid, rng: RandomSource): CellPatch[][] {
  const steps: CellPatch[][] = [];
  const openAllInternal = buildOpenInternalPatches(grid);
  if (openAllInternal.length > 0) {
    steps.push(openAllInternal);
  }

  divide(grid, rng, steps, 0, 0, grid.width, grid.height);

  return steps;
}

function buildOpenInternalPatches(grid: Grid): CellPatch[] {
  const patches: CellPatch[] = [];

  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const cell = y * grid.width + x;

      if (x + 1 < grid.width) {
        patches.push(...carvePatch(cell, cell + 1, WallFlag.East, WallFlag.West));
      }

      if (y + 1 < grid.height) {
        patches.push(
          ...carvePatch(cell, cell + grid.width, WallFlag.South, WallFlag.North),
        );
      }
    }
  }

  return patches;
}

function divide(
  grid: Grid,
  rng: RandomSource,
  steps: CellPatch[][],
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  if (width <= 1 || height <= 1) {
    return;
  }

  const horizontal =
    width < height ? true : width > height ? false : rng.nextInt(2) === 0;

  if (horizontal) {
    const wallY = y + rng.nextInt(height - 1);
    const gapX = x + rng.nextInt(width);
    const patches: CellPatch[] = [];

    for (let cx = x; cx < x + width; cx += 1) {
      if (cx === gapX) {
        continue;
      }

      const top = wallY * grid.width + cx;
      const bottom = (wallY + 1) * grid.width + cx;

      patches.push({ index: top, wallSet: WallFlag.South });
      patches.push({ index: bottom, wallSet: WallFlag.North });
    }

    if (patches.length > 0) {
      steps.push(patches);
    }

    const topHeight = wallY - y + 1;
    const bottomHeight = height - topHeight;

    divide(grid, rng, steps, x, y, width, topHeight);
    divide(grid, rng, steps, x, wallY + 1, width, bottomHeight);
    return;
  }

  const wallX = x + rng.nextInt(width - 1);
  const gapY = y + rng.nextInt(height);
  const patches: CellPatch[] = [];

  for (let cy = y; cy < y + height; cy += 1) {
    if (cy === gapY) {
      continue;
    }

    const left = cy * grid.width + wallX;
    const right = left + 1;

    patches.push({ index: left, wallSet: WallFlag.East });
    patches.push({ index: right, wallSet: WallFlag.West });
  }

  if (patches.length > 0) {
    steps.push(patches);
  }

  const leftWidth = wallX - x + 1;
  const rightWidth = width - leftWidth;

  divide(grid, rng, steps, x, y, leftWidth, height);
  divide(grid, rng, steps, wallX + 1, y, rightWidth, height);
}
