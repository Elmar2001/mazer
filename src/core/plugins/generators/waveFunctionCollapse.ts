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

const TILE_COUNT = 16;
const FULL_TILE_MASK = (1 << TILE_COUNT) - 1;
const COLLAPSE_LINE = 1;
const APPLY_LINE = 2;

interface WfcEdge {
  from: number;
  to: number;
  wallFrom: WallFlag;
  wallTo: WallFlag;
}

interface WfcContext {
  grid: Grid;
  rng: RandomSource;
  optionsMask: Uint16Array;
  collapsedCount: number;
  phase: "collapse" | "apply" | "done";
  currentIndex: number;
  frontierIndices: number[];
  applyEdges: WfcEdge[];
  applyCursor: number;
}

const WALL_BY_DIRECTION = [
  WallFlag.North,
  WallFlag.East,
  WallFlag.South,
  WallFlag.West,
] as const;
const OPPOSITE_BY_DIRECTION = [
  WallFlag.South,
  WallFlag.West,
  WallFlag.North,
  WallFlag.East,
] as const;

const COMPATIBLE_TILE_MASKS: number[][] = buildCompatibleTileMasks();

export const waveFunctionCollapseGenerator: GeneratorPlugin<
  GeneratorRunOptions,
  AlgorithmStepMeta
> = {
  id: "wave-function-collapse",
  label: "Wave Function Collapse",
  create({ grid, rng }) {
    const context: WfcContext = {
      grid,
      rng,
      optionsMask: new Uint16Array(grid.cellCount),
      collapsedCount: 0,
      phase: "collapse",
      currentIndex: -1,
      frontierIndices: [],
      applyEdges: [],
      applyCursor: 0,
    };

    context.optionsMask.fill(FULL_TILE_MASK);

    return {
      step: () => stepWaveFunctionCollapse(context),
    };
  },
};

function stepWaveFunctionCollapse(context: WfcContext) {
  const patches: CellPatch[] = [];

  clearTransientOverlays(context, patches);

  if (context.phase === "done") {
    return {
      done: true,
      patches,
      meta: {
        line: APPLY_LINE,
        visitedCount: context.grid.cellCount,
        frontierSize: 0,
      },
    };
  }

  if (context.phase === "collapse") {
    if (context.collapsedCount >= context.grid.cellCount) {
      prepareFinalEdges(context);
      context.phase = "apply";
    } else {
      const target = pickLowestEntropyCell(context);

      if (target === -1) {
        prepareFinalEdges(context);
        context.phase = "apply";
      } else {
        collapseCell(context, target, patches);
        propagateConstraints(context, target, patches);

        if (context.collapsedCount >= context.grid.cellCount) {
          prepareFinalEdges(context);
          context.phase = "apply";
        }
      }
    }

    return {
      done: false,
      patches,
      meta: {
        line: COLLAPSE_LINE,
        visitedCount: context.collapsedCount,
        frontierSize: context.frontierIndices.length,
      },
    };
  }

  const batchSize = 24;
  let carved = 0;

  while (
    context.applyCursor < context.applyEdges.length &&
    carved < batchSize
  ) {
    const edge = context.applyEdges[context.applyCursor] as WfcEdge;
    context.applyCursor += 1;
    carved += 1;

    patches.push(...carvePatch(edge.from, edge.to, edge.wallFrom, edge.wallTo));
    patches.push({
      index: edge.from,
      overlaySet: OverlayFlag.Visited,
    });
    patches.push({
      index: edge.to,
      overlaySet: OverlayFlag.Visited,
    });
  }

  if (context.applyCursor >= context.applyEdges.length) {
    context.phase = "done";
  }

  return {
    done: context.phase === "done",
    patches,
    meta: {
      line: APPLY_LINE,
      visitedCount: context.grid.cellCount,
      frontierSize: Math.max(0, context.applyEdges.length - context.applyCursor),
    },
  };
}

function clearTransientOverlays(
  context: WfcContext,
  patches: CellPatch[],
): void {
  if (context.currentIndex !== -1) {
    patches.push({
      index: context.currentIndex,
      overlayClear: OverlayFlag.Current,
    });
    context.currentIndex = -1;
  }

  for (const index of context.frontierIndices) {
    patches.push({
      index,
      overlayClear: OverlayFlag.Frontier,
    });
  }

  context.frontierIndices = [];
}

function pickLowestEntropyCell(context: WfcContext): number {
  let bestIndex = -1;
  let bestEntropy = Number.POSITIVE_INFINITY;

  for (let i = 0; i < context.grid.cellCount; i += 1) {
    const mask = context.optionsMask[i] as number;
    const count = bitCount(mask);
    if (count <= 1) {
      continue;
    }

    const entropy = count + context.rng.next() * 1e-3;
    if (entropy < bestEntropy) {
      bestEntropy = entropy;
      bestIndex = i;
    }
  }

  return bestIndex;
}

function collapseCell(
  context: WfcContext,
  index: number,
  patches: CellPatch[],
): void {
  const mask = context.optionsMask[index] as number;
  const chosenTile = chooseTile(mask, context.rng);
  context.optionsMask[index] = 1 << chosenTile;
  context.collapsedCount += 1;
  context.currentIndex = index;

  patches.push({
    index,
    overlaySet: OverlayFlag.Visited | OverlayFlag.Current,
  });
}

function propagateConstraints(
  context: WfcContext,
  rootIndex: number,
  patches: CellPatch[],
): void {
  const queue = [rootIndex];
  const inQueue = new Uint8Array(context.grid.cellCount);
  const frontierFlags = new Uint8Array(context.grid.cellCount);
  inQueue[rootIndex] = 1;

  let head = 0;
  while (head < queue.length) {
    const current = queue[head] as number;
    head += 1;

    const currentMask = context.optionsMask[current] as number;

    for (const neighbor of neighbors(context.grid, current)) {
      const directionIndex = directionNameToIndex(neighbor.direction.name);
      const compatibleMask = allowedMaskForDirection(currentMask, directionIndex);
      const oldMask = context.optionsMask[neighbor.index] as number;
      const nextMask = oldMask & compatibleMask;

      if (nextMask === 0 || nextMask === oldMask) {
        continue;
      }

      const oldCount = bitCount(oldMask);
      const nextCount = bitCount(nextMask);
      context.optionsMask[neighbor.index] = nextMask;

      if (oldCount > 1 && nextCount === 1) {
        context.collapsedCount += 1;
        patches.push({
          index: neighbor.index,
          overlaySet: OverlayFlag.Visited,
        });
      }

      if (inQueue[neighbor.index] === 0) {
        inQueue[neighbor.index] = 1;
        queue.push(neighbor.index);
      }

      if (frontierFlags[neighbor.index] === 0) {
        frontierFlags[neighbor.index] = 1;
        context.frontierIndices.push(neighbor.index);
      }
    }
  }

  for (const index of context.frontierIndices) {
    patches.push({
      index,
      overlaySet: OverlayFlag.Frontier,
    });
  }
}

function prepareFinalEdges(context: WfcContext): void {
  const allEdges = enumerateGridEdges(context.grid);
  const preferredEdges: WfcEdge[] = [];
  const remainingEdges: WfcEdge[] = [];

  for (const edge of allEdges) {
    const fromTile = firstTileFromMask(context.optionsMask[edge.from] as number);
    const toTile = firstTileFromMask(context.optionsMask[edge.to] as number);

    const fromOpen = (fromTile & edge.wallFrom) === 0;
    const toOpen = (toTile & edge.wallTo) === 0;

    if (fromOpen && toOpen) {
      preferredEdges.push(edge);
    } else {
      remainingEdges.push(edge);
    }
  }

  const parent = new Int32Array(context.grid.cellCount);
  const rank = new Uint8Array(context.grid.cellCount);
  for (let i = 0; i < context.grid.cellCount; i += 1) {
    parent[i] = i;
  }

  const selectedEdges: WfcEdge[] = [];

  for (const edge of preferredEdges) {
    selectedEdges.push(edge);
    union(edge.from, edge.to, parent, rank);
  }

  shuffleInPlace(remainingEdges, context.rng);

  for (const edge of remainingEdges) {
    if (union(edge.from, edge.to, parent, rank)) {
      selectedEdges.push(edge);
    }
  }

  if (selectedEdges.length <= context.grid.cellCount - 1) {
    const extra = pickExtraEdge(selectedEdges, allEdges, context.rng);
    if (extra) {
      selectedEdges.push(extra);
    }
  }

  context.applyEdges = selectedEdges;
  context.applyCursor = 0;
}

function enumerateGridEdges(grid: Grid): WfcEdge[] {
  const edges: WfcEdge[] = [];

  for (let i = 0; i < grid.cellCount; i += 1) {
    const x = i % grid.width;
    const y = Math.floor(i / grid.width);

    if (x + 1 < grid.width) {
      edges.push({
        from: i,
        to: i + 1,
        wallFrom: WallFlag.East,
        wallTo: WallFlag.West,
      });
    }

    if (y + 1 < grid.height) {
      edges.push({
        from: i,
        to: i + grid.width,
        wallFrom: WallFlag.South,
        wallTo: WallFlag.North,
      });
    }
  }

  return edges;
}

function pickExtraEdge(
  selectedEdges: WfcEdge[],
  allEdges: WfcEdge[],
  rng: RandomSource,
): WfcEdge | null {
  const used = new Set<string>();
  for (const edge of selectedEdges) {
    used.add(edgeKey(edge));
  }

  const candidates = allEdges.filter((edge) => !used.has(edgeKey(edge)));
  if (candidates.length === 0) {
    return null;
  }

  return candidates[rng.nextInt(candidates.length)] as WfcEdge;
}

function edgeKey(edge: WfcEdge): string {
  return `${edge.from}:${edge.to}`;
}

function buildCompatibleTileMasks(): number[][] {
  const table: number[][] = Array.from({ length: 4 }, () =>
    new Array(TILE_COUNT).fill(0),
  );

  for (let dir = 0; dir < 4; dir += 1) {
    const fromWall = WALL_BY_DIRECTION[dir] as number;
    const toWall = OPPOSITE_BY_DIRECTION[dir] as number;

    for (let tile = 0; tile < TILE_COUNT; tile += 1) {
      let compatibleMask = 0;

      const fromIsWall = (tile & fromWall) !== 0;

      for (let other = 0; other < TILE_COUNT; other += 1) {
        const toIsWall = (other & toWall) !== 0;
        if (fromIsWall === toIsWall) {
          compatibleMask |= 1 << other;
        }
      }

      table[dir]![tile] = compatibleMask;
    }
  }

  return table;
}

function allowedMaskForDirection(mask: number, dir: number): number {
  let result = 0;

  for (let tile = 0; tile < TILE_COUNT; tile += 1) {
    if (((mask >> tile) & 1) === 0) {
      continue;
    }

    result |= COMPATIBLE_TILE_MASKS[dir]![tile] as number;
  }

  return result;
}

function firstTileFromMask(mask: number): number {
  for (let tile = 0; tile < TILE_COUNT; tile += 1) {
    if (((mask >> tile) & 1) === 1) {
      return tile;
    }
  }

  return 0;
}

function chooseTile(mask: number, rng: RandomSource): number {
  const options: number[] = [];

  for (let tile = 0; tile < TILE_COUNT; tile += 1) {
    if (((mask >> tile) & 1) === 1) {
      options.push(tile);
    }
  }

  return options[rng.nextInt(options.length)] as number;
}

function directionNameToIndex(name: "N" | "E" | "S" | "W"): number {
  if (name === "N") {
    return 0;
  }

  if (name === "E") {
    return 1;
  }

  if (name === "S") {
    return 2;
  }

  return 3;
}

function bitCount(value: number): number {
  let v = value;
  let count = 0;

  while (v !== 0) {
    v &= v - 1;
    count += 1;
  }

  return count;
}

function shuffleInPlace<T>(items: T[], rng: RandomSource): void {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = rng.nextInt(i + 1);
    const tmp = items[i] as T;
    items[i] = items[j] as T;
    items[j] = tmp;
  }
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

  if (rank[rootA] < rank[rootB]) {
    parent[rootA] = rootB;
  } else if (rank[rootA] > rank[rootB]) {
    parent[rootB] = rootA;
  } else {
    parent[rootB] = rootA;
    rank[rootA] += 1;
  }

  return true;
}
