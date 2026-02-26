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

interface CellularContext {
  grid: Grid;
  rng: RandomSource;
  caveMask: Uint8Array;
  started: boolean;
  stack: number[];
  visited: Uint8Array;
  visitedCount: number;
  current: number;
}

export const cellularAutomataGenerator: GeneratorPlugin<
  GeneratorRunOptions,
  AlgorithmStepMeta
> = {
  id: "cellular-automata",
  label: "Cellular Automata (Cave-Biased)",
  implementationKind: "hybrid",
  create({ grid, rng, options }) {
    const start =
      typeof options.startIndex === "number" &&
      options.startIndex >= 0 &&
      options.startIndex < grid.cellCount
        ? options.startIndex
        : rng.nextInt(grid.cellCount);

    const context: CellularContext = {
      grid,
      rng,
      caveMask: buildCaveMask(grid, rng),
      started: false,
      stack: [start],
      visited: new Uint8Array(grid.cellCount),
      visitedCount: 0,
      current: -1,
    };

    return {
      step: () => stepCellular(context),
    };
  },
};

function stepCellular(context: CellularContext) {
  const patches: CellPatch[] = [];

  if (!context.started) {
    context.started = true;

    const start = context.stack[0] as number;
    context.visited[start] = 1;
    context.visitedCount = 1;
    context.current = start;

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

  if (context.current !== -1) {
    patches.push({
      index: context.current,
      overlayClear: OverlayFlag.Current,
    });
    context.current = -1;
  }

  if (context.stack.length === 0) {
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

  const from = context.stack[context.stack.length - 1] as number;
  const candidates = neighbors(context.grid, from).filter(
    (neighbor) => context.visited[neighbor.index] === 0,
  );

  if (candidates.length === 0) {
    const popped = context.stack.pop() as number;
    patches.push({
      index: popped,
      overlayClear: OverlayFlag.Frontier,
    });

    if (context.stack.length > 0) {
      const top = context.stack[context.stack.length - 1] as number;
      context.current = top;
      patches.push({
        index: top,
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

  const favored = candidates.filter(
    (neighbor) => context.caveMask[neighbor.index] === context.caveMask[from],
  );

  const chooseFavored = favored.length > 0 && context.rng.nextInt(100) < 80;
  const pickPool = chooseFavored ? favored : candidates;
  const pick = pickPool[context.rng.nextInt(pickPool.length)]!;

  context.visited[pick.index] = 1;
  context.visitedCount += 1;
  context.stack.push(pick.index);
  context.current = pick.index;

  patches.push(...carvePatch(from, pick.index, pick.direction.wall, pick.direction.opposite));
  patches.push({
    index: pick.index,
    overlaySet: OverlayFlag.Visited | OverlayFlag.Frontier | OverlayFlag.Current,
  });

  return {
    done: false,
    patches,
    meta: {
      line: chooseFavored ? 5 : 3,
      visitedCount: context.visitedCount,
      frontierSize: context.stack.length,
    },
  };
}

function buildCaveMask(grid: Grid, rng: RandomSource): Uint8Array {
  let current = new Uint8Array(grid.cellCount);

  for (let i = 0; i < grid.cellCount; i += 1) {
    current[i] = rng.nextInt(100) < 45 ? 1 : 0;
  }

  for (let iteration = 0; iteration < 4; iteration += 1) {
    const next = new Uint8Array(grid.cellCount);

    for (let y = 0; y < grid.height; y += 1) {
      for (let x = 0; x < grid.width; x += 1) {
        const index = y * grid.width + x;
        const aliveNeighbors = countAliveNeighbors(current, grid, x, y);

        if (current[index] === 1) {
          next[index] = aliveNeighbors >= 4 ? 1 : 0;
        } else {
          next[index] = aliveNeighbors >= 5 ? 1 : 0;
        }
      }
    }

    current = next;
  }

  return current;
}

function countAliveNeighbors(
  cells: Uint8Array,
  grid: Grid,
  x: number,
  y: number,
): number {
  let count = 0;

  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) {
        continue;
      }

      const nx = x + dx;
      const ny = y + dy;

      if (nx < 0 || nx >= grid.width || ny < 0 || ny >= grid.height) {
        count += 1;
        continue;
      }

      const index = ny * grid.width + nx;
      count += cells[index] as number;
    }
  }

  return count;
}
