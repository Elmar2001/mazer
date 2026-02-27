import {
  carvePatch,
  neighbors,
  OverlayFlag,
  type Grid,
} from "@/core/grid";
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

interface PrimLoopyContext {
  grid: Grid;
  rng: RandomSource;
  started: boolean;
  startIndex: number;
  loopDensity: number;
  visited: Uint8Array;
  frontierFlags: Uint8Array;
  frontier: number[];
  visitedCount: number;
}

export const primLoopyGenerator: GeneratorPlugin<
  GeneratorRunOptions,
  AlgorithmStepMeta
> = {
  id: "prim-loopy",
  label: "Prim (Loopy)",
  generatorParamsSchema: [LOOP_DENSITY_PARAM_SCHEMA],
  create({ grid, rng, options }) {
    const start =
      typeof options.startIndex === "number" &&
      options.startIndex >= 0 &&
      options.startIndex < grid.cellCount
        ? options.startIndex
        : rng.nextInt(grid.cellCount);

    const context: PrimLoopyContext = {
      grid,
      rng,
      started: false,
      startIndex: start,
      loopDensity: parseLoopDensity(options),
      visited: new Uint8Array(grid.cellCount),
      frontierFlags: new Uint8Array(grid.cellCount),
      frontier: [],
      visitedCount: 0,
    };

    return {
      step: () => stepPrimLoopy(context),
    };
  },
};

function stepPrimLoopy(context: PrimLoopyContext) {
  const patches: CellPatch[] = [];

  if (!context.started) {
    context.started = true;
    context.visited[context.startIndex] = 1;
    context.visitedCount = 1;

    patches.push({
      index: context.startIndex,
      overlaySet: OverlayFlag.Visited,
    });

    addFrontier(context, context.startIndex, patches);

    return {
      done: context.grid.cellCount <= 1,
      patches,
      meta: {
        line: 1,
        visitedCount: context.visitedCount,
        frontierSize: context.frontier.length,
      },
    };
  }

  if (context.frontier.length === 0) {
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

  const frontierPick = context.rng.nextInt(context.frontier.length);
  const cell = context.frontier[frontierPick] as number;

  context.frontier[frontierPick] =
    context.frontier[context.frontier.length - 1] as number;
  context.frontier.pop();
  context.frontierFlags[cell] = 0;

  patches.push({
    index: cell,
    overlayClear: OverlayFlag.Frontier,
  });

  const visitedNeighbors = neighbors(context.grid, cell).filter(
    (neighbor) => context.visited[neighbor.index] === 1,
  );

  if (visitedNeighbors.length > 0) {
    const parent = visitedNeighbors[context.rng.nextInt(visitedNeighbors.length)]!;
    patches.push(
      ...carvePatch(cell, parent.index, parent.direction.wall, parent.direction.opposite),
    );

    carveExtraLoops(context, cell, parent.index, visitedNeighbors, patches);
  }

  if (context.visited[cell] === 0) {
    context.visited[cell] = 1;
    context.visitedCount += 1;

    patches.push({
      index: cell,
      overlaySet: OverlayFlag.Visited,
    });

    addFrontier(context, cell, patches);
  }

  return {
    done: context.visitedCount >= context.grid.cellCount,
    patches,
    meta: {
      line: 5,
      visitedCount: context.visitedCount,
      frontierSize: context.frontier.length,
    },
  };
}

function carveExtraLoops(
  context: PrimLoopyContext,
  cell: number,
  parentIndex: number,
  visitedNeighbors: ReturnType<typeof neighbors>,
  patches: CellPatch[],
): void {
  if (context.loopDensity <= 0) {
    return;
  }

  const loopChance = context.loopDensity / 100;
  const maxExtraCarves = 1 + Math.floor(context.loopDensity / 40);

  const candidates = visitedNeighbors.filter(
    (neighbor) => neighbor.index !== parentIndex,
  );
  shuffleNeighbors(candidates, context.rng);

  let attempts = 0;
  for (const candidate of candidates) {
    if (attempts >= maxExtraCarves) {
      break;
    }

    attempts += 1;
    if (context.rng.next() > loopChance) {
      continue;
    }

    patches.push(
      ...carvePatch(
        cell,
        candidate.index,
        candidate.direction.wall,
        candidate.direction.opposite,
      ),
    );
  }
}

function addFrontier(
  context: PrimLoopyContext,
  base: number,
  patches: CellPatch[],
): void {
  for (const neighbor of neighbors(context.grid, base)) {
    if (context.visited[neighbor.index] === 1) {
      continue;
    }

    if (context.frontierFlags[neighbor.index] === 1) {
      continue;
    }

    context.frontierFlags[neighbor.index] = 1;
    context.frontier.push(neighbor.index);
    patches.push({
      index: neighbor.index,
      overlaySet: OverlayFlag.Frontier,
    });
  }
}

function shuffleNeighbors(
  items: ReturnType<typeof neighbors>,
  rng: RandomSource,
): void {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = rng.nextInt(i + 1);
    const tmp = items[i];
    items[i] = items[j]!;
    items[j] = tmp!;
  }
}
