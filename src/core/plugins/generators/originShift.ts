import {
  carvePatch,
  neighbors,
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

interface OriginShiftContext {
  grid: Grid;
  rng: RandomSource;
  parent: Int32Array;
  order: number[];
  root: number;
  started: boolean;
  shiftsRemaining: number;
  current: number;
}

export const originShiftGenerator: GeneratorPlugin<
  GeneratorRunOptions,
  AlgorithmStepMeta
> = {
  id: "origin-shift",
  label: "Origin Shift",
  create({ grid, rng }) {
    const order = buildSerpentineOrder(grid, rng);
    const parent = new Int32Array(grid.cellCount);
    parent.fill(-1);

    for (let i = 1; i < order.length; i += 1) {
      const cell = order[i] as number;
      const p = order[i - 1] as number;
      parent[cell] = p;
    }

    const root = order[0] as number;

    const context: OriginShiftContext = {
      grid,
      rng,
      parent,
      order,
      root,
      started: false,
      shiftsRemaining: Math.max(1, grid.cellCount * 8),
      current: -1,
    };

    return {
      step: () => stepOriginShift(context),
    };
  },
};

function stepOriginShift(context: OriginShiftContext) {
  const patches: CellPatch[] = [];

  if (!context.started) {
    context.started = true;

    for (let i = 1; i < context.order.length; i += 1) {
      const cell = context.order[i] as number;
      const parent = context.parent[cell] as number;
      const [wallFrom, wallTo] = wallsBetween(context.grid, cell, parent);
      patches.push(...carvePatch(cell, parent, wallFrom, wallTo));
    }

    for (let i = 0; i < context.grid.cellCount; i += 1) {
      patches.push({
        index: i,
        overlaySet: OverlayFlag.Visited,
      });
    }

    context.current = context.root;
    patches.push({
      index: context.root,
      overlaySet: OverlayFlag.Current,
    });

    return {
      done: context.grid.cellCount <= 1,
      patches,
      meta: {
        line: 1,
        visitedCount: context.grid.cellCount,
        frontierSize: context.shiftsRemaining,
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

  if (context.shiftsRemaining <= 0) {
    return {
      done: true,
      patches,
      meta: {
        line: 6,
        visitedCount: context.grid.cellCount,
        frontierSize: 0,
      },
    };
  }

  const root = context.root;
  const options = neighbors(context.grid, root);
  if (options.length === 0) {
    return {
      done: true,
      patches,
      meta: {
        line: 6,
        visitedCount: context.grid.cellCount,
        frontierSize: 0,
      },
    };
  }

  const pick = options[context.rng.nextInt(options.length)]!;
  const nextRoot = pick.index;
  const oldParent = context.parent[nextRoot] as number;

  if (oldParent >= 0) {
    const [removeFrom, removeTo] = wallsBetween(context.grid, nextRoot, oldParent);
    patches.push({ index: nextRoot, wallSet: removeFrom });
    patches.push({ index: oldParent, wallSet: removeTo });
  }

  patches.push(...carvePatch(root, nextRoot, pick.direction.wall, pick.direction.opposite));

  context.parent[root] = nextRoot;
  context.parent[nextRoot] = -1;
  context.root = nextRoot;
  context.current = nextRoot;
  context.shiftsRemaining -= 1;

  patches.push({
    index: nextRoot,
    overlaySet: OverlayFlag.Current,
  });

  return {
    done: context.shiftsRemaining <= 0,
    patches,
    meta: {
      line: 5,
      visitedCount: context.grid.cellCount,
      frontierSize: context.shiftsRemaining,
    },
  };
}

function buildSerpentineOrder(grid: Grid, rng: RandomSource): number[] {
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

  throw new Error("Origin Shift found non-adjacent parent edge.");
}
