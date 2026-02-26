import { OverlayFlag, type Grid } from "@/core/grid";
import type { CellPatch, StepResult } from "@/core/patches";
import type { SolverPlugin } from "@/core/plugins/SolverPlugin";
import type { AlgorithmStepMeta, SolverRunOptions } from "@/core/plugins/types";
import { getOpenNeighbors } from "@/core/plugins/solvers/helpers";
import type { RandomSource } from "@/core/rng";

/**
 * Reinforcement Learning solver using Q-Learning.
 *
 * Training is visualized step-by-step: each step() moves the agent one cell
 * within the current episode. Between episodes the overlay resets.
 * After training, the greedy policy is traced as the final path.
 */

const ALPHA = 0.2;
const GAMMA = 0.95;
const EPSILON_START = 1.0;
const EPSILON_END = 0.05;
const MIN_EPISODES = 200;
const EPISODES_PER_CELL = 3;
const GOAL_REWARD = 100;
const STEP_PENALTY = -1;

type Phase = "training" | "greedy";

interface QLearningContext {
  grid: Grid;
  rng: RandomSource;
  startIndex: number;
  goalIndex: number;

  qTable: Float64Array;
  neighborCache: number[][];

  // Training
  phase: Phase;
  episode: number;
  maxEpisodes: number;
  epsilon: number;
  agentPos: number;
  episodeSteps: number;
  maxEpisodeSteps: number;
  // Track cells visited in current episode for overlay clearing
  episodeCells: number[];

  // Greedy visualization
  greedyPath: number[];
  greedyStep: number;

  // Global stats
  visitedCount: number;
  totalVisited: Uint8Array; // ever-visited across all episodes
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

/** Clear episode-specific overlays (Frontier + Current) for all episode cells. */
function clearEpisodeOverlays(ctx: QLearningContext): CellPatch[] {
  const patches: CellPatch[] = [];
  for (const cell of ctx.episodeCells) {
    patches.push({
      index: cell,
      overlayClear: OverlayFlag.Frontier | OverlayFlag.Current,
    });
  }
  return patches;
}

function startNewEpisode(ctx: QLearningContext): void {
  ctx.agentPos = ctx.startIndex;
  ctx.episodeSteps = 0;
  ctx.episodeCells = [];
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
      grid.cellCount * EPISODES_PER_CELL,
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
      agentPos: options.startIndex,
      episodeSteps: 0,
      maxEpisodeSteps: grid.cellCount * 2,
      episodeCells: [],
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

  // Start of a new episode
  if (ctx.episodeSteps === 0) {
    startNewEpisode(ctx);

    // Mark start cell
    ctx.episodeCells.push(ctx.startIndex);
    if (!ctx.totalVisited[ctx.startIndex]) {
      ctx.totalVisited[ctx.startIndex] = 1;
      ctx.visitedCount++;
    }
    patches.push({
      index: ctx.startIndex,
      overlaySet: OverlayFlag.Frontier | OverlayFlag.Current,
    });
    ctx.episodeSteps++;

    return {
      done: false,
      patches,
      meta: {
        line: 1,
        visitedCount: ctx.visitedCount,
        frontierSize: 0,
        episode: ctx.episode + 1,
      },
    };
  }

  // Check if episode should end (reached goal or step limit)
  const shouldEndEpisode =
    ctx.agentPos === ctx.goalIndex ||
    ctx.episodeSteps >= ctx.maxEpisodeSteps;

  if (shouldEndEpisode) {
    // Clear episode overlays
    patches.push(...clearEpisodeOverlays(ctx));

    // Advance to next episode
    ctx.episode++;
    ctx.epsilon =
      EPSILON_START -
      (EPSILON_START - EPSILON_END) * (ctx.episode / ctx.maxEpisodes);

    if (ctx.episode >= ctx.maxEpisodes) {
      // Training done — transition to greedy phase
      ctx.phase = "greedy";
      ctx.greedyPath = buildGreedyPath(ctx);
      ctx.greedyStep = 0;

      return {
        done: false,
        patches,
        meta: {
          line: 3,
          visitedCount: ctx.visitedCount,
          frontierSize: 0,
          episode: ctx.episode,
        },
      };
    }

    // Reset for next episode
    ctx.episodeSteps = 0;

    return {
      done: false,
      patches,
      meta: {
        line: 2,
        visitedCount: ctx.visitedCount,
        frontierSize: 0,
        episode: ctx.episode,
      },
    };
  }

  // Move agent one step within the episode
  const current = ctx.agentPos;
  const action = chooseAction(ctx, current);

  // Q-update
  const reward = action === ctx.goalIndex ? GOAL_REWARD : STEP_PENALTY;
  const oldQ = getQ(ctx, current, action);
  const newQ = oldQ + ALPHA * (reward + GAMMA * maxQ(ctx, action) - oldQ);
  setQ(ctx, current, action, newQ);

  // Clear current marker from old position
  patches.push({
    index: current,
    overlayClear: OverlayFlag.Current,
  });

  // Move agent
  ctx.agentPos = action;
  ctx.episodeSteps++;
  ctx.episodeCells.push(action);

  if (!ctx.totalVisited[action]) {
    ctx.totalVisited[action] = 1;
    ctx.visitedCount++;
    // Visited overlay persists across episodes to show exploration coverage
    patches.push({ index: action, overlaySet: OverlayFlag.Visited });
  }

  // Frontier = current episode trail, Current = agent head
  patches.push({
    index: action,
    overlaySet: OverlayFlag.Frontier | OverlayFlag.Current,
  });

  return {
    done: false,
    patches,
    meta: {
      line: 2,
      visitedCount: ctx.visitedCount,
      frontierSize: ctx.episodeSteps,
      episode: ctx.episode + 1,
    },
  };
}

function stepGreedy(
  ctx: QLearningContext,
): StepResult<AlgorithmStepMeta> {
  const patches: CellPatch[] = [];
  const path = ctx.greedyPath;
  const i = ctx.greedyStep;

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
