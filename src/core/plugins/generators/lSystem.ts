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

interface TurtleState {
  x: number;
  y: number;
  dir: number;
}

interface LSystemEdge {
  from: number;
  to: number;
  wallFrom: WallFlag;
  wallTo: WallFlag;
}

interface LSystemContext {
  grid: Grid;
  rng: RandomSource;
  program: string;
  cursor: number;
  phase: "draw" | "connect" | "done";
  x: number;
  y: number;
  dir: number;
  stack: TurtleState[];
  currentIndex: number;
  trailIndex: number;
  parent: Int32Array;
  rank: Uint8Array;
  components: number;
  visited: Uint8Array;
  visitedCount: number;
  connectEdges: LSystemEdge[];
  connectCursor: number;
}

const DIRECTIONS = [
  { dx: 0, dy: -1, wall: WallFlag.North, opposite: WallFlag.South },
  { dx: 1, dy: 0, wall: WallFlag.East, opposite: WallFlag.West },
  { dx: 0, dy: 1, wall: WallFlag.South, opposite: WallFlag.North },
  { dx: -1, dy: 0, wall: WallFlag.West, opposite: WallFlag.East },
] as const;

const RULE_SETS = [
  { F: "F+F-F-F+F" },
  { F: "FF+F+F+F+FF" },
] as const;

export const lSystemGenerator: GeneratorPlugin<
  GeneratorRunOptions,
  AlgorithmStepMeta
> = {
  id: "l-system",
  label: "L-System (Lindenmayer)",
  create({ grid, rng }) {
    const centerX = Math.floor(grid.width / 2);
    const centerY = Math.floor(grid.height / 2);
    const startIndex = centerY * grid.width + centerX;

    const parent = new Int32Array(grid.cellCount);
    for (let i = 0; i < grid.cellCount; i += 1) {
      parent[i] = i;
    }

    const visited = new Uint8Array(grid.cellCount);
    visited[startIndex] = 1;

    const connectEdges = enumerateEdges(grid);
    shuffleInPlace(connectEdges, rng);

    const context: LSystemContext = {
      grid,
      rng,
      program: buildProgram(grid.cellCount, rng),
      cursor: 0,
      phase: "draw",
      x: centerX,
      y: centerY,
      dir: 1,
      stack: [],
      currentIndex: startIndex,
      trailIndex: -1,
      parent,
      rank: new Uint8Array(grid.cellCount),
      components: grid.cellCount,
      visited,
      visitedCount: 1,
      connectEdges,
      connectCursor: 0,
    };

    return {
      step: () => stepLSystem(context),
    };
  },
};

function stepLSystem(context: LSystemContext) {
  const patches: CellPatch[] = [];

  patches.push({
    index: context.currentIndex,
    overlayClear: OverlayFlag.Current,
  });

  if (context.trailIndex !== -1) {
    patches.push({
      index: context.trailIndex,
      overlayClear: OverlayFlag.Frontier,
    });
    context.trailIndex = -1;
  }

  if (context.phase === "done") {
    return {
      done: true,
      patches,
      meta: {
        line: 4,
        visitedCount: context.visitedCount,
        frontierSize: 0,
      },
    };
  }

  if (context.phase === "draw") {
    const symbolsPerStep = 24;
    let processed = 0;

    while (context.cursor < context.program.length && processed < symbolsPerStep) {
      const symbol = context.program[context.cursor] as string;
      context.cursor += 1;
      processed += 1;

      if (symbol === "F") {
        advanceTurtle(context, patches);
      } else if (symbol === "+") {
        context.dir = (context.dir + 1) % 4;
      } else if (symbol === "-") {
        context.dir = (context.dir + 3) % 4;
      } else if (symbol === "[") {
        context.stack.push({
          x: context.x,
          y: context.y,
          dir: context.dir,
        });
      } else if (symbol === "]") {
        const state = context.stack.pop();
        if (state) {
          context.x = state.x;
          context.y = state.y;
          context.dir = state.dir;
          context.currentIndex = context.y * context.grid.width + context.x;
        }
      }
    }

    patches.push({
      index: context.currentIndex,
      overlaySet: OverlayFlag.Current | OverlayFlag.Visited,
    });

    if (context.cursor >= context.program.length) {
      context.phase = "connect";
    }

    return {
      done: false,
      patches,
      meta: {
        line: 1,
        visitedCount: context.visitedCount,
        frontierSize:
          context.phase === "draw"
            ? Math.max(0, context.program.length - context.cursor)
            : Math.max(0, context.grid.cellCount - context.visitedCount),
      },
    };
  }

  const batchSize = 14;
  let processed = 0;

  while (
    context.connectCursor < context.connectEdges.length &&
    processed < batchSize
  ) {
    const edge = context.connectEdges[context.connectCursor] as LSystemEdge;
    context.connectCursor += 1;
    processed += 1;

    if (!union(edge.from, edge.to, context.parent, context.rank)) {
      continue;
    }

    context.components -= 1;
    patches.push(...carvePatch(edge.from, edge.to, edge.wallFrom, edge.wallTo));
    touchCell(edge.from, context, patches);
    touchCell(edge.to, context, patches);
  }

  if (context.components <= 1 || context.connectCursor >= context.connectEdges.length) {
    context.phase = "done";
  }

  patches.push({
    index: context.currentIndex,
    overlaySet: OverlayFlag.Current,
  });

  return {
    done: context.phase === "done",
    patches,
    meta: {
      line: 2,
      visitedCount: context.visitedCount,
      frontierSize: Math.max(0, context.grid.cellCount - context.visitedCount),
    },
  };
}

function advanceTurtle(context: LSystemContext, patches: CellPatch[]): void {
  const current = context.currentIndex;
  const direction = DIRECTIONS[context.dir]!;

  const nx = context.x + direction.dx;
  const ny = context.y + direction.dy;

  if (nx < 0 || nx >= context.grid.width || ny < 0 || ny >= context.grid.height) {
    return;
  }

  const next = ny * context.grid.width + nx;

  if (union(current, next, context.parent, context.rank)) {
    context.components -= 1;
    patches.push(...carvePatch(current, next, direction.wall, direction.opposite));
  }

  context.x = nx;
  context.y = ny;
  context.currentIndex = next;

  touchCell(current, context, patches);
  touchCell(next, context, patches);

  if (context.trailIndex !== -1 && context.trailIndex !== next) {
    patches.push({
      index: context.trailIndex,
      overlayClear: OverlayFlag.Frontier,
    });
  }

  context.trailIndex = next;
  patches.push({
    index: next,
    overlaySet: OverlayFlag.Frontier,
  });
}

function touchCell(
  index: number,
  context: LSystemContext,
  patches: CellPatch[],
): void {
  if (context.visited[index] === 0) {
    context.visited[index] = 1;
    context.visitedCount += 1;
  }

  patches.push({
    index,
    overlaySet: OverlayFlag.Visited,
  });
}

function buildProgram(cellCount: number, rng: RandomSource): string {
  const maxLength = Math.max(64, cellCount * 4);
  const rules = RULE_SETS[rng.nextInt(RULE_SETS.length)] as Record<string, string>;

  let current = "F";

  for (let iteration = 0; iteration < 6; iteration += 1) {
    let next = "";

    for (const symbol of current) {
      next += rules[symbol] ?? symbol;
      if (next.length >= maxLength) {
        break;
      }
    }

    current = next.slice(0, maxLength);
    if (current.length >= maxLength) {
      break;
    }
  }

  return current;
}

function enumerateEdges(grid: Grid): LSystemEdge[] {
  const edges: LSystemEdge[] = [];

  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    const x = cell % grid.width;
    const y = Math.floor(cell / grid.width);

    if (x + 1 < grid.width) {
      edges.push({
        from: cell,
        to: cell + 1,
        wallFrom: WallFlag.East,
        wallTo: WallFlag.West,
      });
    }

    if (y + 1 < grid.height) {
      edges.push({
        from: cell,
        to: cell + grid.width,
        wallFrom: WallFlag.South,
        wallTo: WallFlag.North,
      });
    }
  }

  return edges;
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
