import { carvePatch, neighbors, OverlayFlag, type Grid } from "@/core/grid";
import type { CellPatch } from "@/core/patches";
import type { GeneratorPlugin } from "@/core/plugins/GeneratorPlugin";
import type {
  AlgorithmStepMeta,
  GeneratorRunOptions,
} from "@/core/plugins/types";
import type { RandomSource } from "@/core/rng";

interface BfsTreeContext {
  grid: Grid;
  rng: RandomSource;
  started: boolean;
  queue: number[];
  head: number;
  visited: Uint8Array;
  visitedCount: number;
  current: number;
}

export const bfsTreeGenerator: GeneratorPlugin<
  GeneratorRunOptions,
  AlgorithmStepMeta
> = {
  id: "bfs-tree",
  label: "Randomized BFS Tree (Growing Tree)",
  implementationKind: "alias",
  aliasOf: "growing-tree",
  create({ grid, rng, options }) {
    const start =
      typeof options.startIndex === "number" &&
      options.startIndex >= 0 &&
      options.startIndex < grid.cellCount
        ? options.startIndex
        : rng.nextInt(grid.cellCount);

    const context: BfsTreeContext = {
      grid,
      rng,
      started: false,
      queue: [start],
      head: 0,
      visited: new Uint8Array(grid.cellCount),
      visitedCount: 0,
      current: -1,
    };

    return {
      step: () => stepBfsTree(context),
    };
  },
};

function stepBfsTree(context: BfsTreeContext) {
  const patches: CellPatch[] = [];

  if (!context.started) {
    context.started = true;
    const start = context.queue[0] as number;
    context.visited[start] = 1;
    context.visitedCount = 1;
    context.current = start;

    patches.push({
      index: start,
      overlaySet: OverlayFlag.Visited | OverlayFlag.Frontier | OverlayFlag.Current,
    });

    return {
      done: context.grid.cellCount <= 1,
      patches,
      meta: {
        line: 1,
        visitedCount: context.visitedCount,
        frontierSize: context.queue.length - context.head,
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

  if (context.head >= context.queue.length) {
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

  const cell = context.queue[context.head] as number;
  context.head += 1;
  context.current = cell;

  patches.push({
    index: cell,
    overlayClear: OverlayFlag.Frontier,
  });

  const available = neighbors(context.grid, cell);
  shuffleInPlace(available, context.rng);

  for (const neighbor of available) {
    if (context.visited[neighbor.index] === 1) {
      continue;
    }

    context.visited[neighbor.index] = 1;
    context.visitedCount += 1;
    context.queue.push(neighbor.index);

    patches.push(
      ...carvePatch(
        cell,
        neighbor.index,
        neighbor.direction.wall,
        neighbor.direction.opposite,
      ),
    );

    patches.push({
      index: neighbor.index,
      overlaySet: OverlayFlag.Visited | OverlayFlag.Frontier,
    });
  }

  if (context.head < context.queue.length) {
    patches.push({
      index: context.queue[context.head] as number,
      overlaySet: OverlayFlag.Current,
    });
    context.current = context.queue[context.head] as number;
  }

  const frontierSize = context.queue.length - context.head;

  return {
    done: context.visitedCount >= context.grid.cellCount && frontierSize === 0,
    patches,
    meta: {
      line: 4,
      visitedCount: context.visitedCount,
      frontierSize,
    },
  };
}

function shuffleInPlace<T>(items: T[], rng: RandomSource): void {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = rng.nextInt(i + 1);
    const temp = items[i] as T;
    items[i] = items[j] as T;
    items[j] = temp;
  }
}
