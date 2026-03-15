import {
  carvePatch,
  neighbors,
  OverlayFlag,
  type Grid,
} from "@/core/grid";
import type { CellPatch } from "@/core/patches";
import type { GeneratorPlugin } from "@/core/plugins/GeneratorPlugin";
import type {
  AlgorithmStepMeta,
  GeneratorRunOptions,
} from "@/core/plugins/types";
import type { RandomSource } from "@/core/rng";

interface VortexCenter {
  x: number;
  y: number;
}

interface VortexContext {
  grid: Grid;
  rng: RandomSource;
  centers: VortexCenter[];
  started: boolean;
  stack: number[];
  visited: Uint8Array;
  visitedCount: number;
}

export const vortexGenerator: GeneratorPlugin<
  GeneratorRunOptions,
  AlgorithmStepMeta
> = {
  id: "vortex",
  label: "Vortex Maze (Xu/Kaplan-inspired DFS)",
  create({ grid, rng, options }) {
    const start =
      typeof options.startIndex === "number" &&
      options.startIndex >= 0 &&
      options.startIndex < grid.cellCount
        ? options.startIndex
        : rng.nextInt(grid.cellCount);

    const centerCount = Math.max(
      2,
      Math.min(8, Math.floor(Math.sqrt(grid.cellCount) / 6)),
    );

    const centers = Array.from({ length: centerCount }, () => ({
      x: rng.nextInt(grid.width),
      y: rng.nextInt(grid.height),
    }));

    const context: VortexContext = {
      grid,
      rng,
      centers,
      started: false,
      stack: [start],
      visited: new Uint8Array(grid.cellCount),
      visitedCount: 0,
    };

    return {
      step: () => stepVortex(context),
    };
  },
};

function stepVortex(context: VortexContext) {
  const patches: CellPatch[] = [];

  if (!context.started) {
    context.started = true;
    const start = context.stack[0] as number;
    context.visited[start] = 1;
    context.visitedCount = 1;

    patches.push({
      index: start,
      overlaySet: OverlayFlag.Visited | OverlayFlag.Frontier | OverlayFlag.Current,
    });

    return {
      done: false,
      patches,
      meta: {
        line: 1,
        visitedCount: context.visitedCount,
        frontierSize: context.stack.length,
      },
    };
  }

  if (context.stack.length === 0) {
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

  const current = context.stack[context.stack.length - 1] as number;
  const choices = neighbors(context.grid, current).filter(
    (neighbor) => context.visited[neighbor.index] === 0,
  );

  if (choices.length === 0) {
    const popped = context.stack.pop() as number;
    patches.push({
      index: popped,
      overlayClear: OverlayFlag.Current | OverlayFlag.Frontier,
    });

    if (context.stack.length > 0) {
      patches.push({
        index: context.stack[context.stack.length - 1] as number,
        overlaySet: OverlayFlag.Current,
      });
    }

    return {
      done: context.stack.length === 0,
      patches,
      meta: {
        line: 4,
        visitedCount: context.visitedCount,
        frontierSize: context.stack.length,
      },
    };
  }

  const pick = chooseVortexNeighbor(context, current, choices);
  context.visited[pick.index] = 1;
  context.visitedCount += 1;

  patches.push({
    index: current,
    overlayClear: OverlayFlag.Current,
  });
  patches.push(...carvePatch(current, pick.index, pick.direction.wall, pick.direction.opposite));
  patches.push({
    index: pick.index,
    overlaySet: OverlayFlag.Visited | OverlayFlag.Frontier | OverlayFlag.Current,
  });

  context.stack.push(pick.index);

  return {
    done: false,
    patches,
    meta: {
      line: 5,
      visitedCount: context.visitedCount,
      frontierSize: context.stack.length,
    },
  };
}

function chooseVortexNeighbor(
  context: VortexContext,
  current: number,
  candidates: ReturnType<typeof neighbors>,
) {
  const cx = current % context.grid.width;
  const cy = Math.floor(current / context.grid.width);
  const center = closestCenter(context.centers, cx, cy);

  let best = candidates[0]!;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const candidate of candidates) {
    const nx = candidate.x;
    const ny = candidate.y;

    const dirX = nx - cx;
    const dirY = ny - cy;

    const radialX = cx - center.x;
    const radialY = cy - center.y;

    const tangentX = -radialY;
    const tangentY = radialX;
    const tangentMagnitude = Math.abs(tangentX) + Math.abs(tangentY);

    let swirl = 0;
    if (tangentMagnitude > 0) {
      swirl = (tangentX * dirX + tangentY * dirY) / tangentMagnitude;
    }

    const inwardBias = -Math.abs(nx - center.x) - Math.abs(ny - center.y);
    const score = swirl * 2 + inwardBias * 0.1 + context.rng.next() * 0.25;

    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return best;
}

function closestCenter(
  centers: VortexCenter[],
  x: number,
  y: number,
): VortexCenter {
  let best = centers[0] as VortexCenter;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const center of centers) {
    const dx = center.x - x;
    const dy = center.y - y;
    const dist = dx * dx + dy * dy;

    if (dist < bestDistance) {
      bestDistance = dist;
      best = center;
    }
  }

  return best;
}
