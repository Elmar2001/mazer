import {
  carvePatch,
  neighbors,
  OverlayFlag,
  type Neighbor,
  type Grid,
} from "@/core/grid";
import type { CellPatch } from "@/core/patches";
import type { GeneratorPlugin } from "@/core/plugins/GeneratorPlugin";
import type {
  AlgorithmStepMeta,
  GeneratorRunOptions,
} from "@/core/plugins/types";
import type { RandomSource } from "@/core/rng";

interface DlaContext {
  grid: Grid;
  rng: RandomSource;
  aggregate: Uint8Array;
  aggregateCount: number;
  hasParticle: boolean;
  particleIndex: number;
  particleAge: number;
  killThreshold: number;
  microStepsPerStep: number;
  currentOverlayIndex: number;
  flashIndex: number;
}

export const dlaGenerator: GeneratorPlugin<
  GeneratorRunOptions,
  AlgorithmStepMeta
> = {
  id: "dla",
  label: "Diffusion-Limited Aggregation",
  create({ grid, rng }) {
    const aggregate = new Uint8Array(grid.cellCount);
    const seed = rng.nextInt(grid.cellCount);
    aggregate[seed] = 1;

    const context: DlaContext = {
      grid,
      rng,
      aggregate,
      aggregateCount: 1,
      hasParticle: false,
      particleIndex: seed,
      particleAge: 0,
      killThreshold: Math.max(8, grid.cellCount * 2),
      microStepsPerStep: Math.max(10, Math.min(50, Math.floor(grid.cellCount / 6))),
      currentOverlayIndex: -1,
      flashIndex: -1,
    };

    return {
      step: () => stepDla(context),
    };
  },
};

function stepDla(context: DlaContext) {
  const patches: CellPatch[] = [];

  if (context.currentOverlayIndex !== -1) {
    patches.push({
      index: context.currentOverlayIndex,
      overlayClear: OverlayFlag.Current,
    });
    context.currentOverlayIndex = -1;
  }

  if (context.flashIndex !== -1) {
    patches.push({
      index: context.flashIndex,
      overlayClear: OverlayFlag.Frontier,
    });
    context.flashIndex = -1;
  }

  if (context.aggregateCount >= context.grid.cellCount) {
    return {
      done: true,
      patches,
      meta: {
        line: 4,
        visitedCount: context.aggregateCount,
        frontierSize: 0,
      },
    };
  }

  if (!context.hasParticle) {
    launchParticle(context, patches);
  }

  let stuck = false;
  for (let step = 0; step < context.microStepsPerStep; step += 1) {
    if (!context.hasParticle) {
      break;
    }

    const adjacentAggregate = getAdjacentAggregateNeighbors(context);
    if (adjacentAggregate.length > 0) {
      stickParticle(
        context,
        adjacentAggregate[context.rng.nextInt(adjacentAggregate.length)] as Neighbor,
        patches,
      );
      break;
    }

    walkParticle(context, patches);
    if (!context.hasParticle) {
      break;
    }

    context.particleAge += 1;
    if (context.particleAge > context.killThreshold) {
      context.hasParticle = false;
      stuck = true;
      break;
    }
  }

  if (context.hasParticle) {
    context.currentOverlayIndex = context.particleIndex;
    patches.push({
      index: context.particleIndex,
      overlaySet: OverlayFlag.Current,
    });
  } else if (stuck) {
    launchParticle(context, patches);
    context.currentOverlayIndex = context.particleIndex;
    patches.push({
      index: context.particleIndex,
      overlaySet: OverlayFlag.Current,
    });
  }

  return {
    done: context.aggregateCount >= context.grid.cellCount,
    patches,
    meta: {
      line: 3,
      visitedCount: context.aggregateCount,
      frontierSize: context.hasParticle ? 1 : 0,
    },
  };
}

function launchParticle(context: DlaContext, patches: CellPatch[]): void {
  const index = pickRandomNonAggregate(context);
  context.particleIndex = index;
  context.particleAge = 0;
  context.hasParticle = true;

  patches.push({
    index,
    overlaySet: OverlayFlag.Current,
  });
  context.currentOverlayIndex = index;
}

function walkParticle(context: DlaContext, patches: CellPatch[]): void {
  const options = neighbors(context.grid, context.particleIndex);
  if (options.length === 0) {
    context.hasParticle = false;
    return;
  }

  const next = options[context.rng.nextInt(options.length)] as Neighbor;

  if (context.aggregate[next.index] === 1) {
    stickParticle(context, next, patches);
    return;
  }

  context.particleIndex = next.index;
}

function getAdjacentAggregateNeighbors(context: DlaContext): Neighbor[] {
  const output: Neighbor[] = [];

  for (const neighbor of neighbors(context.grid, context.particleIndex)) {
    if (context.aggregate[neighbor.index] === 1) {
      output.push(neighbor);
    }
  }

  return output;
}

function stickParticle(
  context: DlaContext,
  neighbor: Neighbor,
  patches: CellPatch[],
): void {
  if (context.aggregate[context.particleIndex] === 1) {
    context.hasParticle = false;
    return;
  }

  patches.push(
    ...carvePatch(
      context.particleIndex,
      neighbor.index,
      neighbor.direction.wall,
      neighbor.direction.opposite,
    ),
  );

  context.aggregate[context.particleIndex] = 1;
  context.aggregateCount += 1;

  patches.push({
    index: context.particleIndex,
    overlaySet: OverlayFlag.Visited | OverlayFlag.Frontier,
  });
  patches.push({
    index: neighbor.index,
    overlaySet: OverlayFlag.Visited,
  });

  context.flashIndex = context.particleIndex;
  context.hasParticle = false;
}

function pickRandomNonAggregate(context: DlaContext): number {
  for (let attempts = 0; attempts < context.grid.cellCount; attempts += 1) {
    const index = context.rng.nextInt(context.grid.cellCount);
    if (context.aggregate[index] === 0) {
      return index;
    }
  }

  for (let i = 0; i < context.grid.cellCount; i += 1) {
    if (context.aggregate[i] === 0) {
      return i;
    }
  }

  return 0;
}
