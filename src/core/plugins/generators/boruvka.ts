import { carvePatch, OverlayFlag, WallFlag, type Grid } from "@/core/grid";
import type { CellPatch } from "@/core/patches";
import type { GeneratorPlugin } from "@/core/plugins/GeneratorPlugin";
import type {
  AlgorithmStepMeta,
  GeneratorRunOptions,
} from "@/core/plugins/types";
import type { RandomSource } from "@/core/rng";

interface Edge {
  a: number;
  b: number;
  wallA: WallFlag;
  wallB: WallFlag;
  weight: number;
}

interface BoruvkaContext {
  grid: Grid;
  edges: Edge[];
  parent: Int32Array;
  rank: Uint8Array;
  components: number;
  carvedEdges: number;
  touched: Uint8Array;
  visitedCount: number;
  currentNodes: number[];
  pendingEdges: number[];
  pendingCursor: number;
}

export const boruvkaGenerator: GeneratorPlugin<
  GeneratorRunOptions,
  AlgorithmStepMeta
> = {
  id: "boruvka",
  label: "Randomized Boruvka",
  create({ grid, rng }) {
    const parent = new Int32Array(grid.cellCount);
    for (let i = 0; i < grid.cellCount; i += 1) {
      parent[i] = i;
    }

    const context: BoruvkaContext = {
      grid,
      edges: createWeightedEdges(grid, rng),
      parent,
      rank: new Uint8Array(grid.cellCount),
      components: grid.cellCount,
      carvedEdges: 0,
      touched: new Uint8Array(grid.cellCount),
      visitedCount: 0,
      currentNodes: [],
      pendingEdges: [],
      pendingCursor: 0,
    };

    return {
      step: () => stepBoruvka(context),
    };
  },
};

function stepBoruvka(context: BoruvkaContext) {
  const patches: CellPatch[] = [];

  clearCurrentMarkers(context, patches);

  if (context.components <= 1) {
    return {
      done: true,
      patches,
      meta: {
        line: 1,
        visitedCount: context.visitedCount,
        frontierSize: 0,
      },
    };
  }

  if (context.pendingCursor >= context.pendingEdges.length) {
    context.pendingEdges = collectRoundEdges(context);
    context.pendingCursor = 0;

    if (context.pendingEdges.length === 0) {
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
  }

  while (context.pendingCursor < context.pendingEdges.length) {
    const edgeIndex = context.pendingEdges[context.pendingCursor] as number;
    context.pendingCursor += 1;

    const edge = context.edges[edgeIndex] as Edge;
    if (!union(edge.a, edge.b, context.parent, context.rank)) {
      continue;
    }

    context.components -= 1;
    context.carvedEdges += 1;
    patches.push(...carvePatch(edge.a, edge.b, edge.wallA, edge.wallB));

    markTouched(context, edge.a, patches);
    markTouched(context, edge.b, patches);

    context.currentNodes = edge.a === edge.b ? [edge.a] : [edge.a, edge.b];
    for (const index of context.currentNodes) {
      patches.push({
        index,
        overlaySet: OverlayFlag.Current,
      });
    }

    return {
      done: context.components <= 1,
      patches,
      meta: {
        line: 4,
        visitedCount: context.visitedCount,
        frontierSize: context.pendingEdges.length - context.pendingCursor,
      },
    };
  }

  context.pendingEdges = [];
  context.pendingCursor = 0;

  return {
    done: context.components <= 1,
    patches,
    meta: {
      line: 5,
      visitedCount: context.visitedCount,
      frontierSize: 0,
    },
  };
}

function collectRoundEdges(context: BoruvkaContext): number[] {
  const bestByRoot = new Int32Array(context.grid.cellCount);
  bestByRoot.fill(-1);

  for (let i = 0; i < context.edges.length; i += 1) {
    const edge = context.edges[i] as Edge;
    const rootA = find(edge.a, context.parent);
    const rootB = find(edge.b, context.parent);

    if (rootA === rootB) {
      continue;
    }

    chooseBestEdge(bestByRoot, rootA, i, context.edges);
    chooseBestEdge(bestByRoot, rootB, i, context.edges);
  }

  return collectChosenEdges(bestByRoot);
}

function clearCurrentMarkers(context: BoruvkaContext, patches: CellPatch[]): void {
  if (context.currentNodes.length === 0) {
    return;
  }

  for (const index of context.currentNodes) {
    patches.push({
      index,
      overlayClear: OverlayFlag.Current,
    });
  }

  context.currentNodes = [];
}

function chooseBestEdge(
  bestByRoot: Int32Array,
  root: number,
  edgeIndex: number,
  edges: Edge[],
): void {
  const currentBest = bestByRoot[root] as number;
  if (currentBest === -1) {
    bestByRoot[root] = edgeIndex;
    return;
  }

  const candidate = edges[edgeIndex] as Edge;
  const incumbent = edges[currentBest] as Edge;

  if (candidate.weight < incumbent.weight) {
    bestByRoot[root] = edgeIndex;
    return;
  }

  if (candidate.weight === incumbent.weight && edgeIndex < currentBest) {
    bestByRoot[root] = edgeIndex;
  }
}

function collectChosenEdges(bestByRoot: Int32Array): number[] {
  const seen = new Set<number>();

  for (let i = 0; i < bestByRoot.length; i += 1) {
    const edgeIndex = bestByRoot[i] as number;
    if (edgeIndex >= 0) {
      seen.add(edgeIndex);
    }
  }

  return Array.from(seen).sort((a, b) => a - b);
}

function markTouched(
  context: BoruvkaContext,
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

function createWeightedEdges(grid: Grid, rng: RandomSource): Edge[] {
  const edges: Edge[] = [];

  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const index = y * grid.width + x;

      if (x + 1 < grid.width) {
        edges.push({
          a: index,
          b: index + 1,
          wallA: WallFlag.East,
          wallB: WallFlag.West,
          weight: rng.next(),
        });
      }

      if (y + 1 < grid.height) {
        edges.push({
          a: index,
          b: index + grid.width,
          wallA: WallFlag.South,
          wallB: WallFlag.North,
          weight: rng.next(),
        });
      }
    }
  }

  return edges;
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
