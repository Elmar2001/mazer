import { carvePatch, neighbors, OverlayFlag, type Grid } from "@/core/grid";
import type { CellPatch } from "@/core/patches";
import type { GeneratorPlugin } from "@/core/plugins/GeneratorPlugin";
import type {
  AlgorithmStepMeta,
  GeneratorRunOptions,
} from "@/core/plugins/types";
import type { RandomSource } from "@/core/rng";

interface ForestEdge {
  a: number;
  b: number;
  wallA: number;
  wallB: number;
  componentA: number;
  componentB: number;
}

interface GrowingForestPlan {
  seeds: number[];
  operations: CellPatch[][];
  growthOpsCount: number;
}

interface GrowingForestContext {
  started: boolean;
  seeds: number[];
  operations: CellPatch[][];
  growthOpsCount: number;
  cursor: number;
  touched: Uint8Array;
  visitedCount: number;
  current: number;
  prevFrontier: number[];
}

export const growingForestGenerator: GeneratorPlugin<
  GeneratorRunOptions,
  AlgorithmStepMeta
> = {
  id: "growing-forest",
  label: "Growing Forest",
  create({ grid, rng }) {
    const plan = planGrowingForest(grid, rng);

    const context: GrowingForestContext = {
      started: false,
      seeds: plan.seeds,
      operations: plan.operations,
      growthOpsCount: plan.growthOpsCount,
      cursor: 0,
      touched: new Uint8Array(grid.cellCount),
      visitedCount: 0,
      current: -1,
      prevFrontier: [],
    };

    return {
      step: () => stepGrowingForest(context),
    };
  },
};

function stepGrowingForest(context: GrowingForestContext) {
  const patches: CellPatch[] = [];

  if (!context.started) {
    context.started = true;

    for (const seed of context.seeds) {
      context.touched[seed] = 1;
      context.visitedCount += 1;
      patches.push({
        index: seed,
        overlaySet: OverlayFlag.Visited | OverlayFlag.Frontier,
      });
    }
    context.prevFrontier = [...context.seeds];

    if (context.seeds.length > 0) {
      context.current = context.seeds[0] as number;
      patches.push({
        index: context.current,
        overlaySet: OverlayFlag.Current,
      });
    }

    return {
      done: context.operations.length === 0,
      patches,
      meta: {
        line: 1,
        visitedCount: context.visitedCount,
        frontierSize: context.operations.length,
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

  for (const index of context.prevFrontier) {
    patches.push({
      index,
      overlayClear: OverlayFlag.Frontier,
    });
  }
  context.prevFrontier = [];

  if (context.cursor >= context.operations.length) {
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

  const operation = context.operations[context.cursor] as CellPatch[];
  context.cursor += 1;
  patches.push(...operation);

  const newFrontier: number[] = [];

  for (const patch of operation) {
    if (context.touched[patch.index] === 1) {
      continue;
    }

    context.touched[patch.index] = 1;
    context.visitedCount += 1;
    patches.push({
      index: patch.index,
      overlaySet: OverlayFlag.Visited | OverlayFlag.Frontier,
    });
    newFrontier.push(patch.index);
  }

  context.prevFrontier = newFrontier;

  const done = context.cursor >= context.operations.length;

  if (!done && operation.length > 0) {
    context.current = operation[operation.length - 1]!.index;
    patches.push({
      index: context.current,
      overlaySet: OverlayFlag.Current,
    });
  }

  return {
    done,
    patches,
    meta: {
      line: context.cursor <= context.growthOpsCount ? 4 : 5,
      visitedCount: context.visitedCount,
      frontierSize: done ? 0 : context.operations.length - context.cursor,
    },
  };
}

function planGrowingForest(grid: Grid, rng: RandomSource): GrowingForestPlan {
  const seedCount = Math.min(
    grid.cellCount,
    Math.max(1, Math.floor(Math.sqrt(grid.cellCount) / 2)),
  );

  const indices = Array.from({ length: grid.cellCount }, (_, index) => index);
  shuffleNumbers(indices, rng);

  const seeds = indices.slice(0, seedCount);
  const componentByCell = new Int32Array(grid.cellCount);
  componentByCell.fill(-1);

  const active: number[] = [];
  for (let i = 0; i < seeds.length; i += 1) {
    const seed = seeds[i] as number;
    componentByCell[seed] = i;
    active.push(seed);
  }

  const operations: CellPatch[][] = [];

  while (active.length > 0) {
    const activePos = rng.nextInt(active.length);
    const current = active[activePos] as number;
    const currentComponent = componentByCell[current] as number;

    const choices = neighbors(grid, current).filter(
      (neighbor) => componentByCell[neighbor.index] === -1,
    );

    if (choices.length === 0) {
      active[activePos] = active[active.length - 1] as number;
      active.pop();
      continue;
    }

    const pick = choices[rng.nextInt(choices.length)]!;
    componentByCell[pick.index] = currentComponent;
    active.push(pick.index);

    operations.push(
      carvePatch(current, pick.index, pick.direction.wall, pick.direction.opposite),
    );
  }

  const growthOpsCount = operations.length;

  if (seeds.length > 1) {
    const boundaryEdges: ForestEdge[] = [];

    for (let y = 0; y < grid.height; y += 1) {
      for (let x = 0; x < grid.width; x += 1) {
        const index = y * grid.width + x;
        const component = componentByCell[index] as number;

        if (x + 1 < grid.width) {
          const right = index + 1;
          const rightComponent = componentByCell[right] as number;
          if (component !== rightComponent) {
            boundaryEdges.push({
              a: index,
              b: right,
              wallA: 2,
              wallB: 8,
              componentA: component,
              componentB: rightComponent,
            });
          }
        }

        if (y + 1 < grid.height) {
          const down = index + grid.width;
          const downComponent = componentByCell[down] as number;
          if (component !== downComponent) {
            boundaryEdges.push({
              a: index,
              b: down,
              wallA: 4,
              wallB: 1,
              componentA: component,
              componentB: downComponent,
            });
          }
        }
      }
    }

    shuffleEdges(boundaryEdges, rng);

    const parent = new Int32Array(seeds.length);
    const rank = new Uint8Array(seeds.length);
    for (let i = 0; i < seeds.length; i += 1) {
      parent[i] = i;
    }

    let components = seeds.length;

    for (const edge of boundaryEdges) {
      if (!union(edge.componentA, edge.componentB, parent, rank)) {
        continue;
      }

      operations.push(carvePatch(edge.a, edge.b, edge.wallA, edge.wallB));
      components -= 1;

      if (components <= 1) {
        break;
      }
    }
  }

  return {
    seeds,
    operations,
    growthOpsCount,
  };
}

function shuffleNumbers(items: number[], rng: RandomSource): void {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = rng.nextInt(i + 1);
    const tmp = items[i] as number;
    items[i] = items[j] as number;
    items[j] = tmp;
  }
}

function shuffleEdges(items: ForestEdge[], rng: RandomSource): void {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = rng.nextInt(i + 1);
    const tmp = items[i] as ForestEdge;
    items[i] = items[j] as ForestEdge;
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
