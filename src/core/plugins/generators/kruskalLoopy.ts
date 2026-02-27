import { carvePatch, OverlayFlag, WallFlag, type Grid } from "@/core/grid";
import type { CellPatch } from "@/core/patches";
import type { GeneratorPlugin } from "@/core/plugins/GeneratorPlugin";
import {
  LOOP_DENSITY_PARAM_SCHEMA,
  parseLoopDensity,
} from "@/core/plugins/generators/loopDensity";
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

interface KruskalLoopyContext {
  grid: Grid;
  edges: Edge[];
  cursor: number;
  parent: Int32Array;
  rank: Uint8Array;
  touched: Uint8Array;
  components: number;
  carvedEdges: number;
  rejectedEdges: Edge[];
  loopCursor: number;
  loopDensity: number;
  maxExtraEdges: number;
  addedExtraEdges: number;
  phase: "tree" | "loops";
}

export const kruskalLoopyGenerator: GeneratorPlugin<
  GeneratorRunOptions,
  AlgorithmStepMeta
> = {
  id: "kruskal-loopy",
  label: "Kruskal (Loopy)",
  generatorParamsSchema: [LOOP_DENSITY_PARAM_SCHEMA],
  create({ grid, rng, options }) {
    const edges = createEdges(grid);
    shuffleInPlace(edges, rng);

    const parent = new Int32Array(grid.cellCount);
    for (let i = 0; i < grid.cellCount; i += 1) {
      parent[i] = i;
    }

    const loopDensity = parseLoopDensity(options);
    const maxExtraEdges = Math.max(
      0,
      Math.round((edges.length - (grid.cellCount - 1)) * (loopDensity / 100)),
    );

    const context: KruskalLoopyContext = {
      grid,
      edges,
      cursor: 0,
      parent,
      rank: new Uint8Array(grid.cellCount),
      touched: new Uint8Array(grid.cellCount),
      components: grid.cellCount,
      carvedEdges: 0,
      rejectedEdges: [],
      loopCursor: 0,
      loopDensity,
      maxExtraEdges,
      addedExtraEdges: 0,
      phase: "tree",
    };

    return {
      step: () => stepKruskalLoopy(context, rng),
    };
  },
};

function stepKruskalLoopy(context: KruskalLoopyContext, rng: RandomSource) {
  const patches: CellPatch[] = [];

  if (context.phase === "tree") {
    if (context.components <= 1 || context.cursor >= context.edges.length) {
      context.phase = "loops";
      shuffleInPlace(context.rejectedEdges, rng);

      return {
        done: context.maxExtraEdges === 0 || context.rejectedEdges.length === 0,
        patches,
        meta: {
          line: 3,
          visitedCount: context.carvedEdges + 1,
          frontierSize: context.maxExtraEdges,
        },
      };
    }

    const edge = context.edges[context.cursor] as Edge;
    context.cursor += 1;

    if (union(edge.a, edge.b, context.parent, context.rank)) {
      context.components -= 1;
      context.carvedEdges += 1;

      patches.push(...carvePatch(edge.a, edge.b, edge.wallA, edge.wallB));

      markTouched(context, edge.a, patches);
      markTouched(context, edge.b, patches);
    } else {
      context.rejectedEdges.push(edge);
    }

    return {
      done: false,
      patches,
      meta: {
        line: 2,
        visitedCount: context.carvedEdges + 1,
        frontierSize: context.edges.length - context.cursor,
      },
    };
  }

  while (
    context.loopCursor < context.rejectedEdges.length &&
    context.addedExtraEdges < context.maxExtraEdges
  ) {
    const edge = context.rejectedEdges[context.loopCursor] as Edge;
    context.loopCursor += 1;

    if ((context.grid.walls[edge.a] & edge.wallA) === 0) {
      continue;
    }

    patches.push(...carvePatch(edge.a, edge.b, edge.wallA, edge.wallB));
    context.addedExtraEdges += 1;

    markTouched(context, edge.a, patches);
    markTouched(context, edge.b, patches);

    return {
      done: false,
      patches,
      meta: {
        line: 4,
        visitedCount: Math.max(context.carvedEdges + 1, context.grid.cellCount),
        frontierSize: context.maxExtraEdges - context.addedExtraEdges,
      },
    };
  }

  return {
    done: true,
    patches,
    meta: {
      line: 5,
      visitedCount: Math.max(context.carvedEdges + 1, context.grid.cellCount),
      frontierSize: 0,
    },
  };
}

function markTouched(
  context: KruskalLoopyContext,
  index: number,
  patches: CellPatch[],
): void {
  if (context.touched[index] === 1) {
    return;
  }

  context.touched[index] = 1;
  patches.push({ index, overlaySet: OverlayFlag.Visited });
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
