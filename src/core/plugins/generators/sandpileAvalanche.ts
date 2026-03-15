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

/**
 * Abelian Sandpile Avalanche maze generator.
 *
 * Based on the Bak–Tang–Wiesenfeld sandpile model (self-organized
 * criticality). Sand grains are dropped one at a time on random cells.
 * When a cell's height reaches 4 it topples — redistributing one grain
 * to each neighbor — potentially triggering a cascade of further topples.
 * Passages are carved whenever a topple sends sand across a component
 * boundary (tracked by union-find). The maze emerges as a fossil record
 * of avalanche paths.
 */

const TOPPLE_THRESHOLD = 4;
const TAIL_ACCELERATION_RATIO = 3;

interface SandpileContext {
  grid: Grid;
  rng: RandomSource;
  sand: Uint8Array;
  parent: Int32Array;
  rank: Uint8Array;
  components: number;
  stepsSinceCarve: number;
  started: boolean;
}

export const sandpileAvalancheGenerator: GeneratorPlugin<
  GeneratorRunOptions,
  AlgorithmStepMeta
> = {
  id: "sandpile-avalanche",
  label: "Sandpile Avalanche (Self-Organized Criticality)",
  create({ grid, rng }) {
    const sand = new Uint8Array(grid.cellCount);
    const parent = new Int32Array(grid.cellCount);
    const rank = new Uint8Array(grid.cellCount);

    for (let i = 0; i < grid.cellCount; i++) {
      sand[i] = rng.nextInt(3) + 1;
      parent[i] = i;
    }

    const context: SandpileContext = {
      grid,
      rng,
      sand,
      parent,
      rank,
      components: grid.cellCount,
      stepsSinceCarve: 0,
      started: false,
    };

    return {
      step: () => stepSandpile(context),
    };
  },
};

function stepSandpile(ctx: SandpileContext) {
  const patches: CellPatch[] = [];

  if (!ctx.started) {
    ctx.started = true;
    return {
      done: ctx.grid.cellCount <= 1,
      patches,
      meta: {
        line: 1,
        visitedCount: 0,
        frontierSize: 0,
      },
    };
  }

  if (ctx.components <= 1) {
    for (let i = 0; i < ctx.grid.cellCount; i++) {
      const ov = ctx.grid.overlays[i] as number;
      if (ov & (OverlayFlag.Frontier | OverlayFlag.Current)) {
        patches.push({
          index: i,
          overlayClear: OverlayFlag.Frontier | OverlayFlag.Current,
        });
      }
    }
    return {
      done: true,
      patches,
      meta: {
        line: 6,
        visitedCount: ctx.grid.cellCount,
        frontierSize: 0,
      },
    };
  }

  // Drop a grain
  const dropTarget = chooseDropTarget(ctx);
  ctx.sand[dropTarget] += 1;
  patches.push({
    index: dropTarget,
    overlaySet: OverlayFlag.Current,
  });

  // Resolve cascade
  const toppleQueue: number[] = [];
  if (ctx.sand[dropTarget] >= TOPPLE_THRESHOLD) {
    toppleQueue.push(dropTarget);
  }

  let carvedThisStep = false;
  const toppled = new Uint8Array(ctx.grid.cellCount);

  while (toppleQueue.length > 0) {
    const cell = toppleQueue.shift()!;

    if (ctx.sand[cell] < TOPPLE_THRESHOLD) {
      continue;
    }

    ctx.sand[cell] -= TOPPLE_THRESHOLD;
    toppled[cell] = 1;

    patches.push({
      index: cell,
      overlaySet: OverlayFlag.Visited | OverlayFlag.Current,
    });

    const nbrs = neighbors(ctx.grid, cell);
    for (const n of nbrs) {
      ctx.sand[n.index] += 1;

      // Check for cross-component topple → carve passage
      const rootCell = find(cell, ctx.parent);
      const rootNeighbor = find(n.index, ctx.parent);
      if (rootCell !== rootNeighbor) {
        union(cell, n.index, ctx.parent, ctx.rank);
        ctx.components--;
        carvedThisStep = true;

        patches.push(
          ...carvePatch(cell, n.index, n.direction.wall, n.direction.opposite),
        );
        patches.push({
          index: n.index,
          overlaySet: OverlayFlag.Visited,
        });
      }

      // Enqueue neighbor if it now exceeds threshold
      if (ctx.sand[n.index] >= TOPPLE_THRESHOLD && toppled[n.index] === 0) {
        toppleQueue.push(n.index);
      }
    }
  }

  // Clear current markers from previous step (batch clear at start of next)
  // Track carve drought for tail acceleration
  if (carvedThisStep) {
    ctx.stepsSinceCarve = 0;
  } else {
    ctx.stepsSinceCarve++;
  }

  const done = ctx.components <= 1;

  if (done) {
    for (let i = 0; i < ctx.grid.cellCount; i++) {
      const ov = ctx.grid.overlays[i] as number;
      if (ov & (OverlayFlag.Frontier | OverlayFlag.Current)) {
        patches.push({
          index: i,
          overlayClear: OverlayFlag.Frontier | OverlayFlag.Current,
        });
      }
    }
  }

  return {
    done,
    patches,
    meta: {
      line: done ? 6 : carvedThisStep ? 5 : 2,
      visitedCount: ctx.grid.cellCount - ctx.components,
      frontierSize: countBoundaryCells(ctx),
    },
  };
}

/**
 * Choose where to drop the next grain.
 * Normally random, but if we've gone too long without a carve,
 * bias toward cells adjacent to a different component.
 */
function chooseDropTarget(ctx: SandpileContext): number {
  const threshold = Math.floor(ctx.grid.cellCount / TAIL_ACCELERATION_RATIO);

  if (ctx.stepsSinceCarve < threshold) {
    return ctx.rng.nextInt(ctx.grid.cellCount);
  }

  // Tail acceleration: find cells at component boundaries
  const boundaryCells: number[] = [];
  for (let i = 0; i < ctx.grid.cellCount; i++) {
    const rootI = find(i, ctx.parent);
    for (const n of neighbors(ctx.grid, i)) {
      if (find(n.index, ctx.parent) !== rootI) {
        boundaryCells.push(i);
        break;
      }
    }
  }

  if (boundaryCells.length > 0) {
    return boundaryCells[ctx.rng.nextInt(boundaryCells.length)] as number;
  }

  return ctx.rng.nextInt(ctx.grid.cellCount);
}

/** Count cells adjacent to a different component (for frontier metric). */
function countBoundaryCells(ctx: SandpileContext): number {
  let count = 0;
  for (let i = 0; i < ctx.grid.cellCount; i++) {
    const rootI = find(i, ctx.parent);
    for (const n of neighbors(ctx.grid, i)) {
      if (find(n.index, ctx.parent) !== rootI) {
        count++;
        break;
      }
    }
  }
  return count;
}

function find(index: number, parent: Int32Array): number {
  let root = index;
  while (parent[root] !== root) {
    root = parent[root] as number;
  }

  let node = index;
  while (parent[node] !== node) {
    const next = parent[node] as number;
    parent[node] = root;
    node = next;
  }

  return root;
}

function union(
  a: number,
  b: number,
  parent: Int32Array,
  rank: Uint8Array,
): boolean {
  const rootA = find(a, parent);
  const rootB = find(b, parent);

  if (rootA === rootB) {
    return false;
  }

  if ((rank[rootA] as number) < (rank[rootB] as number)) {
    parent[rootA] = rootB;
  } else if ((rank[rootA] as number) > (rank[rootB] as number)) {
    parent[rootB] = rootA;
  } else {
    parent[rootB] = rootA;
    (rank[rootA] as number) += 1;
  }

  return true;
}
