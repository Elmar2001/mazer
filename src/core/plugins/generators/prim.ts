import { carvePatch, neighbors, OverlayFlag, type Grid } from "@/core/grid";
import type { CellPatch } from "@/core/patches";
import type { GeneratorPlugin } from "@/core/plugins/GeneratorPlugin";
import type {
  AlgorithmStepMeta,
  GeneratorRunOptions,
} from "@/core/plugins/types";
import type { RandomSource } from "@/core/rng";

interface PrimContext {
  grid: Grid;
  rng: RandomSource;
  started: boolean;
  startIndex: number;
  visited: Uint8Array;
  frontierFlags: Uint8Array;
  frontier: number[];
  visitedCount: number;
}

export const primGenerator: GeneratorPlugin<GeneratorRunOptions, AlgorithmStepMeta> = {
  id: "prim",
  label: "Randomized Prim",
  create({ grid, rng, options }) {
    const start =
      typeof options.startIndex === "number" &&
      options.startIndex >= 0 &&
      options.startIndex < grid.cellCount
        ? options.startIndex
        : rng.nextInt(grid.cellCount);

    const context: PrimContext = {
      grid,
      rng,
      started: false,
      startIndex: start,
      visited: new Uint8Array(grid.cellCount),
      frontierFlags: new Uint8Array(grid.cellCount),
      frontier: [],
      visitedCount: 0,
    };

    return {
      step: () => stepPrim(context),
    };
  },
};

function stepPrim(context: PrimContext) {
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
    const chosen =
      visitedNeighbors[context.rng.nextInt(visitedNeighbors.length)]!;

    patches.push(
      ...carvePatch(cell, chosen.index, chosen.direction.wall, chosen.direction.opposite),
    );
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
      visitedCount: context.visitedCount,
      frontierSize: context.frontier.length,
    },
  };
}

function addFrontier(
  context: PrimContext,
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
