import { OverlayFlag, type Grid } from "@/core/grid";
import type { CellPatch, StepResult } from "@/core/patches";
import type { SolverPlugin } from "@/core/plugins/SolverPlugin";
import type { AlgorithmStepMeta, SolverRunOptions } from "@/core/plugins/types";
import { getOpenNeighbors } from "@/core/plugins/solvers/helpers";
import type { RandomSource } from "@/core/rng";

/**
 * Reinforcement Learning solver using Q-Learning.
 *
 * Each step() runs one full training episode internally, then visualizes the
 * path the agent took during that episode (Frontier overlay). Between episodes
 * the trail clears. Visited overlay accumulates across episodes showing the
 * exploration heatmap. After training the greedy policy is traced as Path.
 */

const ALPHA = 0.3;
const GAMMA = 0.95;
const EPSILON_START = 1.0;
const EPSILON_END = 0.05;
const GOAL_REWARD = 100;
const STEP_PENALTY = -1;
const MIN_EPISODES = 100;
const EPISODES_PER_CELL = 2;
const STALE_LIMIT = 20; // early-stop after this many episodes with no improvement

type Phase = "training" | "greedy";

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
  epsilon: number;

  // Early stopping
  bestGreedyLen: number;
  staleCount: number;

  // Cells drawn last episode (for clearing)
  lastEpisodeCells: number[];

  // Greedy visualization
  greedyPath: number[];
  greedyStep: number;

  // Stats
  visitedCount: number;
  totalVisited: Uint8Array;
}

function neighborSlot(neighbors: number[], neighbor: number): number {
  return neighbors.indexOf(neighbor);
}

function getQ(ctx: QLearningContext, cell: number, neighbor: number): number {
  const neighbors = ctx.neighborCache[cell]!;
  const slot = neighborSlot(neighbors, neighbor);
  if (slot === -1) return -Infinity;
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
  if (neighbors.length === 0) return 0;
  let best = -Infinity;
  for (let i = 0; i < neighbors.length; i++) {
    const q = ctx.qTable[cell * 4 + i]!;
    if (q > best) best = q;
  }
  return best;
}

function chooseAction(ctx: QLearningContext, cell: number): number {
  const neighbors = ctx.neighborCache[cell]!;
  if (neighbors.length === 0) return cell;

  if (ctx.rng.next() < ctx.epsilon) {
    return neighbors[ctx.rng.nextInt(neighbors.length)]!;
  }

  let bestIdx = 0;
  let bestQ = ctx.qTable[cell * 4]!;
  for (let i = 1; i < neighbors.length; i++) {
    const q = ctx.qTable[cell * 4 + i]!;
    if (q > bestQ) {
      bestQ = q;
      bestIdx = i;
    }
  }
  return neighbors[bestIdx]!;
}

function greedyAction(ctx: QLearningContext, cell: number): number {
  const neighbors = ctx.neighborCache[cell]!;
  if (neighbors.length === 0) return cell;
  let bestIdx = 0;
  let bestQ = ctx.qTable[cell * 4]!;
  for (let i = 1; i < neighbors.length; i++) {
    const q = ctx.qTable[cell * 4 + i]!;
    if (q > bestQ) {
      bestQ = q;
      bestIdx = i;
    }
  }
  return neighbors[bestIdx]!;
}

/** Run one full episode internally, return the cells visited. */
function runEpisode(ctx: QLearningContext): number[] {
  const path: number[] = [ctx.startIndex];
  let current = ctx.startIndex;
  const maxSteps = ctx.grid.cellCount * 2;

  for (let s = 0; s < maxSteps; s++) {
    if (current === ctx.goalIndex) break;

    const action = chooseAction(ctx, current);
    const reward = action === ctx.goalIndex ? GOAL_REWARD : STEP_PENALTY;
    const oldQ = getQ(ctx, current, action);
    const newQ = oldQ + ALPHA * (reward + GAMMA * maxQ(ctx, action) - oldQ);
    setQ(ctx, current, action, newQ);

    current = action;
    path.push(current);
  }

  return path;
}

function buildGreedyPath(ctx: QLearningContext): number[] {
  const path: number[] = [ctx.startIndex];
  const visited = new Uint8Array(ctx.grid.cellCount);
  visited[ctx.startIndex] = 1;
  let current = ctx.startIndex;

  for (let i = 0; i < ctx.grid.cellCount; i++) {
    if (current === ctx.goalIndex) break;
    const next = greedyAction(ctx, current);
    if (visited[next]) break;
    visited[next] = 1;
    path.push(next);
    current = next;
  }
  return path;
}

function transitionToGreedy(ctx: QLearningContext): void {
  ctx.phase = "greedy";
  ctx.greedyPath = buildGreedyPath(ctx);
  ctx.greedyStep = 0;
}

export const qLearningSolver: SolverPlugin<
  SolverRunOptions,
  AlgorithmStepMeta
> = {
  id: "q-learning",
  label: "Q-Learning (RL)",
  create({ grid, rng, options }) {
    const neighborCache: number[][] = new Array(grid.cellCount);
    for (let i = 0; i < grid.cellCount; i++) {
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
      epsilon: EPSILON_START,
      bestGreedyLen: Infinity,
      staleCount: 0,
      lastEpisodeCells: [],
      greedyPath: [],
      greedyStep: 0,
      visitedCount: 0,
      totalVisited: new Uint8Array(grid.cellCount),
    };

    return { step: () => stepQLearning(ctx) };
  },
};

function stepQLearning(
  ctx: QLearningContext,
): StepResult<AlgorithmStepMeta> {
  if (ctx.phase === "training") {
    return stepTraining(ctx);
  }
  return stepGreedy(ctx);
}

function stepTraining(
  ctx: QLearningContext,
): StepResult<AlgorithmStepMeta> {
  const patches: CellPatch[] = [];

  // Clear previous episode's Frontier/Current overlays
  for (const cell of ctx.lastEpisodeCells) {
    patches.push({
      index: cell,
      overlayClear: OverlayFlag.Frontier | OverlayFlag.Current,
    });
  }

  // Run one full episode internally
  const episodePath = runEpisode(ctx);
  ctx.episode++;
  ctx.epsilon =
    EPSILON_START -
    (EPSILON_START - EPSILON_END) * (ctx.episode / ctx.maxEpisodes);

  // Visualize: mark cells visited during this episode
  const episodeCellSet = new Set(episodePath);
  const episodeCells = [...episodeCellSet];
  ctx.lastEpisodeCells = episodeCells;

  for (const cell of episodeCells) {
    if (!ctx.totalVisited[cell]) {
      ctx.totalVisited[cell] = 1;
      ctx.visitedCount++;
    }
    patches.push({
      index: cell,
      overlaySet: OverlayFlag.Visited | OverlayFlag.Frontier,
    });
  }

  // Mark agent's final position
  const lastCell = episodePath[episodePath.length - 1]!;
  patches.push({ index: lastCell, overlaySet: OverlayFlag.Current });

  // Early stopping: check if greedy path improved
  const greedyNow = buildGreedyPath(ctx);
  const reachedGoal = greedyNow[greedyNow.length - 1] === ctx.goalIndex;
  if (reachedGoal && greedyNow.length < ctx.bestGreedyLen) {
    ctx.bestGreedyLen = greedyNow.length;
    ctx.staleCount = 0;
  } else if (reachedGoal) {
    ctx.staleCount++;
  }

  const shouldStop =
    ctx.episode >= ctx.maxEpisodes ||
    (reachedGoal && ctx.staleCount >= STALE_LIMIT);

  if (shouldStop) {
    transitionToGreedy(ctx);
  }

  return {
    done: false,
    patches,
    meta: {
      line: shouldStop ? 3 : ctx.episode <= 1 ? 1 : 2,
      visitedCount: ctx.visitedCount,
      frontierSize: episodeCells.length,
      episode: ctx.episode,
    },
  };
}

function stepGreedy(
  ctx: QLearningContext,
): StepResult<AlgorithmStepMeta> {
  const patches: CellPatch[] = [];
  const path = ctx.greedyPath;
  const i = ctx.greedyStep;

  // First greedy step: clear all Frontier/Current from training
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

  ctx.greedyStep++;

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
