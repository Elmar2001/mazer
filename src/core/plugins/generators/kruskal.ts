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
}

interface KruskalContext {
  grid: Grid;
  edges: Edge[];
  cursor: number;
  parent: Int32Array;
  rank: Uint8Array;
  touched: Uint8Array;
  components: number;
  carvedEdges: number;
}

export const kruskalGenerator: GeneratorPlugin<
  GeneratorRunOptions,
  AlgorithmStepMeta
> = {
  id: "kruskal",
  label: "Randomized Kruskal",
  create({ grid, rng }) {
    const edges = createEdges(grid);
    shuffleInPlace(edges, rng);

    const parent = new Int32Array(grid.cellCount);
    for (let i = 0; i < grid.cellCount; i += 1) {
      parent[i] = i;
    }

    const context: KruskalContext = {
      grid,
      edges,
      cursor: 0,
      parent,
      rank: new Uint8Array(grid.cellCount),
      touched: new Uint8Array(grid.cellCount),
      components: grid.cellCount,
      carvedEdges: 0,
    };

    return {
      step: () => stepKruskal(context),
    };
  },
};

function stepKruskal(context: KruskalContext) {
  const patches: CellPatch[] = [];

  if (context.components <= 1 || context.cursor >= context.edges.length) {
    return {
      done: true,
      patches,
      meta: {
        visitedCount: context.carvedEdges + 1,
        frontierSize: context.edges.length - context.cursor,
      },
    };
  }

  const edge = context.edges[context.cursor] as Edge;
  context.cursor += 1;

  if (union(edge.a, edge.b, context.parent, context.rank)) {
    context.components -= 1;
    context.carvedEdges += 1;

    patches.push(...carvePatch(edge.a, edge.b, edge.wallA, edge.wallB));

    if (context.touched[edge.a] === 0) {
      context.touched[edge.a] = 1;
      patches.push({ index: edge.a, overlaySet: OverlayFlag.Visited });
    }

    if (context.touched[edge.b] === 0) {
      context.touched[edge.b] = 1;
      patches.push({ index: edge.b, overlaySet: OverlayFlag.Visited });
    }
  }

  return {
    done: context.components <= 1,
    patches,
    meta: {
      visitedCount: context.carvedEdges + 1,
      frontierSize: context.edges.length - context.cursor,
    },
  };
}

function createEdges(grid: Grid): Edge[] {
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
        });
      }

      if (y + 1 < grid.height) {
        edges.push({
          a: index,
          b: index + grid.width,
          wallA: WallFlag.South,
          wallB: WallFlag.North,
        });
      }
    }
  }

  return edges;
}

function shuffleInPlace(items: Edge[], rng: RandomSource): void {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = rng.nextInt(i + 1);
    const tmp = items[i] as Edge;
    items[i] = items[j] as Edge;
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
