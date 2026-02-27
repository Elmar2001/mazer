import { carvePatch, OverlayFlag, WallFlag, type Grid } from "@/core/grid";
import type { CellPatch } from "@/core/patches";
import type { GeneratorPlugin } from "@/core/plugins/GeneratorPlugin";
import {
  LOOP_DENSITY_PARAM_SCHEMA,
  parseLoopDensity,
} from "@/core/plugins/generators/loopDensity";
import type {
  AlgorithmStepMeta,
  GeneratorRunOptions,
} from "@/core/plugins/types";
import type { RandomSource } from "@/core/rng";

interface DivisionLoopyContext {
  steps: CellPatch[][];
  cursor: number;
  touched: Uint8Array;
  visitedCount: number;
  current: number;
}

export const recursiveDivisionLoopyGenerator: GeneratorPlugin<
  GeneratorRunOptions,
  AlgorithmStepMeta
> = {
  id: "recursive-division-loopy",
  label: "Recursive Division (Multi-Gap)",
  generatorParamsSchema: [LOOP_DENSITY_PARAM_SCHEMA],
  create({ grid, rng, options }) {
    const context: DivisionLoopyContext = {
      steps: buildRecursiveDivisionLoopySteps(grid, rng, parseLoopDensity(options)),
      cursor: 0,
      touched: new Uint8Array(grid.cellCount),
      visitedCount: 0,
      current: -1,
    };

    return {
      step: () => stepRecursiveDivisionLoopy(context),
    };
  },
};

function stepRecursiveDivisionLoopy(context: DivisionLoopyContext) {
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

  patches.push(...stepPatches);

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

function buildRecursiveDivisionLoopySteps(
  grid: Grid,
  rng: RandomSource,
  loopDensity: number,
): CellPatch[][] {
  const steps: CellPatch[][] = [];
  const openAllInternal = buildOpenInternalPatches(grid);
  if (openAllInternal.length > 0) {
    steps.push(openAllInternal);
  }

  divide(grid, rng, steps, 0, 0, grid.width, grid.height, loopDensity);

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
  loopDensity: number,
): void {
  if (width <= 1 || height <= 1) {
    return;
  }

  const horizontal =
    width < height ? true : width > height ? false : rng.nextInt(2) === 0;

  if (horizontal) {
    const wallY = y + rng.nextInt(height - 1);
    const gapCount = computeGapCount(width, loopDensity);
    const gapXs = pickGapIndices(x, width, gapCount, rng);
    const gapSet = new Set(gapXs);
    const patches: CellPatch[] = [];

    for (let cx = x; cx < x + width; cx += 1) {
      if (gapSet.has(cx)) {
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

    divide(grid, rng, steps, x, y, width, topHeight, loopDensity);
    divide(grid, rng, steps, x, wallY + 1, width, bottomHeight, loopDensity);
    return;
  }

  const wallX = x + rng.nextInt(width - 1);
  const gapCount = computeGapCount(height, loopDensity);
  const gapYs = pickGapIndices(y, height, gapCount, rng);
  const gapSet = new Set(gapYs);
  const patches: CellPatch[] = [];

  for (let cy = y; cy < y + height; cy += 1) {
    if (gapSet.has(cy)) {
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

  divide(grid, rng, steps, x, y, leftWidth, height, loopDensity);
  divide(grid, rng, steps, wallX + 1, y, rightWidth, height, loopDensity);
}

function computeGapCount(segmentLength: number, loopDensity: number): number {
  const extraGapCount = Math.round((segmentLength - 1) * (loopDensity / 100));
  const totalGapCount = 1 + extraGapCount;
  return Math.max(1, Math.min(segmentLength, totalGapCount));
}

function pickGapIndices(
  start: number,
  segmentLength: number,
  gapCount: number,
  rng: RandomSource,
): number[] {
  const indices: number[] = [];
  for (let i = 0; i < segmentLength; i += 1) {
    indices.push(start + i);
  }

  for (let i = indices.length - 1; i > 0; i -= 1) {
    const j = rng.nextInt(i + 1);
    const tmp = indices[i] as number;
    indices[i] = indices[j] as number;
    indices[j] = tmp;
  }

  return indices.slice(0, gapCount);
}
