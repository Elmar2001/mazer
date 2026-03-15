import { carvePatch, neighbors, OverlayFlag, WallFlag, type Grid } from "@/core/grid";
import type { CellPatch } from "@/core/patches";
import type { GeneratorPlugin, GeneratorStepper } from "@/core/plugins/GeneratorPlugin";
import { dfsBacktrackerGenerator } from "@/core/plugins/generators/dfsBacktracker";
import type {
  AlgorithmStepMeta,
  GeneratorRunOptions,
} from "@/core/plugins/types";
import type { RandomSource } from "@/core/rng";

interface BraidContext {
  grid: Grid;
  rng: RandomSource;
  phase: "base" | "braid";
  baseStepper: GeneratorStepper<AlgorithmStepMeta>;
  deadEnds: number[];
  cursor: number;
  braidedCount: number;
  current: number;
}

export const braidGenerator: GeneratorPlugin<
  GeneratorRunOptions,
  AlgorithmStepMeta
> = {
  id: "braid",
  label: "Braid (Dead-End Reduction)",
  create({ grid, rng, options }) {
    const baseStepper = dfsBacktrackerGenerator.create({
      grid,
      rng,
      options,
    });

    const context: BraidContext = {
      grid,
      rng,
      phase: "base",
      baseStepper,
      deadEnds: [],
      cursor: 0,
      braidedCount: 0,
      current: -1,
    };

    return {
      step: () => stepBraid(context),
    };
  },
};

function stepBraid(context: BraidContext) {
  const patches: CellPatch[] = [];

  if (context.current !== -1) {
    patches.push({
      index: context.current,
      overlayClear: OverlayFlag.Current,
    });
    context.current = -1;
  }

  if (context.phase === "base") {
    const base = context.baseStepper.step();
    for (const p of base.patches) {
      patches.push(p);
    }

    if (!base.done) {
      return {
        done: false,
        patches,
        meta: {
          ...(base.meta ?? {}),
          line: 1,
        },
      };
    }

    context.phase = "braid";
    context.deadEnds = collectDeadEnds(context.grid);
    shuffle(context.deadEnds, context.rng);
    context.cursor = 0;

    return {
      done: context.deadEnds.length === 0,
      patches,
      meta: {
        line: 2,
        visitedCount: context.grid.cellCount,
        frontierSize: context.deadEnds.length,
      },
    };
  }

  while (context.cursor < context.deadEnds.length) {
    const cell = context.deadEnds[context.cursor] as number;
    context.cursor += 1;

    if (openDegree(context.grid, cell) !== 1) {
      continue;
    }

    const closed = neighbors(context.grid, cell).filter(
      (neighbor) =>
        (context.grid.walls[cell] & neighbor.direction.wall) !== 0,
    );

    if (closed.length === 0) {
      continue;
    }

    const safeChoices = closed.filter((neighbor) => openDegree(context.grid, neighbor.index) > 1);
    const pool = safeChoices.length > 0 ? safeChoices : closed;
    const pick = pool[context.rng.nextInt(pool.length)]!;

    patches.push(
      ...carvePatch(cell, pick.index, pick.direction.wall, pick.direction.opposite),
    );
    patches.push({
      index: cell,
      overlaySet: OverlayFlag.Current | OverlayFlag.Visited,
    });
    patches.push({
      index: pick.index,
      overlaySet: OverlayFlag.Visited,
    });

    context.current = cell;
    context.braidedCount += 1;

    return {
      done: false,
      patches,
      meta: {
        line: 4,
        visitedCount: context.grid.cellCount,
        frontierSize: Math.max(0, context.deadEnds.length - context.cursor),
      },
    };
  }

  return {
    done: true,
    patches,
    meta: {
      line: 5,
      visitedCount: context.grid.cellCount,
      frontierSize: 0,
    },
  };
}

function openDegree(grid: Grid, index: number): number {
  const walls = grid.walls[index] as number;
  let degree = 0;

  if ((walls & WallFlag.North) === 0) {
    degree += 1;
  }

  if ((walls & WallFlag.East) === 0) {
    degree += 1;
  }

  if ((walls & WallFlag.South) === 0) {
    degree += 1;
  }

  if ((walls & WallFlag.West) === 0) {
    degree += 1;
  }

  return degree;
}

function collectDeadEnds(grid: Grid): number[] {
  const deadEnds: number[] = [];

  for (let i = 0; i < grid.cellCount; i += 1) {
    if (openDegree(grid, i) <= 1) {
      deadEnds.push(i);
    }
  }

  return deadEnds;
}

function shuffle(items: number[], rng: RandomSource): void {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = rng.nextInt(i + 1);
    const tmp = items[i] as number;
    items[i] = items[j] as number;
    items[j] = tmp;
  }
}
