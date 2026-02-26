import {
  carvePatch,
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

interface BspEdge {
  from: number;
  to: number;
  wallFrom: WallFlag;
  wallTo: WallFlag;
}

interface BspContext {
  edges: BspEdge[];
  cursor: number;
  touched: Uint8Array;
  visitedCount: number;
  current: number;
}

export const bspGenerator: GeneratorPlugin<
  GeneratorRunOptions,
  AlgorithmStepMeta
> = {
  id: "bsp",
  label: "Binary Space Partitioning (BSP)",
  create({ grid, rng }) {
    const edges: BspEdge[] = [];
    buildBspTree(grid, rng, 0, 0, grid.width, grid.height, edges);

    const context: BspContext = {
      edges,
      cursor: 0,
      touched: new Uint8Array(grid.cellCount),
      visitedCount: 0,
      current: -1,
    };

    return {
      step: () => stepBsp(context),
    };
  },
};

function stepBsp(context: BspContext) {
  const patches: CellPatch[] = [];

  if (context.current !== -1) {
    patches.push({
      index: context.current,
      overlayClear: OverlayFlag.Current,
    });
    context.current = -1;
  }

  if (context.cursor >= context.edges.length) {
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

  const edge = context.edges[context.cursor] as BspEdge;
  context.cursor += 1;

  patches.push(...carvePatch(edge.from, edge.to, edge.wallFrom, edge.wallTo));
  markTouched(context, edge.from, patches);
  markTouched(context, edge.to, patches);

  context.current = edge.to;
  patches.push({
    index: edge.to,
    overlaySet: OverlayFlag.Current,
  });

  return {
    done: context.cursor >= context.edges.length,
    patches,
    meta: {
      line: 5,
      visitedCount: context.visitedCount,
      frontierSize: context.edges.length - context.cursor,
    },
  };
}

function markTouched(
  context: BspContext,
  index: number,
  patches: CellPatch[],
): void {
  if (context.touched[index] === 1) {
    return;
  }

  context.touched[index] = 1;
  context.visitedCount += 1;
  patches.push({
    index,
    overlaySet: OverlayFlag.Visited | OverlayFlag.Frontier,
  });
}

function buildBspTree(
  grid: Grid,
  rng: RandomSource,
  x: number,
  y: number,
  width: number,
  height: number,
  edges: BspEdge[],
): void {
  if (width <= 0 || height <= 0) {
    return;
  }

  if (width === 1 && height === 1) {
    return;
  }

  const canSplitVertically = width > 1;
  const canSplitHorizontally = height > 1;

  if (!canSplitVertically && !canSplitHorizontally) {
    return;
  }

  const splitHorizontally = chooseSplitOrientation(
    rng,
    width,
    height,
    canSplitHorizontally,
    canSplitVertically,
  );

  if (splitHorizontally) {
    const splitY = y + 1 + rng.nextInt(height - 1);
    const topHeight = splitY - y;
    const bottomHeight = y + height - splitY;

    buildBspTree(grid, rng, x, y, width, topHeight, edges);
    buildBspTree(grid, rng, x, splitY, width, bottomHeight, edges);

    const connectorX = x + rng.nextInt(width);
    const topCell = (splitY - 1) * grid.width + connectorX;
    const bottomCell = splitY * grid.width + connectorX;
    edges.push({
      from: topCell,
      to: bottomCell,
      wallFrom: WallFlag.South,
      wallTo: WallFlag.North,
    });
    return;
  }

  const splitX = x + 1 + rng.nextInt(width - 1);
  const leftWidth = splitX - x;
  const rightWidth = x + width - splitX;

  buildBspTree(grid, rng, x, y, leftWidth, height, edges);
  buildBspTree(grid, rng, splitX, y, rightWidth, height, edges);

  const connectorY = y + rng.nextInt(height);
  const leftCell = connectorY * grid.width + (splitX - 1);
  const rightCell = connectorY * grid.width + splitX;
  edges.push({
    from: leftCell,
    to: rightCell,
    wallFrom: WallFlag.East,
    wallTo: WallFlag.West,
  });
}

function chooseSplitOrientation(
  rng: RandomSource,
  width: number,
  height: number,
  canSplitHorizontally: boolean,
  canSplitVertically: boolean,
): boolean {
  if (!canSplitVertically) {
    return true;
  }

  if (!canSplitHorizontally) {
    return false;
  }

  if (width > height) {
    return false;
  }

  if (height > width) {
    return true;
  }

  return rng.nextInt(2) === 0;
}
