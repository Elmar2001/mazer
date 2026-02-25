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

interface EllerContext {
  steps: CellPatch[][];
  cursor: number;
  touched: Uint8Array;
  visitedCount: number;
  cellCount: number;
}

export const ellerGenerator: GeneratorPlugin<
  GeneratorRunOptions,
  AlgorithmStepMeta
> = {
  id: "eller",
  label: "Eller",
  create({ grid, rng }) {
    return {
      step: createStepper(grid, rng),
    };
  },
};

function createStepper(grid: Grid, rng: RandomSource) {
  const steps = buildEllerSteps(grid, rng);

  const context: EllerContext = {
    steps,
    cursor: 0,
    touched: new Uint8Array(grid.cellCount),
    visitedCount: 0,
    cellCount: grid.cellCount,
  };

  return () => stepEller(context);
}

function stepEller(context: EllerContext) {
  if (context.cursor >= context.steps.length) {
    return {
      done: true,
      patches: [],
      meta: {
        line: 1,
        visitedCount: context.visitedCount,
        frontierSize: 0,
      },
    };
  }

  const base = context.steps[context.cursor] as CellPatch[];
  context.cursor += 1;

  const patches: CellPatch[] = [];

  for (const patch of base) {
    patches.push(patch);

    if (context.touched[patch.index] === 0) {
      context.touched[patch.index] = 1;
      context.visitedCount += 1;
      patches.push({
        index: patch.index,
        overlaySet: OverlayFlag.Visited,
      });
    }
  }

  const done = context.cursor >= context.steps.length;

  return {
    done,
    patches,
    meta: {
      line: 2,
      visitedCount: context.visitedCount,
      frontierSize: done ? 0 : 1,
    },
  };
}

function buildEllerSteps(grid: Grid, rng: RandomSource): CellPatch[][] {
  const width = grid.width;
  const height = grid.height;

  const steps: CellPatch[][] = [];

  let current = new Int32Array(width);
  let nextSetId = 1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (current[x] !== 0) {
        continue;
      }

      current[x] = nextSetId;
      nextSetId += 1;
    }

    const isLastRow = y === height - 1;

    if (isLastRow) {
      for (let x = 0; x < width - 1; x += 1) {
        if (current[x] === current[x + 1]) {
          continue;
        }

        const from = y * width + x;
        const to = from + 1;

        steps.push(carvePatch(from, to, WallFlag.East, WallFlag.West));
        mergeSets(current, current[x] as number, current[x + 1] as number);
      }

      continue;
    }

    for (let x = 0; x < width - 1; x += 1) {
      if (current[x] === current[x + 1]) {
        continue;
      }

      const shouldJoin = rng.nextInt(2) === 0;
      if (!shouldJoin) {
        continue;
      }

      const from = y * width + x;
      const to = from + 1;

      steps.push(carvePatch(from, to, WallFlag.East, WallFlag.West));
      mergeSets(current, current[x] as number, current[x + 1] as number);
    }

    const next = new Int32Array(width);
    const groups = groupBySet(current);

    for (const cells of groups.values()) {
      const carveFlags = new Uint8Array(cells.length);
      let carvedCount = 0;

      for (let i = 0; i < cells.length; i += 1) {
        if (rng.nextInt(2) === 0) {
          carveFlags[i] = 1;
          carvedCount += 1;
        }
      }

      if (carvedCount === 0) {
        const forced = rng.nextInt(cells.length);
        carveFlags[forced] = 1;
      }

      for (let i = 0; i < cells.length; i += 1) {
        if (carveFlags[i] === 0) {
          continue;
        }

        const x = cells[i] as number;
        const from = y * width + x;
        const to = from + width;

        steps.push(carvePatch(from, to, WallFlag.South, WallFlag.North));
        next[x] = current[x] as number;
      }
    }

    current = next;
  }

  return steps;
}

function mergeSets(row: Int32Array, keep: number, drop: number): void {
  if (keep === drop) {
    return;
  }

  for (let i = 0; i < row.length; i += 1) {
    if (row[i] === drop) {
      row[i] = keep;
    }
  }
}

function groupBySet(row: Int32Array): Map<number, number[]> {
  const groups = new Map<number, number[]>();

  for (let x = 0; x < row.length; x += 1) {
    const id = row[x] as number;
    const group = groups.get(id);

    if (group) {
      group.push(x);
      continue;
    }

    groups.set(id, [x]);
  }

  return groups;
}
