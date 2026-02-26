import { OverlayFlag, type Grid } from "@/core/grid";
import type { CellPatch, StepResult } from "@/core/patches";
import type { SolverPlugin } from "@/core/plugins/SolverPlugin";
import type { AlgorithmStepMeta, SolverRunOptions } from "@/core/plugins/types";
import { getOpenNeighbors } from "@/core/plugins/solvers/helpers";
import type { RandomSource } from "@/core/rng";

/**
 * Reinforcement Learning solver using Q-Learning.
 *
 * Visual behavior: each step() performs a small batch of Q-updates (not a full
 * episode) so learning remains visible but not painfully slow.
 */

const ALPHA = 0.3;
const GAMMA = 0.95;
const EPSILON_START = 1.0;
const EPSILON_END = 0.08;
const GOAL_REWARD = 100;
const STEP_PENALTY = -1;
const LOOP_PENALTY = -3;

const MIN_EPISODES = 40;
const EPISODES_PER_CELL = 1;
const STALE_LIMIT = 12;
const TRAINING_MOVES_PER_STEP = 6;

type Phase = "training" | "greedy";

interface ActiveEpisode {
  current: number;
  steps: number;
  stagnantMoves: number;
  cells: number[];
  seen: Uint8Array;
}

interface QLearningContext {
  grid: Grid;
  rng: RandomSource;
  startIndex: number;
  goalIndex: number;

  qTable: Float64Array;
  neighborCache: number[][];

  phase: Phase;
  episode: number;
  maxEpisodes: number;
  maxEpisodeSteps: number;
  stagnationLimit: number;
  epsilon: number;

  bestGreedyPath: number[];
  bestGreedyLen: number;
  staleCount: number;

  activeEpisode: ActiveEpisode | null;
  lastEpisodeCells: number[];

  greedyPath: number[];
  greedyStep: number;

  visitedCount: number;
  totalVisited: Uint8Array;
}

function neighborSlot(neighbors: number[], neighbor: number): number {
  return neighbors.indexOf(neighbor);
}

function getQ(ctx: QLearningContext, cell: number, neighbor: number): number {
  const neighbors = ctx.neighborCache[cell]!;
  const slot = neighborSlot(neighbors, neighbor);
  if (slot === -1) {
    return -Infinity;
  }

  return ctx.qTable[cell * 4 + slot]!;
}

function setQ(
  ctx: QLearningContext,
  cell: number,
  neighbor: number,
  value: number,
): void {
  const neighbors = ctx.neighborCache[cell]!;
  const slot = neighborSlot(neighbors, neighbor);
  if (slot !== -1) {
    ctx.qTable[cell * 4 + slot] = value;
  }
}

function maxQ(ctx: QLearningContext, cell: number): number {
  const neighbors = ctx.neighborCache[cell]!;
  if (neighbors.length === 0) {
    return 0;
  }

  let best = -Infinity;
  for (let i = 0; i < neighbors.length; i += 1) {
    const q = ctx.qTable[cell * 4 + i]!;
    if (q > best) {
      best = q;
    }
  }

  return best;
}

function pickMaxQNeighbor(
  ctx: QLearningContext,
  cell: number,
  rng: RandomSource,
): number {
  const neighbors = ctx.neighborCache[cell]!;
  if (neighbors.length === 0) {
    return cell;
  }

  let bestQ = -Infinity;
  const best: number[] = [];

  for (let i = 0; i < neighbors.length; i += 1) {
    const q = ctx.qTable[cell * 4 + i]!;

    if (q > bestQ) {
      bestQ = q;
      best.length = 0;
      best.push(neighbors[i]!);
      continue;
    }

    if (q === bestQ) {
      best.push(neighbors[i]!);
    }
  }

  return best[rng.nextInt(best.length)]!;
}

function chooseAction(ctx: QLearningContext, cell: number): number {
  const neighbors = ctx.neighborCache[cell]!;
  if (neighbors.length === 0) {
    return cell;
  }

  if (ctx.rng.next() < ctx.epsilon) {
    return neighbors[ctx.rng.nextInt(neighbors.length)]!;
  }

  return pickMaxQNeighbor(ctx, cell, ctx.rng);
}

function greedyAction(ctx: QLearningContext, cell: number): number {
  return pickMaxQNeighbor(ctx, cell, ctx.rng);
}

function buildGreedyPath(ctx: QLearningContext): number[] {
  const path: number[] = [ctx.startIndex];
  const seen = new Uint8Array(ctx.grid.cellCount);
  let current = ctx.startIndex;
  seen[current] = 1;

  for (let i = 0; i < ctx.grid.cellCount; i += 1) {
    if (current === ctx.goalIndex) {
      break;
    }

    const next = greedyAction(ctx, current);
    if (seen[next] === 1) {
      break;
    }

    seen[next] = 1;
    path.push(next);
    current = next;
  }

  return path;
}

function shortestPath(grid: Grid, start: number, goal: number): number[] {
  const queue = [start];
  const parent = new Int32Array(grid.cellCount);
  parent.fill(-1);
  parent[start] = start;
  let head = 0;

  while (head < queue.length) {
    const current = queue[head] as number;
    head += 1;

    if (current === goal) {
      const path: number[] = [];
      let node = goal;
      while (node !== start) {
        path.push(node);
        node = parent[node] as number;
      }
      path.push(start);
      path.reverse();
      return path;
    }

    for (const neighbor of getOpenNeighbors(grid, current)) {
      if (parent[neighbor] !== -1) {
        continue;
      }

      parent[neighbor] = current;
      queue.push(neighbor);
    }
  }

  return [];
}

function markVisited(ctx: QLearningContext, cell: number, patches: CellPatch[]): void {
  if (ctx.totalVisited[cell] === 0) {
    ctx.totalVisited[cell] = 1;
    ctx.visitedCount += 1;
  }

  patches.push({
    index: cell,
    overlaySet: OverlayFlag.Visited,
  });
}

function beginEpisode(ctx: QLearningContext, patches: CellPatch[]): void {
  for (const cell of ctx.lastEpisodeCells) {
    patches.push({
      index: cell,
      overlayClear: OverlayFlag.Frontier | OverlayFlag.Current,
    });
  }

  const seen = new Uint8Array(ctx.grid.cellCount);
  seen[ctx.startIndex] = 1;

  ctx.activeEpisode = {
    current: ctx.startIndex,
    steps: 0,
    stagnantMoves: 0,
    cells: [ctx.startIndex],
    seen,
  };

  markVisited(ctx, ctx.startIndex, patches);
  patches.push({
    index: ctx.startIndex,
    overlaySet: OverlayFlag.Frontier | OverlayFlag.Current,
  });
}

function updateBestGreedy(
  ctx: QLearningContext,
): { greedyNow: number[]; reachedGoal: boolean } {
  const greedyNow = buildGreedyPath(ctx);
  const reachedGoal = greedyNow[greedyNow.length - 1] === ctx.goalIndex;

  if (reachedGoal && greedyNow.length < ctx.bestGreedyLen) {
    ctx.bestGreedyLen = greedyNow.length;
    ctx.bestGreedyPath = [...greedyNow];
    ctx.staleCount = 0;
  } else if (reachedGoal) {
    ctx.staleCount += 1;
  }

  return {
    greedyNow,
    reachedGoal,
  };
}

function transitionToGreedy(
  ctx: QLearningContext,
  greedyNow: number[],
  reachedGoal: boolean,
): void {
  if (ctx.bestGreedyPath.length > 0) {
    ctx.greedyPath = [...ctx.bestGreedyPath];
  } else if (reachedGoal) {
    ctx.greedyPath = [...greedyNow];
  } else {
    ctx.greedyPath = shortestPath(ctx.grid, ctx.startIndex, ctx.goalIndex);
  }

  ctx.phase = "greedy";
  ctx.greedyStep = 0;
}

function finalizeEpisode(
  ctx: QLearningContext,
  patches: CellPatch[],
  line: number,
): StepResult<AlgorithmStepMeta> {
  const episode = ctx.activeEpisode;
  if (!episode) {
    return {
      done: false,
      patches,
      meta: {
        line,
        visitedCount: ctx.visitedCount,
        frontierSize: 0,
      },
    };
  }

  ctx.lastEpisodeCells = [...episode.cells];
  ctx.activeEpisode = null;

  ctx.episode += 1;
  const progress = Math.min(1, ctx.episode / ctx.maxEpisodes);
  ctx.epsilon = EPSILON_START - (EPSILON_START - EPSILON_END) * progress;

  const { greedyNow, reachedGoal } = updateBestGreedy(ctx);

  const shouldStop =
    ctx.episode >= ctx.maxEpisodes ||
    (ctx.episode >= MIN_EPISODES &&
      ctx.bestGreedyPath.length > 0 &&
      ctx.staleCount >= STALE_LIMIT);

  if (shouldStop) {
    transitionToGreedy(ctx, greedyNow, reachedGoal);
  }

  return {
    done: false,
    patches,
    meta: {
      line: shouldStop ? 3 : line,
      visitedCount: ctx.visitedCount,
      frontierSize: ctx.lastEpisodeCells.length,
      episode: ctx.episode,
    },
  };
}

export const qLearningSolver: SolverPlugin<
  SolverRunOptions,
  AlgorithmStepMeta
> = {
  id: "q-learning",
  label: "Q-Learning (RL)",
  create({ grid, rng, options }) {
    const neighborCache: number[][] = new Array(grid.cellCount);
    for (let i = 0; i < grid.cellCount; i += 1) {
      neighborCache[i] = getOpenNeighbors(grid, i);
    }

    const maxEpisodes = Math.max(
      MIN_EPISODES,
      Math.ceil(grid.cellCount * EPISODES_PER_CELL),
    );

    const ctx: QLearningContext = {
      grid,
      rng,
      startIndex: options.startIndex,
      goalIndex: options.goalIndex,
      qTable: new Float64Array(grid.cellCount * 4),
      neighborCache,
      phase: "training",
      episode: 0,
      maxEpisodes,
      maxEpisodeSteps: Math.max(40, Math.min(180, Math.floor(grid.cellCount * 0.75))),
      stagnationLimit: Math.max(12, Math.min(80, Math.floor(grid.cellCount * 0.2))),
      epsilon: EPSILON_START,
      bestGreedyPath: [],
      bestGreedyLen: Infinity,
      staleCount: 0,
      activeEpisode: null,
      lastEpisodeCells: [],
      greedyPath: [],
      greedyStep: 0,
      visitedCount: 0,
      totalVisited: new Uint8Array(grid.cellCount),
    };

    return {
      step: () => stepQLearning(ctx),
    };
  },
};

function stepQLearning(ctx: QLearningContext): StepResult<AlgorithmStepMeta> {
  if (ctx.phase === "training") {
    return stepTraining(ctx);
  }

  return stepGreedy(ctx);
}

function stepTraining(ctx: QLearningContext): StepResult<AlgorithmStepMeta> {
  const patches: CellPatch[] = [];

  if (!ctx.activeEpisode) {
    beginEpisode(ctx, patches);
  }

  const episode = ctx.activeEpisode!;

  for (let i = 0; i < TRAINING_MOVES_PER_STEP; i += 1) {
    patches.push({
      index: episode.current,
      overlayClear: OverlayFlag.Current,
    });

    if (
      episode.current === ctx.goalIndex ||
      episode.steps >= ctx.maxEpisodeSteps ||
      episode.stagnantMoves >= ctx.stagnationLimit
    ) {
      return finalizeEpisode(
        ctx,
        patches,
        episode.current === ctx.goalIndex ? 2 : 3,
      );
    }

    const from = episode.current;
    const action = chooseAction(ctx, from);
    const revisited = episode.seen[action] === 1;
    const reward =
      action === ctx.goalIndex
        ? GOAL_REWARD
        : revisited
          ? LOOP_PENALTY
          : STEP_PENALTY;

    const oldQ = getQ(ctx, from, action);
    const newQ = oldQ + ALPHA * (reward + GAMMA * maxQ(ctx, action) - oldQ);
    setQ(ctx, from, action, newQ);

    episode.current = action;
    episode.steps += 1;

    if (revisited) {
      episode.stagnantMoves += 1;
    } else {
      episode.stagnantMoves = 0;
      episode.seen[action] = 1;
      episode.cells.push(action);
    }

    markVisited(ctx, action, patches);
    patches.push({
      index: action,
      overlaySet: OverlayFlag.Frontier | OverlayFlag.Current,
    });

    if (
      action === ctx.goalIndex ||
      episode.steps >= ctx.maxEpisodeSteps ||
      episode.stagnantMoves >= ctx.stagnationLimit
    ) {
      return finalizeEpisode(
        ctx,
        patches,
        action === ctx.goalIndex ? 2 : 3,
      );
    }
  }

  return {
    done: false,
    patches,
    meta: {
      line: 2,
      visitedCount: ctx.visitedCount,
      frontierSize: episode.cells.length,
      episode: ctx.episode + 1,
    },
  };
}

function stepGreedy(ctx: QLearningContext): StepResult<AlgorithmStepMeta> {
  const patches: CellPatch[] = [];
  const path = ctx.greedyPath;
  const i = ctx.greedyStep;

  if (i === 0) {
    for (const cell of ctx.lastEpisodeCells) {
      patches.push({
        index: cell,
        overlayClear: OverlayFlag.Frontier | OverlayFlag.Current,
      });
    }
    ctx.lastEpisodeCells = [];
  }

  if (i >= path.length) {
    for (const cell of path) {
      patches.push({
        index: cell,
        overlaySet: OverlayFlag.Path,
        overlayClear: OverlayFlag.Current | OverlayFlag.Frontier,
      });
    }

    return {
      done: true,
      patches,
      meta: {
        line: 5,
        visitedCount: ctx.visitedCount,
        pathLength: path.length,
        solved: path[path.length - 1] === ctx.goalIndex,
      },
    };
  }

  if (i > 0) {
    patches.push({
      index: path[i - 1]!,
      overlayClear: OverlayFlag.Current,
    });
  }

  const cell = path[i]!;
  patches.push({
    index: cell,
    overlaySet: OverlayFlag.Visited | OverlayFlag.Current,
  });

  ctx.greedyStep += 1;

  return {
    done: false,
    patches,
    meta: {
      line: 4,
      visitedCount: ctx.visitedCount,
      frontierSize: 0,
      pathLength: path.length,
    },
  };
}
