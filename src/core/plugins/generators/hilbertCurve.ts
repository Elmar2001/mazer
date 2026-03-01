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

interface HilbertContext {
  grid: Grid;
  visitOrder: number[];
  parentByCell: Int32Array;
  cursor: number;
  visitedCount: number;
  currentIndex: number;
}

export const hilbertCurveGenerator: GeneratorPlugin<
  GeneratorRunOptions,
  AlgorithmStepMeta
> = {
  id: "hilbert-curve",
  label: "Hilbert Curve",
  create({ grid }) {
    const { visitOrder, parentByCell } = buildHilbertVisitTree(grid);

    const context: HilbertContext = {
      grid,
      visitOrder,
      parentByCell,
      cursor: 0,
      visitedCount: 0,
      currentIndex: -1,
    };

    return {
      step: () => stepHilbert(context),
    };
  },
};

function stepHilbert(context: HilbertContext) {
  const patches: CellPatch[] = [];

  if (context.currentIndex !== -1) {
    patches.push({
      index: context.currentIndex,
      overlayClear: OverlayFlag.Current,
    });
    context.currentIndex = -1;
  }

  if (context.cursor >= context.visitOrder.length) {
    return {
      done: true,
      patches,
      meta: {
        line: 4,
        visitedCount: context.visitedCount,
        frontierSize: 0,
      },
    };
  }

  if (context.cursor === 0) {
    const root = context.visitOrder[0] as number;
    context.cursor = 1;
    context.visitedCount = 1;
    context.currentIndex = root;

    patches.push({
      index: root,
      overlaySet: OverlayFlag.Visited | OverlayFlag.Current,
    });

    return {
      done: false,
      patches,
      meta: {
        line: 1,
        visitedCount: context.visitedCount,
        frontierSize: context.visitOrder.length - context.visitedCount,
      },
    };
  }

  const cell = context.visitOrder[context.cursor] as number;
  const parent = context.parentByCell[cell] as number;

  patches.push(...carveBetween(context.grid.width, parent, cell));
  patches.push({
    index: parent,
    overlaySet: OverlayFlag.Visited,
  });
  patches.push({
    index: cell,
    overlaySet: OverlayFlag.Visited | OverlayFlag.Current,
  });

  context.currentIndex = cell;
  context.cursor += 1;
  context.visitedCount += 1;

  return {
    done: context.cursor >= context.visitOrder.length,
    patches,
    meta: {
      line: 2,
      visitedCount: context.visitedCount,
      frontierSize: context.visitOrder.length - context.visitedCount,
    },
  };
}

function buildHilbertVisitTree(grid: Grid): {
  visitOrder: number[];
  parentByCell: Int32Array;
} {
  const ranks = computeHilbertRanks(grid);
  const cells = Array.from({ length: grid.cellCount }, (_, i) => i);
  cells.sort((a, b) => (ranks[a] as number) - (ranks[b] as number));

  const parentByCell = new Int32Array(grid.cellCount);
  parentByCell.fill(-1);

  const visited = new Uint8Array(grid.cellCount);
  const visitOrder: number[] = [];

  const root = cells[0] as number;
  visited[root] = 1;
  parentByCell[root] = root;
  visitOrder.push(root);

  let remaining = grid.cellCount - 1;

  while (remaining > 0) {
    let progress = false;

    for (const cell of cells) {
      if (visited[cell] === 1) {
        continue;
      }

      const parent = pickVisitedNeighbor(cell, visited, ranks, grid.width, grid.height);
      if (parent === -1) {
        continue;
      }

      visited[cell] = 1;
      parentByCell[cell] = parent;
      visitOrder.push(cell);
      remaining -= 1;
      progress = true;
    }

    if (progress) {
      continue;
    }

    // Fallback for pathological ranking ties: attach one boundary cell.
    for (const cell of cells) {
      if (visited[cell] === 1) {
        continue;
      }

      const boundaryParent = pickAnyVisitedNeighbor(cell, visited, grid.width, grid.height);
      if (boundaryParent === -1) {
        continue;
      }

      visited[cell] = 1;
      parentByCell[cell] = boundaryParent;
      visitOrder.push(cell);
      remaining -= 1;
      break;
    }
  }

  return {
    visitOrder,
    parentByCell,
  };
}

function computeHilbertRanks(grid: Grid): Int32Array {
  const size = nextPowerOfTwo(Math.max(grid.width, grid.height));
  const ranks = new Int32Array(grid.cellCount);
  ranks.fill(Number.MAX_SAFE_INTEGER);

  let rank = 0;
  for (let distance = 0; distance < size * size; distance += 1) {
    const point = d2xy(size, distance);
    if (point.x >= grid.width || point.y >= grid.height) {
      continue;
    }

    const index = point.y * grid.width + point.x;
    ranks[index] = rank;
    rank += 1;
  }

  return ranks;
}

function d2xy(size: number, distance: number): { x: number; y: number } {
  let t = distance;
  let x = 0;
  let y = 0;

  for (let s = 1; s < size; s *= 2) {
    const rx = 1 & Math.floor(t / 2);
    const ry = 1 & (t ^ rx);
    const rotated = rotate(s, x, y, rx, ry);
    x = rotated.x + s * rx;
    y = rotated.y + s * ry;
    t = Math.floor(t / 4);
  }

  return { x, y };
}

function rotate(
  size: number,
  x: number,
  y: number,
  rx: number,
  ry: number,
): { x: number; y: number } {
  let outX = x;
  let outY = y;

  if (ry === 0) {
    if (rx === 1) {
      outX = size - 1 - outX;
      outY = size - 1 - outY;
    }

    const temp = outX;
    outX = outY;
    outY = temp;
  }

  return { x: outX, y: outY };
}

function pickVisitedNeighbor(
  cell: number,
  visited: Uint8Array,
  ranks: Int32Array,
  width: number,
  height: number,
): number {
  let best = -1;
  let bestScore = Number.POSITIVE_INFINITY;
  const cellRank = ranks[cell] as number;

  for (const neighbor of orthogonalNeighbors(cell, width, height)) {
    if (visited[neighbor] === 0) {
      continue;
    }

    const score = Math.abs(cellRank - (ranks[neighbor] as number));
    if (score < bestScore) {
      bestScore = score;
      best = neighbor;
    }
  }

  return best;
}

function pickAnyVisitedNeighbor(
  cell: number,
  visited: Uint8Array,
  width: number,
  height: number,
): number {
  for (const neighbor of orthogonalNeighbors(cell, width, height)) {
    if (visited[neighbor] === 1) {
      return neighbor;
    }
  }

  return -1;
}

function orthogonalNeighbors(
  cell: number,
  width: number,
  height: number,
): number[] {
  const x = cell % width;
  const y = Math.floor(cell / width);
  const out: number[] = [];

  if (x > 0) {
    out.push(cell - 1);
  }
  if (x + 1 < width) {
    out.push(cell + 1);
  }
  if (y > 0) {
    out.push(cell - width);
  }
  if (y + 1 < height) {
    out.push(cell + width);
  }

  return out;
}

function nextPowerOfTwo(value: number): number {
  let out = 1;
  while (out < value) {
    out *= 2;
  }
  return out;
}

function carveBetween(width: number, from: number, to: number): CellPatch[] {
  if (to === from + 1) {
    return carvePatch(from, to, WallFlag.East, WallFlag.West);
  }

  if (to === from - 1) {
    return carvePatch(from, to, WallFlag.West, WallFlag.East);
  }

  if (to === from + width) {
    return carvePatch(from, to, WallFlag.South, WallFlag.North);
  }

  return carvePatch(from, to, WallFlag.North, WallFlag.South);
}
