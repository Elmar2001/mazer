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

interface FractalEdge {
  a: number;
  b: number;
  wallA: WallFlag;
  wallB: WallFlag;
}

interface ConnectorCandidate {
  edge: FractalEdge;
  regionA: number;
  regionB: number;
}

interface FractalContext {
  edges: FractalEdge[];
  cursor: number;
  touched: Uint8Array;
  visitedCount: number;
  current: number;
  prevFrontier: number[];
}

export const fractalTessellationGenerator: GeneratorPlugin<
  GeneratorRunOptions,
  AlgorithmStepMeta
> = {
  id: "fractal-tessellation",
  label: "Fractal Tessellation",
  create({ grid, rng }) {
    const edges: FractalEdge[] = [];
    buildFractalEdges(grid, rng, 0, 0, grid.width, grid.height, edges);

    const context: FractalContext = {
      edges,
      cursor: 0,
      touched: new Uint8Array(grid.cellCount),
      visitedCount: 0,
      current: -1,
      prevFrontier: [],
    };

    return {
      step: () => stepFractal(context),
    };
  },
};

function stepFractal(context: FractalContext) {
  const patches: CellPatch[] = [];

  if (context.current !== -1) {
    patches.push({
      index: context.current,
      overlayClear: OverlayFlag.Current,
    });
    context.current = -1;
  }

  for (const index of context.prevFrontier) {
    patches.push({
      index,
      overlayClear: OverlayFlag.Frontier,
    });
  }
  context.prevFrontier = [];

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

  const edge = context.edges[context.cursor] as FractalEdge;
  context.cursor += 1;

  patches.push(...carvePatch(edge.a, edge.b, edge.wallA, edge.wallB));

  const newFrontier: number[] = [];

  if (context.touched[edge.a] === 0) {
    context.touched[edge.a] = 1;
    context.visitedCount += 1;
    patches.push({ index: edge.a, overlaySet: OverlayFlag.Visited | OverlayFlag.Frontier });
    newFrontier.push(edge.a);
  }

  if (context.touched[edge.b] === 0) {
    context.touched[edge.b] = 1;
    context.visitedCount += 1;
    patches.push({ index: edge.b, overlaySet: OverlayFlag.Visited | OverlayFlag.Frontier });
    newFrontier.push(edge.b);
  }

  context.prevFrontier = newFrontier;

  const done = context.cursor >= context.edges.length;

  if (!done) {
    context.current = edge.b;
    patches.push({
      index: context.current,
      overlaySet: OverlayFlag.Current,
    });
  }

  return {
    done,
    patches,
    meta: {
      line: done ? 6 : 5,
      visitedCount: context.visitedCount,
      frontierSize: done ? 0 : context.edges.length - context.cursor,
    },
  };
}

function buildFractalEdges(
  grid: Grid,
  rng: RandomSource,
  x: number,
  y: number,
  width: number,
  height: number,
  output: FractalEdge[],
): void {
  if (width <= 0 || height <= 0) {
    return;
  }

  if (width === 1 && height === 1) {
    return;
  }

  if (width === 1) {
    for (let cy = y; cy < y + height - 1; cy += 1) {
      const top = cy * grid.width + x;
      const bottom = top + grid.width;
      output.push({
        a: top,
        b: bottom,
        wallA: WallFlag.South,
        wallB: WallFlag.North,
      });
    }
    return;
  }

  if (height === 1) {
    for (let cx = x; cx < x + width - 1; cx += 1) {
      const left = y * grid.width + cx;
      const right = left + 1;
      output.push({
        a: left,
        b: right,
        wallA: WallFlag.East,
        wallB: WallFlag.West,
      });
    }
    return;
  }

  const leftWidth = Math.floor(width / 2);
  const rightWidth = width - leftWidth;
  const topHeight = Math.floor(height / 2);
  const bottomHeight = height - topHeight;

  buildFractalEdges(grid, rng, x, y, leftWidth, topHeight, output);
  buildFractalEdges(grid, rng, x + leftWidth, y, rightWidth, topHeight, output);
  buildFractalEdges(grid, rng, x, y + topHeight, leftWidth, bottomHeight, output);
  buildFractalEdges(
    grid,
    rng,
    x + leftWidth,
    y + topHeight,
    rightWidth,
    bottomHeight,
    output,
  );

  const connectors: ConnectorCandidate[] = [];

  const topY = y + rng.nextInt(topHeight);
  connectors.push({
    edge: {
      a: topY * grid.width + (x + leftWidth - 1),
      b: topY * grid.width + (x + leftWidth),
      wallA: WallFlag.East,
      wallB: WallFlag.West,
    },
    regionA: 0,
    regionB: 1,
  });

  const bottomY = y + topHeight + rng.nextInt(bottomHeight);
  connectors.push({
    edge: {
      a: bottomY * grid.width + (x + leftWidth - 1),
      b: bottomY * grid.width + (x + leftWidth),
      wallA: WallFlag.East,
      wallB: WallFlag.West,
    },
    regionA: 2,
    regionB: 3,
  });

  const leftX = x + rng.nextInt(leftWidth);
  connectors.push({
    edge: {
      a: (y + topHeight - 1) * grid.width + leftX,
      b: (y + topHeight) * grid.width + leftX,
      wallA: WallFlag.South,
      wallB: WallFlag.North,
    },
    regionA: 0,
    regionB: 2,
  });

  const rightX = x + leftWidth + rng.nextInt(rightWidth);
  connectors.push({
    edge: {
      a: (y + topHeight - 1) * grid.width + rightX,
      b: (y + topHeight) * grid.width + rightX,
      wallA: WallFlag.South,
      wallB: WallFlag.North,
    },
    regionA: 1,
    regionB: 3,
  });

  shuffleConnectors(connectors, rng);

  const parent = new Int32Array(4);
  const rank = new Uint8Array(4);
  for (let i = 0; i < 4; i += 1) {
    parent[i] = i;
  }

  for (const connector of connectors) {
    if (!union(connector.regionA, connector.regionB, parent, rank)) {
      continue;
    }

    output.push(connector.edge);
  }
}

function shuffleConnectors(items: ConnectorCandidate[], rng: RandomSource): void {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = rng.nextInt(i + 1);
    const tmp = items[i] as ConnectorCandidate;
    items[i] = items[j] as ConnectorCandidate;
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
