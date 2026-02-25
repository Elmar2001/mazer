import { carvePatch, neighbors, OverlayFlag, type Grid } from "@/core/grid";
import type { CellPatch } from "@/core/patches";
import type { GeneratorPlugin } from "@/core/plugins/GeneratorPlugin";
import type {
  AlgorithmStepMeta,
  GeneratorRunOptions,
} from "@/core/plugins/types";
import type { RandomSource } from "@/core/rng";

interface FrontierEdge {
  from: number;
  to: number;
  wallFrom: number;
  wallTo: number;
}

interface PrimEdgesContext {
  grid: Grid;
  rng: RandomSource;
  started: boolean;
  visited: Uint8Array;
  visitedCount: number;
  edges: FrontierEdge[];
  current: number;
}

export const primFrontierEdgesGenerator: GeneratorPlugin<
  GeneratorRunOptions,
  AlgorithmStepMeta
> = {
  id: "prim-frontier-edges",
  label: "Prim (Frontier Edges)",
  create({ grid, rng, options }) {
    const start =
      typeof options.startIndex === "number" &&
      options.startIndex >= 0 &&
      options.startIndex < grid.cellCount
        ? options.startIndex
        : rng.nextInt(grid.cellCount);

    const context: PrimEdgesContext = {
      grid,
      rng,
      started: false,
      visited: new Uint8Array(grid.cellCount),
      visitedCount: 0,
      edges: [],
      current: start,
    };

    return {
      step: () => stepPrimEdges(context),
    };
  },
};

function stepPrimEdges(context: PrimEdgesContext) {
  const patches: CellPatch[] = [];

  if (!context.started) {
    context.started = true;
    context.visited[context.current] = 1;
    context.visitedCount = 1;

    patches.push({
      index: context.current,
      overlaySet: OverlayFlag.Visited | OverlayFlag.Current,
    });

    addFrontierEdges(context, context.current);

    return {
      done: context.grid.cellCount <= 1,
      patches,
      meta: {
        visitedCount: context.visitedCount,
        frontierSize: context.edges.length,
      },
    };
  }

  if (context.current !== -1) {
    patches.push({
      index: context.current,
      overlayClear: OverlayFlag.Current,
    });
    context.current = -1;
  }

  while (context.edges.length > 0) {
    const pick = context.rng.nextInt(context.edges.length);
    const edge = context.edges[pick] as FrontierEdge;

    context.edges[pick] = context.edges[context.edges.length - 1] as FrontierEdge;
    context.edges.pop();

    if (context.visited[edge.to] === 1) {
      continue;
    }

    context.visited[edge.to] = 1;
    context.visitedCount += 1;

    patches.push(...carvePatch(edge.from, edge.to, edge.wallFrom, edge.wallTo));
    patches.push({
      index: edge.to,
      overlaySet: OverlayFlag.Visited | OverlayFlag.Current,
    });

    context.current = edge.to;
    addFrontierEdges(context, edge.to);

    return {
      done: false,
      patches,
      meta: {
        visitedCount: context.visitedCount,
        frontierSize: context.edges.length,
      },
    };
  }

  return {
    done: true,
    patches,
    meta: {
      visitedCount: context.visitedCount,
      frontierSize: 0,
    },
  };
}

function addFrontierEdges(context: PrimEdgesContext, from: number): void {
  for (const neighbor of neighbors(context.grid, from)) {
    if (context.visited[neighbor.index] === 1) {
      continue;
    }

    context.edges.push({
      from,
      to: neighbor.index,
      wallFrom: neighbor.direction.wall,
      wallTo: neighbor.direction.opposite,
    });
  }
}
