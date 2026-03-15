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

interface Edge {
  a: number;
  b: number;
  wallA: WallFlag;
  wallB: WallFlag;
}

interface ReverseDeleteContext {
  grid: Grid;
  edges: Edge[];
  cursor: number;
  opened: boolean;
  touched: Uint8Array;
  visitedCount: number;
  current: number;
}

export const reverseDeleteGenerator: GeneratorPlugin<
  GeneratorRunOptions,
  AlgorithmStepMeta
> = {
  id: "reverse-delete",
  label: "Reverse-Delete",
  create({ grid, rng }) {
    const edges = createEdges(grid);
    shuffleEdges(edges, rng);

    const context: ReverseDeleteContext = {
      grid,
      edges,
      cursor: 0,
      opened: false,
      touched: new Uint8Array(grid.cellCount),
      visitedCount: 0,
      current: -1,
    };

    return {
      step: () => stepReverseDelete(context),
    };
  },
};

function stepReverseDelete(context: ReverseDeleteContext) {
  const patches: CellPatch[] = [];

  if (context.current !== -1) {
    patches.push({
      index: context.current,
      overlayClear: OverlayFlag.Current,
    });
    context.current = -1;
  }

  if (!context.opened) {
    context.opened = true;
    for (const p of buildOpenInternalPatches(context.grid)) {
      patches.push(p);
    }

    return {
      done: context.edges.length === 0,
      patches,
      meta: {
        line: 1,
        visitedCount: context.visitedCount,
        frontierSize: context.edges.length,
      },
    };
  }

  if (context.cursor >= context.edges.length) {
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

  const edge = context.edges[context.cursor] as Edge;
  context.cursor += 1;

  markTouched(context, edge.a, patches);
  markTouched(context, edge.b, patches);

  context.current = edge.b;
  patches.push({
    index: edge.b,
    overlaySet: OverlayFlag.Current,
  });

  const removable = hasAlternatePath(context.grid, edge.a, edge.b, edge);

  if (removable) {
    patches.push({ index: edge.a, wallSet: edge.wallA });
    patches.push({ index: edge.b, wallSet: edge.wallB });
  }

  return {
    done: context.cursor >= context.edges.length,
    patches,
    meta: {
      line: removable ? 4 : 5,
      visitedCount: context.visitedCount,
      frontierSize: context.edges.length - context.cursor,
    },
  };
}

function markTouched(
  context: ReverseDeleteContext,
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

function hasAlternatePath(
  grid: Grid,
  start: number,
  goal: number,
  blocked: Edge,
): boolean {
  const visited = new Uint8Array(grid.cellCount);
  const queue = [start];
  let head = 0;
  visited[start] = 1;

  while (head < queue.length) {
    const current = queue[head] as number;
    head += 1;

    if (current === goal) {
      return true;
    }

    for (const neighbor of neighbors(grid, current)) {
      if ((grid.walls[current] & neighbor.direction.wall) !== 0) {
        continue;
      }

      if (
        (current === blocked.a && neighbor.index === blocked.b) ||
        (current === blocked.b && neighbor.index === blocked.a)
      ) {
        continue;
      }

      if (visited[neighbor.index] === 1) {
        continue;
      }

      visited[neighbor.index] = 1;
      queue.push(neighbor.index);
    }
  }

  return false;
}

function buildOpenInternalPatches(grid: Grid): CellPatch[] {
  const patches: CellPatch[] = [];

  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const index = y * grid.width + x;

      if (x + 1 < grid.width) {
        patches.push(
          ...carvePatch(index, index + 1, WallFlag.East, WallFlag.West),
        );
      }

      if (y + 1 < grid.height) {
        patches.push(
          ...carvePatch(index, index + grid.width, WallFlag.South, WallFlag.North),
        );
      }
    }
  }

  return patches;
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

function shuffleEdges(edges: Edge[], rng: RandomSource): void {
  for (let i = edges.length - 1; i > 0; i -= 1) {
    const j = rng.nextInt(i + 1);
    const tmp = edges[i] as Edge;
    edges[i] = edges[j] as Edge;
    edges[j] = tmp;
  }
}
