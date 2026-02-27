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
 * Hydraulic Erosion maze generator.
 *
 * Generates a smooth heightmap, then builds a spanning tree by always
 * connecting the lowest-elevation frontier cell next (water flows
 * downhill). Each carved passage erodes the terrain around it,
 * attracting future growth toward existing "rivers." The result is
 * dendritic (river-network) branching with hierarchical corridors.
 */

interface ControlPoint {
  x: number;
  y: number;
  h: number;
}

interface ErosionContext {
  grid: Grid;
  rng: RandomSource;
  height: Float32Array;
  inTree: Uint8Array;
  frontier: number[];
  visitedCount: number;
  started: boolean;
}

const EROSION_RATE = 0.03;
const CONTROL_POINT_SCALE = 3;

export const erosionGenerator: GeneratorPlugin<
  GeneratorRunOptions,
  AlgorithmStepMeta
> = {
  id: "erosion",
  label: "Erosion (Hydraulic)",
  create({ grid, rng, options }) {
    const height = buildHeightmap(grid, rng);

    const outlet =
      typeof options.startIndex === "number" &&
      options.startIndex >= 0 &&
      options.startIndex < grid.cellCount
        ? options.startIndex
        : findMinIndex(height);

    const context: ErosionContext = {
      grid,
      rng,
      height,
      inTree: new Uint8Array(grid.cellCount),
      frontier: [],
      visitedCount: 0,
      started: false,
    };

    context.inTree[outlet] = 1;
    context.visitedCount = 1;

    for (const n of neighbors(grid, outlet)) {
      context.frontier.push(n.index);
    }

    return {
      step: () => stepErosion(context, outlet),
    };
  },
};

function stepErosion(ctx: ErosionContext, outlet: number) {
  const patches: CellPatch[] = [];

  if (!ctx.started) {
    ctx.started = true;
    patches.push({
      index: outlet,
      overlaySet: OverlayFlag.Visited | OverlayFlag.Current,
    });
    return {
      done: false,
      patches,
      meta: {
        line: 1,
        visitedCount: ctx.visitedCount,
        frontierSize: ctx.frontier.length,
      },
    };
  }

  // Remove stale frontier entries and find the cell with minimum height
  let bestIdx = -1;
  let bestHeight = Infinity;
  let bestPos = -1;

  for (let i = ctx.frontier.length - 1; i >= 0; i--) {
    const fi = ctx.frontier[i] as number;
    if (ctx.inTree[fi] === 1) {
      // Remove stale entry by swapping with last
      ctx.frontier[i] = ctx.frontier[ctx.frontier.length - 1] as number;
      ctx.frontier.pop();
      continue;
    }
    const h = ctx.height[fi] as number;
    if (h < bestHeight) {
      bestHeight = h;
      bestIdx = fi;
      bestPos = i;
    }
  }

  if (bestIdx === -1) {
    return {
      done: true,
      patches,
      meta: {
        line: 6,
        visitedCount: ctx.visitedCount,
        frontierSize: 0,
      },
    };
  }

  // Remove chosen cell from frontier
  ctx.frontier[bestPos] = ctx.frontier[ctx.frontier.length - 1] as number;
  ctx.frontier.pop();

  // Find the tree-neighbor with steepest descent (lowest height)
  const nbrs = neighbors(ctx.grid, bestIdx);
  let connectTo = -1;
  let connectHeight = Infinity;
  let connectWall = 0;
  let connectOpposite = 0;

  for (const n of nbrs) {
    if (ctx.inTree[n.index] === 1) {
      const nh = ctx.height[n.index] as number;
      if (nh < connectHeight) {
        connectHeight = nh;
        connectTo = n.index;
        connectWall = n.direction.wall;
        connectOpposite = n.direction.opposite;
      }
    }
  }

  if (connectTo === -1) {
    // Edge case: frontier cell has no tree-neighbor (shouldn't happen, but safety)
    return {
      done: ctx.visitedCount >= ctx.grid.cellCount,
      patches,
      meta: {
        line: 3,
        visitedCount: ctx.visitedCount,
        frontierSize: ctx.frontier.length,
      },
    };
  }

  // Carve passage
  patches.push(...carvePatch(bestIdx, connectTo, connectWall, connectOpposite));

  // Clear previous current marker on the connect-to cell, mark new cell
  patches.push({
    index: connectTo,
    overlayClear: OverlayFlag.Current,
  });
  patches.push({
    index: bestIdx,
    overlaySet: OverlayFlag.Visited | OverlayFlag.Frontier | OverlayFlag.Current,
  });

  // Update state
  ctx.inTree[bestIdx] = 1;
  ctx.visitedCount += 1;

  // Erosion feedback: lower height of unvisited neighbors
  for (const n of nbrs) {
    if (ctx.inTree[n.index] === 0) {
      ctx.height[n.index] -= EROSION_RATE;
      ctx.frontier.push(n.index);
    }
  }

  const done = ctx.visitedCount >= ctx.grid.cellCount;

  if (done) {
    // Clear frontier/current overlays on completion
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
      line: done ? 6 : 4,
      visitedCount: ctx.visitedCount,
      frontierSize: ctx.frontier.length,
    },
  };
}

/** Build a smooth heightmap using inverse-distance-weighted control points. */
function buildHeightmap(grid: Grid, rng: RandomSource): Float32Array {
  const count = Math.max(
    3,
    Math.floor(Math.sqrt(grid.cellCount) / CONTROL_POINT_SCALE),
  );

  const points: ControlPoint[] = Array.from({ length: count }, () => ({
    x: rng.nextInt(grid.width),
    y: rng.nextInt(grid.height),
    h: rng.next(),
  }));

  const height = new Float32Array(grid.cellCount);

  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      let weightSum = 0;
      let valueSum = 0;

      for (const p of points) {
        const dx = x - p.x;
        const dy = y - p.y;
        const distSq = dx * dx + dy * dy;
        // Avoid division by zero; cells at control points get that height exactly
        const w = 1 / (distSq + 1);
        weightSum += w;
        valueSum += w * p.h;
      }

      const idx = y * grid.width + x;
      // Base interpolated height + small per-cell jitter for local variation
      height[idx] = valueSum / weightSum + rng.next() * 0.02;
    }
  }

  return height;
}

/** Find the index of the minimum value in a Float32Array. */
function findMinIndex(arr: Float32Array): number {
  let minIdx = 0;
  let minVal = arr[0] as number;

  for (let i = 1; i < arr.length; i++) {
    if ((arr[i] as number) < minVal) {
      minVal = arr[i] as number;
      minIdx = i;
    }
  }

  return minIdx;
}
