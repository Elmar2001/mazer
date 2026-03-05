import { carvePatch, OverlayFlag, WallFlag, type Grid } from "@/core/grid";
import type { CellPatch } from "@/core/patches";
import type { GeneratorPlugin } from "@/core/plugins/GeneratorPlugin";
import type {
  AlgorithmStepMeta,
  GeneratorRunOptions,
} from "@/core/plugins/types";
import type { RandomSource } from "@/core/rng";

interface UnicursalContext {
  grid: Grid;
  order: number[];
  started: boolean;
  cursor: number;
  visited: Uint8Array;
  visitedCount: number;
  current: number;
  prevFrontier: number[];
}

export const unicursalGenerator: GeneratorPlugin<
  GeneratorRunOptions,
  AlgorithmStepMeta
> = {
  id: "unicursal",
  label: "Unicursal",
  create({ grid, rng }) {
    const order = buildUnicursalOrder(grid, rng);

    const context: UnicursalContext = {
      grid,
      order,
      started: false,
      cursor: 0,
      visited: new Uint8Array(grid.cellCount),
      visitedCount: 0,
      current: -1,
      prevFrontier: [],
    };

    return {
      step: () => stepUnicursal(context),
    };
  },
};

function stepUnicursal(context: UnicursalContext) {
  const patches: CellPatch[] = [];

  if (!context.started) {
    context.started = true;

    const start = context.order[0] as number;
    context.visited[start] = 1;
    context.visitedCount = 1;
    context.current = start;
    context.prevFrontier = [start];

    patches.push({
      index: start,
      overlaySet: OverlayFlag.Visited | OverlayFlag.Frontier | OverlayFlag.Current,
    });

    return {
      done: context.order.length <= 1,
      patches,
      meta: {
        line: 1,
        visitedCount: context.visitedCount,
        frontierSize: 1,
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

  for (const index of context.prevFrontier) {
    patches.push({
      index,
      overlayClear: OverlayFlag.Frontier,
    });
  }
  context.prevFrontier = [];

  if (context.cursor >= context.order.length - 1) {
    return {
      done: true,
      patches,
      meta: {
        line: 5,
        visitedCount: context.visitedCount,
        frontierSize: 0,
      },
    };
  }

  const from = context.order[context.cursor] as number;
  const to = context.order[context.cursor + 1] as number;
  context.cursor += 1;

  const [wallFrom, wallTo] = wallsBetween(context.grid, from, to);
  patches.push(...carvePatch(from, to, wallFrom, wallTo));

  if (context.visited[to] === 0) {
    context.visited[to] = 1;
    context.visitedCount += 1;
    patches.push({ index: to, overlaySet: OverlayFlag.Visited | OverlayFlag.Frontier });
    context.prevFrontier = [to];
  }

  const done = context.cursor >= context.order.length - 1;

  if (!done) {
    context.current = to;
    patches.push({
      index: to,
      overlaySet: OverlayFlag.Current,
    });
  }

  return {
    done,
    patches,
    meta: {
      line: done ? 5 : 4,
      visitedCount: context.visitedCount,
      frontierSize: done ? 0 : 1,
    },
  };
}

function buildUnicursalOrder(grid: Grid, rng: RandomSource): number[] {
  const byRows = rng.nextInt(2) === 0;
  const flip = rng.nextInt(2) === 0;
  const order: number[] = [];

  if (byRows) {
    for (let y = 0; y < grid.height; y += 1) {
      const leftToRight = ((y & 1) === 0) !== flip;
      if (leftToRight) {
        for (let x = 0; x < grid.width; x += 1) {
          order.push(y * grid.width + x);
        }
      } else {
        for (let x = grid.width - 1; x >= 0; x -= 1) {
          order.push(y * grid.width + x);
        }
      }
    }

    return order;
  }

  for (let x = 0; x < grid.width; x += 1) {
    const topToBottom = ((x & 1) === 0) !== flip;
    if (topToBottom) {
      for (let y = 0; y < grid.height; y += 1) {
        order.push(y * grid.width + x);
      }
    } else {
      for (let y = grid.height - 1; y >= 0; y -= 1) {
        order.push(y * grid.width + x);
      }
    }
  }

  return order;
}

function wallsBetween(grid: Grid, from: number, to: number): [WallFlag, WallFlag] {
  const fx = from % grid.width;
  const fy = Math.floor(from / grid.width);
  const tx = to % grid.width;
  const ty = Math.floor(to / grid.width);

  if (tx === fx + 1 && ty === fy) {
    return [WallFlag.East, WallFlag.West];
  }

  if (tx === fx - 1 && ty === fy) {
    return [WallFlag.West, WallFlag.East];
  }

  if (ty === fy + 1 && tx === fx) {
    return [WallFlag.South, WallFlag.North];
  }

  if (ty === fy - 1 && tx === fx) {
    return [WallFlag.North, WallFlag.South];
  }

  throw new Error("Unicursal order contains non-adjacent cells.");
}
