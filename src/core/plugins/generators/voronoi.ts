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

interface EdgeCarve {
  from: number;
  to: number;
  wallFrom: WallFlag;
  wallTo: WallFlag;
  regionA: number;
  regionB: number;
}

interface VoronoiContext {
  grid: Grid;
  rng: RandomSource;
  regionByCell: Int32Array;
  growthParent: Int32Array;
  frontier: number[];
  assignedCount: number;
  regionCount: number;
  phase: "grow" | "tree" | "carve" | "done";
  carveEdges: EdgeCarve[];
  carveCursor: number;
}

export const voronoiGenerator: GeneratorPlugin<
  GeneratorRunOptions,
  AlgorithmStepMeta
> = {
  id: "voronoi",
  label: "Voronoi Tessellation",
  create({ grid, rng }) {
    const regionByCell = new Int32Array(grid.cellCount);
    regionByCell.fill(-1);

    const growthParent = new Int32Array(grid.cellCount);
    growthParent.fill(-1);

    const regionCount = Math.min(
      grid.cellCount,
      Math.max(4, Math.floor(Math.sqrt(grid.cellCount))),
    );

    const seedCells = pickUniqueSeeds(regionCount, grid.cellCount, rng);
    const frontier: number[] = [];

    for (let region = 0; region < seedCells.length; region += 1) {
      const cell = seedCells[region] as number;
      regionByCell[cell] = region;
      growthParent[cell] = cell;
      frontier.push(cell);
    }

    const context: VoronoiContext = {
      grid,
      rng,
      regionByCell,
      growthParent,
      frontier,
      assignedCount: seedCells.length,
      regionCount: seedCells.length,
      phase: "grow",
      carveEdges: [],
      carveCursor: 0,
    };

    return {
      step: () => stepVoronoi(context),
    };
  },
};

function stepVoronoi(context: VoronoiContext) {
  const patches: CellPatch[] = [];

  if (context.phase === "done") {
    return {
      done: true,
      patches,
      meta: {
        line: 4,
        visitedCount: context.grid.cellCount,
        frontierSize: 0,
      },
    };
  }

  if (context.phase === "grow") {
    const nextFrontier: number[] = [];

    for (const cell of context.frontier) {
      patches.push({
        index: cell,
        overlaySet: OverlayFlag.Visited,
        overlayClear: OverlayFlag.Frontier,
      });

      const region = context.regionByCell[cell] as number;
      for (const neighbor of neighbors(context.grid, cell)) {
        if (context.regionByCell[neighbor.index] !== -1) {
          continue;
        }

        context.regionByCell[neighbor.index] = region;
        context.growthParent[neighbor.index] = cell;
        context.assignedCount += 1;
        nextFrontier.push(neighbor.index);

        patches.push({
          index: neighbor.index,
          overlaySet: OverlayFlag.Frontier,
        });
      }
    }

    context.frontier = nextFrontier;

    if (context.frontier.length === 0) {
      context.phase = "tree";
    }

    return {
      done: false,
      patches,
      meta: {
        line: 1,
        visitedCount: context.assignedCount,
        frontierSize: context.frontier.length,
      },
    };
  }

  if (context.phase === "tree") {
    context.carveEdges = buildVoronoiCarvePlan(context);
    context.carveCursor = 0;
    context.phase = "carve";

    return {
      done: false,
      patches,
      meta: {
        line: 2,
        visitedCount: context.assignedCount,
        frontierSize: context.carveEdges.length,
      },
    };
  }

  const batchSize = 18;
  let carved = 0;

  while (
    context.carveCursor < context.carveEdges.length &&
    carved < batchSize
  ) {
    const edge = context.carveEdges[context.carveCursor] as EdgeCarve;
    context.carveCursor += 1;
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

  if (context.carveCursor >= context.carveEdges.length) {
    context.phase = "done";
  }

  return {
    done: context.phase === "done",
    patches,
    meta: {
      line: 3,
      visitedCount: context.assignedCount,
      frontierSize: Math.max(0, context.carveEdges.length - context.carveCursor),
    },
  };
}

function buildVoronoiCarvePlan(context: VoronoiContext): EdgeCarve[] {
  const internalEdges: EdgeCarve[] = [];

  for (let cell = 0; cell < context.grid.cellCount; cell += 1) {
    const parent = context.growthParent[cell] as number;
    if (parent === -1 || parent === cell) {
      continue;
    }

    const carve = carveDescriptor(cell, parent, context.grid.width);
    internalEdges.push({
      ...carve,
      regionA: context.regionByCell[cell] as number,
      regionB: context.regionByCell[parent] as number,
    });
  }

  const boundaryByPair = new Map<string, EdgeCarve[]>();

  for (let cell = 0; cell < context.grid.cellCount; cell += 1) {
    const regionA = context.regionByCell[cell] as number;

    const x = cell % context.grid.width;
    const y = Math.floor(cell / context.grid.width);

    if (x + 1 < context.grid.width) {
      const right = cell + 1;
      const regionB = context.regionByCell[right] as number;
      if (regionA !== regionB) {
        pushBoundaryEdge(boundaryByPair, {
          from: cell,
          to: right,
          wallFrom: WallFlag.East,
          wallTo: WallFlag.West,
          regionA,
          regionB,
        });
      }
    }

    if (y + 1 < context.grid.height) {
      const down = cell + context.grid.width;
      const regionB = context.regionByCell[down] as number;
      if (regionA !== regionB) {
        pushBoundaryEdge(boundaryByPair, {
          from: cell,
          to: down,
          wallFrom: WallFlag.South,
          wallTo: WallFlag.North,
          regionA,
          regionB,
        });
      }
    }
  }

  const doorEdges: EdgeCarve[] = [];
  const parent = new Int32Array(context.regionCount);
  const rank = new Uint8Array(context.regionCount);
  for (let i = 0; i < context.regionCount; i += 1) {
    parent[i] = i;
  }

  const keys = Array.from(boundaryByPair.keys());
  shuffleInPlace(keys, context.rng);

  for (const key of keys) {
    const candidates = boundaryByPair.get(key);
    if (!candidates || candidates.length === 0) {
      continue;
    }

    const exemplar = candidates[0] as EdgeCarve;
    if (!union(exemplar.regionA, exemplar.regionB, parent, rank)) {
      continue;
    }

    const chosen =
      candidates[context.rng.nextInt(candidates.length)] as EdgeCarve;
    doorEdges.push(chosen);
  }

  return [...internalEdges, ...doorEdges];
}

function pushBoundaryEdge(map: Map<string, EdgeCarve[]>, edge: EdgeCarve): void {
  const minRegion = Math.min(edge.regionA, edge.regionB);
  const maxRegion = Math.max(edge.regionA, edge.regionB);
  const key = `${minRegion}-${maxRegion}`;

  const list = map.get(key);
  if (list) {
    list.push(edge);
  } else {
    map.set(key, [edge]);
  }
}

function carveDescriptor(
  from: number,
  to: number,
  width: number,
): Pick<EdgeCarve, "from" | "to" | "wallFrom" | "wallTo"> {
  if (to === from + 1) {
    return {
      from,
      to,
      wallFrom: WallFlag.East,
      wallTo: WallFlag.West,
    };
  }

  if (to === from - 1) {
    return {
      from,
      to,
      wallFrom: WallFlag.West,
      wallTo: WallFlag.East,
    };
  }

  if (to === from + width) {
    return {
      from,
      to,
      wallFrom: WallFlag.South,
      wallTo: WallFlag.North,
    };
  }

  return {
    from,
    to,
    wallFrom: WallFlag.North,
    wallTo: WallFlag.South,
  };
}

function pickUniqueSeeds(
  count: number,
  cellCount: number,
  rng: RandomSource,
): number[] {
  const seen = new Set<number>();

  while (seen.size < count) {
    seen.add(rng.nextInt(cellCount));
  }

  return Array.from(seen);
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
