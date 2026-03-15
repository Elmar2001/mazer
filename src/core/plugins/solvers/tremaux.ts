import { OverlayFlag, type Grid } from "@/core/grid";
import type { CellPatch } from "@/core/patches";
import type { SolverPlugin } from "@/core/plugins/SolverPlugin";
import type { AlgorithmStepMeta, SolverRunOptions } from "@/core/plugins/types";
import { buildPath, getOpenNeighbors } from "@/core/plugins/solvers/helpers";
import type { RandomSource } from "@/core/rng";

interface TremauxContext {
  grid: Grid;
  rng: RandomSource;
  startIndex: number;
  goalIndex: number;
  started: boolean;
  current: number;
  previous: number;
  parents: Int32Array;
  discovered: Uint8Array;
  visited: Uint8Array;
  visitedCount: number;
  edgeMarks: Map<number, number>;
}

export const tremauxSolver: SolverPlugin<SolverRunOptions, AlgorithmStepMeta> = {
  id: "tremaux",
  label: "Tremaux (DFS Path-Marking)",
  tier: "alias",
  implementationKind: "alias",
  aliasOf: "dfs",
  create({ grid, rng, options }) {
    const parents = new Int32Array(grid.cellCount);
    parents.fill(-1);

    const context: TremauxContext = {
      grid,
      rng,
      startIndex: options.startIndex,
      goalIndex: options.goalIndex,
      started: false,
      current: options.startIndex,
      previous: -1,
      parents,
      discovered: new Uint8Array(grid.cellCount),
      visited: new Uint8Array(grid.cellCount),
      visitedCount: 0,
      edgeMarks: new Map(),
    };

    return {
      step: () => stepTremaux(context),
    };
  },
};

function stepTremaux(context: TremauxContext) {
  const patches: CellPatch[] = [];

  if (!context.started) {
    context.started = true;
    context.parents[context.startIndex] = context.startIndex;
    context.discovered[context.startIndex] = 1;
    context.visited[context.startIndex] = 1;
    context.visitedCount = 1;

    patches.push({
      index: context.startIndex,
      overlaySet: OverlayFlag.Visited | OverlayFlag.Current | OverlayFlag.Frontier,
    });

    if (context.startIndex === context.goalIndex) {
      patches.push({
        index: context.startIndex,
        overlaySet: OverlayFlag.Path,
        overlayClear: OverlayFlag.Current | OverlayFlag.Frontier,
      });

      return {
        done: true,
        patches,
        meta: {
          line: 1,
          solved: true,
          pathLength: 1,
          visitedCount: context.visitedCount,
          frontierSize: 0,
        },
      };
    }

    return {
      done: false,
      patches,
      meta: {
        line: 1,
        visitedCount: context.visitedCount,
        frontierSize: 1,
      },
    };
  }

  patches.push({
    index: context.current,
    overlayClear: OverlayFlag.Current | OverlayFlag.Frontier,
  });

  if (context.current === context.goalIndex) {
    const path = buildPath(context.startIndex, context.goalIndex, context.parents);
    for (const index of path) {
      patches.push({ index, overlaySet: OverlayFlag.Path });
    }

    return {
      done: true,
      patches,
      meta: {
        line: 5,
        solved: true,
        pathLength: path.length,
        visitedCount: context.visitedCount,
        frontierSize: 0,
      },
    };
  }

  const neighbors = getOpenNeighbors(context.grid, context.current);
  if (neighbors.length === 0) {
    return {
      done: true,
      patches,
      meta: {
        line: 5,
        solved: false,
        visitedCount: context.visitedCount,
        frontierSize: 0,
      },
    };
  }

  const next = selectNextNeighbor(context, neighbors);
  if (next === -1) {
    return {
      done: true,
      patches,
      meta: {
        line: 5,
        solved: false,
        visitedCount: context.visitedCount,
        frontierSize: 0,
      },
    };
  }

  incrementEdgeMark(context, context.current, next);

  const previous = context.current;
  context.current = next;
  context.previous = previous;

  if (context.discovered[next] === 0) {
    context.discovered[next] = 1;
    context.parents[next] = previous;
  }

  if (context.visited[next] === 0) {
    context.visited[next] = 1;
    context.visitedCount += 1;
  }

  patches.push({
    index: next,
    overlaySet: OverlayFlag.Visited | OverlayFlag.Current | OverlayFlag.Frontier,
  });

  if (next === context.goalIndex) {
    const path = buildPath(context.startIndex, context.goalIndex, context.parents);
    for (const index of path) {
      patches.push({
        index,
        overlaySet: OverlayFlag.Path,
      });
    }

    patches.push({
      index: next,
      overlayClear: OverlayFlag.Current | OverlayFlag.Frontier,
    });

    return {
      done: true,
      patches,
      meta: {
        line: 5,
        solved: true,
        pathLength: path.length,
        visitedCount: context.visitedCount,
        frontierSize: 0,
      },
    };
  }

  return {
    done: false,
    patches,
    meta: {
      line: 3,
      visitedCount: context.visitedCount,
      frontierSize: 1,
    },
  };
}

function selectNextNeighbor(context: TremauxContext, neighbors: number[]): number {
  const unmarked: number[] = [];
  const onceMarked: number[] = [];
  const twiceMarked: number[] = [];

  for (const neighbor of neighbors) {
    const mark = edgeMark(context, context.current, neighbor);
    if (mark <= 0) {
      unmarked.push(neighbor);
      continue;
    }

    if (mark === 1) {
      onceMarked.push(neighbor);
      continue;
    }

    twiceMarked.push(neighbor);
  }

  if (unmarked.length > 0) {
    const forwardOnly = unmarked.filter((cell) => cell !== context.previous);
    const choices = forwardOnly.length > 0 ? forwardOnly : unmarked;
    return choices[context.rng.nextInt(choices.length)] as number;
  }

  if (context.previous !== -1) {
    const backtrackMark = edgeMark(context, context.current, context.previous);
    if (backtrackMark === 1) {
      return context.previous;
    }
  }

  if (onceMarked.length > 0) {
    return onceMarked[context.rng.nextInt(onceMarked.length)] as number;
  }

  if (twiceMarked.length > 0) {
    return twiceMarked[context.rng.nextInt(twiceMarked.length)] as number;
  }

  return -1;
}

function incrementEdgeMark(
  context: TremauxContext,
  from: number,
  to: number,
): void {
  const key = edgeKey(from, to, context.grid.cellCount);
  const current = context.edgeMarks.get(key) ?? 0;
  context.edgeMarks.set(key, Math.min(2, current + 1));
}

function edgeMark(context: TremauxContext, from: number, to: number): number {
  const key = edgeKey(from, to, context.grid.cellCount);
  return context.edgeMarks.get(key) ?? 0;
}

function edgeKey(a: number, b: number, cellCount: number): number {
  const min = Math.min(a, b);
  const max = Math.max(a, b);
  return min * cellCount + max;
}
