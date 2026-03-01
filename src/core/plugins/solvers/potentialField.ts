import { OverlayFlag, type Grid } from "@/core/grid";
import type { CellPatch } from "@/core/patches";
import type { SolverPlugin } from "@/core/plugins/SolverPlugin";
import type { AlgorithmStepMeta, SolverRunOptions } from "@/core/plugins/types";
import { buildPath, getOpenNeighbors, manhattan } from "@/core/plugins/solvers/helpers";
import type { RandomSource } from "@/core/rng";

interface PotentialFieldContext {
  grid: Grid;
  rng: RandomSource;
  startIndex: number;
  goalIndex: number;
  currentIndex: number;
  previousCurrent: number;
  parents: Int32Array;
  visitCounts: Uint16Array;
  seen: Uint8Array;
  visitedCount: number;
  stepCount: number;
  maxSteps: number;
  stuckCounter: number;
  escapeSteps: number;
  done: boolean;
  solved: boolean;
  pathLength: number;
}

export const potentialFieldSolver: SolverPlugin<
  SolverRunOptions,
  AlgorithmStepMeta
> = {
  id: "potential-field",
  label: "Artificial Potential Field",
  create({ grid, rng, options }) {
    const parents = new Int32Array(grid.cellCount);
    parents.fill(-1);
    parents[options.startIndex] = options.startIndex;

    const visitCounts = new Uint16Array(grid.cellCount);
    visitCounts[options.startIndex] = 1;

    const seen = new Uint8Array(grid.cellCount);
    seen[options.startIndex] = 1;

    const context: PotentialFieldContext = {
      grid,
      rng,
      startIndex: options.startIndex,
      goalIndex: options.goalIndex,
      currentIndex: options.startIndex,
      previousCurrent: -1,
      parents,
      visitCounts,
      seen,
      visitedCount: 1,
      stepCount: 0,
      maxSteps: grid.cellCount * 10,
      stuckCounter: 0,
      escapeSteps: 0,
      done: false,
      solved: false,
      pathLength: 0,
    };

    return {
      step: () => stepPotentialField(context),
    };
  },
};

function stepPotentialField(context: PotentialFieldContext) {
  const patches: CellPatch[] = [];

  if (context.previousCurrent !== -1) {
    patches.push({
      index: context.previousCurrent,
      overlayClear: OverlayFlag.Current | OverlayFlag.Frontier,
    });
  }

  if (context.done) {
    return {
      done: true,
      patches,
      meta: {
        line: 4,
        visitedCount: context.visitedCount,
        frontierSize: 0,
        solved: context.solved,
        pathLength: context.pathLength,
      },
    };
  }

  if (context.currentIndex === context.goalIndex) {
    finalizeSolved(context, patches);
    return {
      done: true,
      patches,
      meta: {
        line: 4,
        visitedCount: context.visitedCount,
        frontierSize: 0,
        solved: true,
        pathLength: context.pathLength,
      },
    };
  }

  if (context.stepCount >= context.maxSteps) {
    const fallbackPath = bfsShortestPath(context);
    if (fallbackPath.length > 0) {
      for (const index of fallbackPath) {
        patches.push({
          index,
          overlaySet: OverlayFlag.Path,
        });
      }
      context.done = true;
      context.solved = true;
      context.pathLength = fallbackPath.length;
    } else {
      context.done = true;
      context.solved = false;
    }
    return {
      done: true,
      patches,
      meta: {
        line: 4,
        visitedCount: context.visitedCount,
        frontierSize: 0,
        solved: context.solved,
        pathLength: context.pathLength,
      },
    };
  }

  const neighbors = getOpenNeighbors(context.grid, context.currentIndex);
  if (neighbors.length === 0) {
    context.done = true;
    context.solved = false;
    return {
      done: true,
      patches,
      meta: {
        line: 4,
        visitedCount: context.visitedCount,
        frontierSize: 0,
        solved: false,
      },
    };
  }

  let escapeMode = context.escapeSteps > 0;
  let next = choosePotentialNeighbor(context, neighbors);

  if (context.escapeSteps > 0) {
    next = neighbors[context.rng.nextInt(neighbors.length)] as number;
    context.escapeSteps -= 1;
  }

  if ((context.visitCounts[next] as number) >= 3) {
    context.stuckCounter += 1;
  } else {
    context.stuckCounter = Math.max(0, context.stuckCounter - 1);
  }

  if (context.stuckCounter > 4) {
    context.stuckCounter = 0;
    context.escapeSteps = 3;
    next = neighbors[context.rng.nextInt(neighbors.length)] as number;
    escapeMode = true;
  }

  if (context.parents[next] === -1) {
    context.parents[next] = context.currentIndex;
  }

  context.previousCurrent = context.currentIndex;
  context.currentIndex = next;
  context.stepCount += 1;

  context.visitCounts[next] += 1;
  if (context.seen[next] === 0) {
    context.seen[next] = 1;
    context.visitedCount += 1;
  }

  patches.push({
    index: next,
    overlaySet:
      OverlayFlag.Current |
      OverlayFlag.Visited |
      (escapeMode ? OverlayFlag.Frontier : 0),
  });

  if (context.currentIndex === context.goalIndex) {
    finalizeSolved(context, patches);
  }

  return {
    done: context.done,
    patches,
    meta: {
      line: 2,
      visitedCount: context.visitedCount,
      frontierSize: 1,
      solved: context.solved,
      pathLength: context.pathLength,
    },
  };
}

function choosePotentialNeighbor(
  context: PotentialFieldContext,
  neighbors: number[],
): number {
  let best = neighbors[0] as number;
  let bestScore = scoreNeighbor(context, best);

  for (let i = 1; i < neighbors.length; i += 1) {
    const candidate = neighbors[i] as number;
    const candidateScore = scoreNeighbor(context, candidate);

    if (candidateScore < bestScore) {
      best = candidate;
      bestScore = candidateScore;
    }
  }

  return best;
}

function scoreNeighbor(context: PotentialFieldContext, neighbor: number): number {
  const attraction = manhattan(context.grid.width, neighbor, context.goalIndex);
  const degree = getOpenNeighbors(context.grid, neighbor).length;
  const repulsion = degree <= 1 && neighbor !== context.goalIndex ? 1.5 : 0;
  const revisitPenalty = (context.visitCounts[neighbor] as number) * 0.8;
  const noise = (context.visitCounts[neighbor] as number) >= 3 ? context.rng.next() * 0.5 : 0;

  return attraction + repulsion + revisitPenalty + noise;
}

function finalizeSolved(
  context: PotentialFieldContext,
  patches: CellPatch[],
): void {
  const path = buildPath(context.startIndex, context.goalIndex, context.parents);
  for (const index of path) {
    patches.push({
      index,
      overlaySet: OverlayFlag.Path,
    });
  }

  context.done = true;
  context.solved = path.length > 0;
  context.pathLength = path.length;
}

function bfsShortestPath(context: PotentialFieldContext): number[] {
  const parents = new Int32Array(context.grid.cellCount);
  parents.fill(-1);
  parents[context.startIndex] = context.startIndex;

  const queue = [context.startIndex];
  let head = 0;

  while (head < queue.length) {
    const current = queue[head] as number;
    head += 1;

    if (current === context.goalIndex) {
      return buildPath(context.startIndex, context.goalIndex, parents);
    }

    for (const neighbor of getOpenNeighbors(context.grid, current)) {
      if (parents[neighbor] !== -1) {
        continue;
      }

      parents[neighbor] = current;
      queue.push(neighbor);
    }
  }

  return [];
}
