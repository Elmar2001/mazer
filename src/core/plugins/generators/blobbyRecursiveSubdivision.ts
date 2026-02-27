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

interface BlobbyEdge {
  from: number;
  to: number;
  wallFrom: WallFlag;
  wallTo: WallFlag;
}

interface BlobbyContext {
  edges: BlobbyEdge[];
  cursor: number;
  touched: Uint8Array;
  visitedCount: number;
  current: number;
}

interface BlobSplit {
  left: number[];
  right: number[];
  connector: [number, number] | null;
}

const LOCAL_SPLIT_THRESHOLD = 10;

export const blobbyRecursiveSubdivisionGenerator: GeneratorPlugin<
  GeneratorRunOptions,
  AlgorithmStepMeta
> = {
  id: "blobby-recursive-subdivision",
  label: "Blobby Recursive Subdivision",
  create({ grid, rng }) {
    const edges: BlobbyEdge[] = [];
    const cells = Array.from({ length: grid.cellCount }, (_, i) => i);
    buildBlobbyTree(grid, rng, cells, edges);
    if (edges.length === 0 && grid.cellCount > 1) {
      buildLocalBlobTree(grid, rng, cells, edges);
    }

    const context: BlobbyContext = {
      edges,
      cursor: 0,
      touched: new Uint8Array(grid.cellCount),
      visitedCount: 0,
      current: -1,
    };

    return {
      step: () => stepBlobby(context),
    };
  },
};

function stepBlobby(context: BlobbyContext) {
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

  const edge = context.edges[context.cursor] as BlobbyEdge;
  context.cursor += 1;
  const done = context.cursor >= context.edges.length;

  patches.push(...carvePatch(edge.from, edge.to, edge.wallFrom, edge.wallTo));
  markTouched(context, edge.from, patches);
  markTouched(context, edge.to, patches);

  if (!done) {
    context.current = edge.to;
    patches.push({
      index: edge.to,
      overlaySet: OverlayFlag.Current,
    });
  }

  return {
    done,
    patches,
    meta: {
      line: 5,
      visitedCount: context.visitedCount,
      frontierSize: context.edges.length - context.cursor,
    },
  };
}

function markTouched(
  context: BlobbyContext,
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
    overlaySet: OverlayFlag.Visited,
  });
}

function buildBlobbyTree(
  grid: Grid,
  rng: RandomSource,
  cells: number[],
  edges: BlobbyEdge[],
): void {
  if (cells.length <= 1) {
    return;
  }

  if (cells.length <= LOCAL_SPLIT_THRESHOLD) {
    buildLocalBlobTree(grid, rng, cells, edges);
    return;
  }

  const split = splitBlobbyRegion(grid, rng, cells);
  if (
    split.left.length === 0 ||
    split.right.length === 0 ||
    !split.connector
  ) {
    buildLocalBlobTree(grid, rng, cells, edges);
    return;
  }

  buildBlobbyTree(grid, rng, split.left, edges);
  buildBlobbyTree(grid, rng, split.right, edges);

  const [from, to] = split.connector;
  const walls = wallsBetween(grid, from, to);
  if (!walls) {
    buildLocalBlobTree(grid, rng, cells, edges);
    return;
  }

  edges.push({
    from,
    to,
    wallFrom: walls[0],
    wallTo: walls[1],
  });
}

function splitBlobbyRegion(
  grid: Grid,
  rng: RandomSource,
  cells: number[],
): BlobSplit {
  const inRegion = new Uint8Array(grid.cellCount);
  for (const cell of cells) {
    inRegion[cell] = 1;
  }

  const seedA = cells[rng.nextInt(cells.length)] as number;
  const seedB = farthestCell(grid, cells, seedA);

  const side = new Int8Array(grid.cellCount);
  side.fill(-1);
  side[seedA] = 0;
  side[seedB] = 1;

  const frontierA = [seedA];
  const frontierB = [seedB];

  let assigned = side[seedA] !== side[seedB] ? 2 : 1;

  while (assigned < cells.length) {
    const useA = pickGrowthSide(rng, frontierA.length, frontierB.length);
    const frontier = useA ? frontierA : frontierB;

    if (frontier.length === 0) {
      const fallback = useA ? frontierB : frontierA;
      if (fallback.length === 0) {
        break;
      }

      growFromFrontier(grid, fallback, side, inRegion, useA ? 1 : 0, () => {
        assigned += 1;
      });
      continue;
    }

    growFromFrontier(grid, frontier, side, inRegion, useA ? 0 : 1, () => {
      assigned += 1;
    });
  }

  if (!assignRemainingCells(grid, rng, cells, inRegion, side)) {
    const shuffled = [...cells];
    shuffleNumbers(shuffled, rng);
    const cut = Math.max(1, Math.floor(shuffled.length / 2));
    return {
      left: shuffled.slice(0, cut),
      right: shuffled.slice(cut),
      connector: null,
    };
  }

  const left: number[] = [];
  const right: number[] = [];

  for (const cell of cells) {
    if (side[cell] === 0) {
      left.push(cell);
    } else if (side[cell] === 1) {
      right.push(cell);
    }
  }

  if (left.length === 0 || right.length === 0) {
    const shuffled = [...cells];
    shuffleNumbers(shuffled, rng);
    const cut = Math.max(1, Math.floor(shuffled.length / 2));
    return {
      left: shuffled.slice(0, cut),
      right: shuffled.slice(cut),
      connector: null,
    };
  }

  const boundary: Array<[number, number]> = [];
  for (const cell of left) {
    for (const neighbor of neighbors(grid, cell)) {
      if (side[neighbor.index] !== 1) {
        continue;
      }

      boundary.push([cell, neighbor.index]);
    }
  }

  return {
    left,
    right,
    connector:
      boundary.length > 0
        ? (boundary[rng.nextInt(boundary.length)] as [number, number])
        : null,
  };
}

function pickGrowthSide(
  rng: RandomSource,
  frontierALength: number,
  frontierBLength: number,
): boolean {
  if (frontierALength === 0) {
    return false;
  }

  if (frontierBLength === 0) {
    return true;
  }

  if (frontierALength === frontierBLength) {
    return rng.nextInt(2) === 0;
  }

  return frontierALength < frontierBLength;
}

function growFromFrontier(
  grid: Grid,
  frontier: number[],
  side: Int8Array,
  inRegion: Uint8Array,
  targetSide: number,
  onAssign: () => void,
): void {
  const frontierPos = frontier.length - 1;
  const current = frontier[frontierPos] as number;
  frontier.pop();

  for (const neighbor of neighbors(grid, current)) {
    if (inRegion[neighbor.index] === 0 || side[neighbor.index] !== -1) {
      continue;
    }

    side[neighbor.index] = targetSide;
    frontier.push(neighbor.index);
    onAssign();
  }
}

function assignRemainingCells(
  grid: Grid,
  rng: RandomSource,
  cells: number[],
  inRegion: Uint8Array,
  side: Int8Array,
): boolean {
  let progressed = true;

  while (progressed) {
    progressed = false;

    for (const cell of cells) {
      if (side[cell] !== -1) {
        continue;
      }

      const assignedNeighbors = neighbors(grid, cell).filter(
        (neighbor) => inRegion[neighbor.index] === 1 && side[neighbor.index] !== -1,
      );

      if (assignedNeighbors.length === 0) {
        continue;
      }

      const pick = assignedNeighbors[rng.nextInt(assignedNeighbors.length)]!;
      side[cell] = side[pick.index] as number;
      progressed = true;
    }
  }

  for (const cell of cells) {
    if (side[cell] === -1) {
      return false;
    }
  }

  return true;
}

function buildLocalBlobTree(
  grid: Grid,
  rng: RandomSource,
  cells: number[],
  edges: BlobbyEdge[],
): void {
  const inRegion = new Uint8Array(grid.cellCount);
  for (const cell of cells) {
    inRegion[cell] = 1;
  }

  const visited = new Uint8Array(grid.cellCount);
  const start = cells[rng.nextInt(cells.length)] as number;
  const stack = [start];
  visited[start] = 1;

  while (stack.length > 0) {
    const current = stack[stack.length - 1] as number;
    const choices = neighbors(grid, current).filter(
      (neighbor) =>
        inRegion[neighbor.index] === 1 && visited[neighbor.index] === 0,
    );

    if (choices.length === 0) {
      stack.pop();
      continue;
    }

    const pick = choices[rng.nextInt(choices.length)]!;
    visited[pick.index] = 1;
    stack.push(pick.index);
    edges.push({
      from: current,
      to: pick.index,
      wallFrom: pick.direction.wall,
      wallTo: pick.direction.opposite,
    });
  }
}

function farthestCell(grid: Grid, cells: number[], start: number): number {
  let best = start;
  let bestDistance = -1;
  const sx = start % grid.width;
  const sy = Math.floor(start / grid.width);

  for (const cell of cells) {
    const x = cell % grid.width;
    const y = Math.floor(cell / grid.width);
    const distance = Math.abs(x - sx) + Math.abs(y - sy);
    if (distance > bestDistance) {
      bestDistance = distance;
      best = cell;
    }
  }

  return best;
}

function wallsBetween(
  grid: Grid,
  from: number,
  to: number,
): [WallFlag, WallFlag] | null {
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

  return null;
}

function shuffleNumbers(items: number[], rng: RandomSource): void {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = rng.nextInt(i + 1);
    const tmp = items[i] as number;
    items[i] = items[j] as number;
    items[j] = tmp;
  }
}
