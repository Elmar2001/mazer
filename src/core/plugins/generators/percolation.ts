import {
  carvePatch,
  OverlayFlag,
  WallFlag,
  type Grid,
} from "@/core/grid";
import type { CellPatch } from "@/core/patches";
import type { GeneratorPlugin } from "@/core/plugins/GeneratorPlugin";
import {
  LOOP_DENSITY_PARAM_SCHEMA,
  parseLoopDensity,
} from "@/core/plugins/generators/loopDensity";
import type { NumberGeneratorParamSchema } from "@/core/plugins/pluginMetadata";
import type {
  AlgorithmStepMeta,
  GeneratorRunOptions,
} from "@/core/plugins/types";
import type { RandomSource } from "@/core/rng";

interface PercolationEdge {
  from: number;
  to: number;
  wallFrom: WallFlag;
  wallTo: WallFlag;
}

interface PercolationContext {
  grid: Grid;
  rng: RandomSource;
  edges: PercolationEdge[];
  carvedFlags: Uint8Array;
  parent: Int32Array;
  rank: Uint8Array;
  components: number;
  probability: number;
  phase: "percolate" | "connect" | "done";
  cursor: number;
  carvedEdgeCount: number;
  touched: Uint8Array;
  visitedCount: number;
  frontierCells: number[];
}

const PERCOLATION_PARAM_SCHEMA: NumberGeneratorParamSchema = {
  type: "number",
  key: LOOP_DENSITY_PARAM_SCHEMA.key,
  label: "Percolation Probability (%)",
  description: "Probability of removing each wall during the random phase.",
  min: 0,
  max: 100,
  step: 5,
  defaultValue: 50,
};

export const percolationGenerator: GeneratorPlugin<
  GeneratorRunOptions,
  AlgorithmStepMeta
> = {
  id: "percolation",
  label: "Percolation",
  generatorParamsSchema: [PERCOLATION_PARAM_SCHEMA],
  create({ grid, rng, options }) {
    const edges = enumerateEdges(grid);
    shuffleInPlace(edges, rng);

    const parent = new Int32Array(grid.cellCount);
    for (let i = 0; i < grid.cellCount; i += 1) {
      parent[i] = i;
    }

    const context: PercolationContext = {
      grid,
      rng,
      edges,
      carvedFlags: new Uint8Array(edges.length),
      parent,
      rank: new Uint8Array(grid.cellCount),
      components: grid.cellCount,
      probability: parsePercolationProbability(options),
      phase: "percolate",
      cursor: 0,
      carvedEdgeCount: 0,
      touched: new Uint8Array(grid.cellCount),
      visitedCount: 0,
      frontierCells: [],
    };

    return {
      step: () => stepPercolation(context),
    };
  },
};

function stepPercolation(context: PercolationContext) {
  const patches: CellPatch[] = [];

  for (const cell of context.frontierCells) {
    patches.push({
      index: cell,
      overlayClear: OverlayFlag.Frontier,
    });
  }
  context.frontierCells = [];

  if (context.phase === "done") {
    return {
      done: true,
      patches,
      meta: {
        line: 2,
        visitedCount: context.visitedCount,
        frontierSize: 0,
      },
    };
  }

  const batchSize = 16;
  let processed = 0;

  while (context.cursor < context.edges.length && processed < batchSize) {
    const edgeIndex = context.cursor;
    const edge = context.edges[edgeIndex] as PercolationEdge;
    context.cursor += 1;
    processed += 1;

    markFrontier(edge.from, edge.to, context, patches);

    if (context.phase === "percolate") {
      if (context.rng.next() < context.probability) {
        carveEdge(edgeIndex, edge, context, patches);
      }
      continue;
    }

    if (
      context.carvedFlags[edgeIndex] === 0 &&
      union(edge.from, edge.to, context.parent, context.rank)
    ) {
      context.components -= 1;
      carveEdge(edgeIndex, edge, context, patches);
    }
  }

  if (context.phase === "percolate" && context.cursor >= context.edges.length) {
    context.phase = "connect";
    context.cursor = 0;
  }

  if (context.phase === "connect") {
    if (context.components <= 1 || context.cursor >= context.edges.length) {
      ensureExtraLoop(context, patches);
      context.phase = "done";
    }
  }

  return {
    done: context.phase === "done",
    patches,
    meta: {
      line: context.phase === "percolate" ? 1 : 2,
      visitedCount: context.visitedCount,
      frontierSize: Math.max(0, context.edges.length - context.cursor),
    },
  };
}

function parsePercolationProbability(options: GeneratorRunOptions): number {
  const raw = options.loopDensity;

  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return 0.5;
  }

  return parseLoopDensity(options) / 100;
}

function enumerateEdges(grid: Grid): PercolationEdge[] {
  const out: PercolationEdge[] = [];

  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    const x = cell % grid.width;
    const y = Math.floor(cell / grid.width);

    if (x + 1 < grid.width) {
      out.push({
        from: cell,
        to: cell + 1,
        wallFrom: WallFlag.East,
        wallTo: WallFlag.West,
      });
    }

    if (y + 1 < grid.height) {
      out.push({
        from: cell,
        to: cell + grid.width,
        wallFrom: WallFlag.South,
        wallTo: WallFlag.North,
      });
    }
  }

  return out;
}

function carveEdge(
  edgeIndex: number,
  edge: PercolationEdge,
  context: PercolationContext,
  patches: CellPatch[],
): void {
  if (context.carvedFlags[edgeIndex] === 1) {
    return;
  }

  context.carvedFlags[edgeIndex] = 1;
  context.carvedEdgeCount += 1;

  if (union(edge.from, edge.to, context.parent, context.rank)) {
    context.components -= 1;
  }

  patches.push(...carvePatch(edge.from, edge.to, edge.wallFrom, edge.wallTo));
  touchCell(edge.from, context, patches);
  touchCell(edge.to, context, patches);
}

function ensureExtraLoop(
  context: PercolationContext,
  patches: CellPatch[],
): void {
  if (context.carvedEdgeCount > context.grid.cellCount - 1) {
    return;
  }

  const candidates: number[] = [];
  for (let i = 0; i < context.edges.length; i += 1) {
    if (context.carvedFlags[i] === 0) {
      candidates.push(i);
    }
  }

  if (candidates.length === 0) {
    return;
  }

  const edgeIndex = candidates[context.rng.nextInt(candidates.length)] as number;
  const edge = context.edges[edgeIndex] as PercolationEdge;

  context.carvedFlags[edgeIndex] = 1;
  context.carvedEdgeCount += 1;
  patches.push(...carvePatch(edge.from, edge.to, edge.wallFrom, edge.wallTo));
  touchCell(edge.from, context, patches);
  touchCell(edge.to, context, patches);
}

function markFrontier(
  from: number,
  to: number,
  context: PercolationContext,
  patches: CellPatch[],
): void {
  if (!context.frontierCells.includes(from)) {
    context.frontierCells.push(from);
    patches.push({
      index: from,
      overlaySet: OverlayFlag.Frontier,
    });
  }

  if (!context.frontierCells.includes(to)) {
    context.frontierCells.push(to);
    patches.push({
      index: to,
      overlaySet: OverlayFlag.Frontier,
    });
  }
}

function touchCell(
  index: number,
  context: PercolationContext,
  patches: CellPatch[],
): void {
  if (context.touched[index] === 0) {
    context.touched[index] = 1;
    context.visitedCount += 1;
  }

  patches.push({
    index,
    overlaySet: OverlayFlag.Visited,
  });
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
