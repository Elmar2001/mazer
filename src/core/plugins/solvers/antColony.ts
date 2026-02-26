import { OverlayFlag, type Grid } from "@/core/grid";
import type { CellPatch, StepResult } from "@/core/patches";
import type { SolverPlugin } from "@/core/plugins/SolverPlugin";
import type { AlgorithmStepMeta, SolverRunOptions } from "@/core/plugins/types";
import { getOpenNeighbors } from "@/core/plugins/solvers/helpers";
import type { RandomSource } from "@/core/rng";

/**
 * Ant Colony Optimization solver.
 *
 * Training is visualized: each ant walks cell-by-cell within a generation.
 * Between generations pheromones evaporate and deposit.
 * After training, the best path is traced as the final solution.
 */

const NUM_ANTS = 10;
const MIN_GENERATIONS = 50;
const GENERATIONS_PER_CELL = 1;
const PHEROMONE_ALPHA = 1;
const HEURISTIC_BETA = 2;
const EVAPORATION_RATE = 0.1;
const INITIAL_PHEROMONE = 1.0;
const ELITE_BONUS = 2.0;

type Phase = "ant-walking" | "generation-end" | "greedy";

interface ACOContext {
  grid: Grid;
  rng: RandomSource;
  startIndex: number;
  goalIndex: number;

  pheromone: Float64Array;
  neighborCache: number[][];

  // Training state
  phase: Phase;
  generation: number;
  maxGenerations: number;
  bestPath: number[];
  bestPathLength: number;

  // Current ant state
  antIndex: number; // which ant (0..NUM_ANTS-1)
  antPos: number;
  antPath: number[];
  antVisited: Uint8Array;
  antCells: number[]; // cells drawn for this ant (for clearing)

  // Generation results
  genPaths: number[][]; // successful ant paths this generation

  // Greedy visualization
  vizStep: number;

  // Global stats
  visitedCount: number;
  totalVisited: Uint8Array;
}

function neighborSlot(neighbors: number[], neighbor: number): number {
  return neighbors.indexOf(neighbor);
}

function getPheromone(ctx: ACOContext, from: number, to: number): number {
  const neighbors = ctx.neighborCache[from]!;
  const slot = neighborSlot(neighbors, to);
  if (slot === -1) return 0;
  return ctx.pheromone[from * 4 + slot]!;
}

function addPheromone(
  ctx: ACOContext,
  from: number,
  to: number,
  amount: number,
): void {
  const neighbors = ctx.neighborCache[from]!;
  const slot = neighborSlot(neighbors, to);
  if (slot !== -1) {
    ctx.pheromone[from * 4 + slot] += amount;
  }
}

function evaporatePheromones(ctx: ACOContext): void {
  for (let i = 0; i < ctx.pheromone.length; i++) {
    ctx.pheromone[i] *= 1 - EVAPORATION_RATE;
  }
}

function depositPheromone(
  ctx: ACOContext,
  path: number[],
  bonus: number,
): void {
  const amount = 1.0 / path.length + bonus;
  for (let i = 0; i < path.length - 1; i++) {
    addPheromone(ctx, path[i]!, path[i + 1]!, amount);
    addPheromone(ctx, path[i + 1]!, path[i]!, amount);
  }
}

/** Pick next cell for current ant using pheromone-weighted probabilities. */
function pickNextCell(ctx: ACOContext): number | null {
  const current = ctx.antPos;
  const neighbors = ctx.neighborCache[current]!;

  const candidates: number[] = [];
  for (const n of neighbors) {
    if (!ctx.antVisited[n]) candidates.push(n);
  }

  if (candidates.length === 0) return null; // dead end

  const weights: number[] = new Array(candidates.length);
  let totalWeight = 0;

  for (let i = 0; i < candidates.length; i++) {
    const tau = Math.max(getPheromone(ctx, current, candidates[i]!), 0.001);
    const w = Math.pow(tau, PHEROMONE_ALPHA) * Math.pow(1.0, HEURISTIC_BETA);
    weights[i] = w;
    totalWeight += w;
  }

  let r = ctx.rng.next() * totalWeight;
  let chosen = candidates[candidates.length - 1]!;
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i]!;
    if (r <= 0) {
      chosen = candidates[i]!;
      break;
    }
  }

  return chosen;
}

function startNewAnt(ctx: ACOContext): void {
  ctx.antPos = ctx.startIndex;
  ctx.antPath = [ctx.startIndex];
  ctx.antVisited = new Uint8Array(ctx.grid.cellCount);
  ctx.antVisited[ctx.startIndex] = 1;
  ctx.antCells = [];
}

/** Clear overlay marks from the current ant's trail. */
function clearAntOverlays(ctx: ACOContext): CellPatch[] {
  const patches: CellPatch[] = [];
  for (const cell of ctx.antCells) {
    patches.push({
      index: cell,
      overlayClear: OverlayFlag.Frontier | OverlayFlag.Current,
    });
  }
  return patches;
}

export const antColonySolver: SolverPlugin<
  SolverRunOptions,
  AlgorithmStepMeta
> = {
  id: "ant-colony",
  label: "Ant Colony Optimization",
  create({ grid, rng, options }) {
    const neighborCache: number[][] = new Array(grid.cellCount);
    for (let i = 0; i < grid.cellCount; i++) {
      neighborCache[i] = getOpenNeighbors(grid, i);
    }

    const pheromone = new Float64Array(grid.cellCount * 4);
    pheromone.fill(INITIAL_PHEROMONE);

    const maxGenerations = Math.max(
      MIN_GENERATIONS,
      grid.cellCount * GENERATIONS_PER_CELL,
    );

    const ctx: ACOContext = {
      grid,
      rng,
      startIndex: options.startIndex,
      goalIndex: options.goalIndex,
      pheromone,
      neighborCache,
      phase: "ant-walking",
      generation: 0,
      maxGenerations,
      bestPath: [],
      bestPathLength: Infinity,
      antIndex: 0,
      antPos: options.startIndex,
      antPath: [options.startIndex],
      antVisited: new Uint8Array(grid.cellCount),
      antCells: [],
      genPaths: [],
      vizStep: 0,
      visitedCount: 0,
      totalVisited: new Uint8Array(grid.cellCount),
    };

    ctx.antVisited[options.startIndex] = 1;

    return { step: () => stepACO(ctx) };
  },
};

function stepACO(ctx: ACOContext): StepResult<AlgorithmStepMeta> {
  switch (ctx.phase) {
    case "ant-walking":
      return stepAntWalking(ctx);
    case "generation-end":
      return stepGenerationEnd(ctx);
    case "greedy":
      return stepGreedy(ctx);
  }
}

function stepAntWalking(
  ctx: ACOContext,
): StepResult<AlgorithmStepMeta> {
  const patches: CellPatch[] = [];
  const maxSteps = ctx.grid.cellCount * 4;

  // Ant reached goal or walked too long — finish this ant
  if (
    ctx.antPos === ctx.goalIndex ||
    ctx.antPath.length >= maxSteps
  ) {
    // Record successful path
    if (ctx.antPos === ctx.goalIndex) {
      ctx.genPaths.push([...ctx.antPath]);
    }

    // Clear this ant's trail
    patches.push(...clearAntOverlays(ctx));

    // Advance to next ant or next generation
    ctx.antIndex++;
    if (ctx.antIndex >= NUM_ANTS) {
      ctx.phase = "generation-end";
      return {
        done: false,
        patches,
        meta: {
          line: 3,
          visitedCount: ctx.visitedCount,
          frontierSize: 0,
          generation: ctx.generation + 1,
          bestPathLength:
            ctx.bestPathLength === Infinity ? 0 : ctx.bestPathLength,
        },
      };
    }

    // Start next ant
    startNewAnt(ctx);
    ctx.antCells.push(ctx.startIndex);
    patches.push({
      index: ctx.startIndex,
      overlaySet: OverlayFlag.Frontier | OverlayFlag.Current,
    });

    return {
      done: false,
      patches,
      meta: {
        line: 1,
        visitedCount: ctx.visitedCount,
        frontierSize: 1,
        generation: ctx.generation + 1,
        bestPathLength:
          ctx.bestPathLength === Infinity ? 0 : ctx.bestPathLength,
      },
    };
  }

  // Move ant one step
  const next = pickNextCell(ctx);

  if (next === null) {
    // Dead end — backtrack
    if (ctx.antPath.length <= 1) {
      // Fully stuck, end this ant
      ctx.antPos = ctx.goalIndex; // will trigger ant-end on next step
      // Actually just mark as stuck so next call finishes this ant
      patches.push(...clearAntOverlays(ctx));
      ctx.antIndex++;
      if (ctx.antIndex >= NUM_ANTS) {
        ctx.phase = "generation-end";
      } else {
        startNewAnt(ctx);
        ctx.antCells.push(ctx.startIndex);
        patches.push({
          index: ctx.startIndex,
          overlaySet: OverlayFlag.Frontier | OverlayFlag.Current,
        });
      }
      return {
        done: false,
        patches,
        meta: {
          line: 2,
          visitedCount: ctx.visitedCount,
          frontierSize: ctx.antPath.length,
          generation: ctx.generation + 1,
          bestPathLength:
            ctx.bestPathLength === Infinity ? 0 : ctx.bestPathLength,
        },
      };
    }

    // Pop back
    const old = ctx.antPath.pop()!;
    patches.push({ index: old, overlayClear: OverlayFlag.Current });
    ctx.antPos = ctx.antPath[ctx.antPath.length - 1]!;
    patches.push({
      index: ctx.antPos,
      overlaySet: OverlayFlag.Current,
    });

    return {
      done: false,
      patches,
      meta: {
        line: 2,
        visitedCount: ctx.visitedCount,
        frontierSize: ctx.antPath.length,
        generation: ctx.generation + 1,
        bestPathLength:
          ctx.bestPathLength === Infinity ? 0 : ctx.bestPathLength,
      },
    };
  }

  // Move forward
  patches.push({ index: ctx.antPos, overlayClear: OverlayFlag.Current });

  ctx.antVisited[next] = 1;
  ctx.antPath.push(next);
  ctx.antPos = next;
  ctx.antCells.push(next);

  if (!ctx.totalVisited[next]) {
    ctx.totalVisited[next] = 1;
    ctx.visitedCount++;
    patches.push({ index: next, overlaySet: OverlayFlag.Visited });
  }

  patches.push({
    index: next,
    overlaySet: OverlayFlag.Frontier | OverlayFlag.Current,
  });

  return {
    done: false,
    patches,
    meta: {
      line: 1,
      visitedCount: ctx.visitedCount,
      frontierSize: ctx.antPath.length,
      generation: ctx.generation + 1,
      bestPathLength:
        ctx.bestPathLength === Infinity ? 0 : ctx.bestPathLength,
    },
  };
}

function stepGenerationEnd(
  ctx: ACOContext,
): StepResult<AlgorithmStepMeta> {
  // Evaporate + deposit pheromone
  evaporatePheromones(ctx);

  for (const path of ctx.genPaths) {
    depositPheromone(ctx, path, 0);
    if (path.length < ctx.bestPathLength) {
      ctx.bestPath = path;
      ctx.bestPathLength = path.length;
    }
  }

  if (ctx.bestPath.length > 0) {
    depositPheromone(ctx, ctx.bestPath, ELITE_BONUS / ctx.bestPathLength);
  }

  ctx.generation++;
  ctx.genPaths = [];
  ctx.antIndex = 0;

  if (ctx.generation >= ctx.maxGenerations) {
    // Training done
    ctx.phase = "greedy";
    ctx.vizStep = 0;

    if (ctx.bestPath.length === 0) {
      return {
        done: true,
        patches: [],
        meta: { line: 6, visitedCount: ctx.visitedCount, solved: false },
      };
    }
  } else {
    // Start next generation
    ctx.phase = "ant-walking";
    startNewAnt(ctx);
    ctx.antCells.push(ctx.startIndex);
  }

  return {
    done: false,
    patches: [
      {
        index: ctx.startIndex,
        overlaySet: OverlayFlag.Frontier | OverlayFlag.Current,
      },
    ],
    meta: {
      line: 5,
      visitedCount: ctx.visitedCount,
      frontierSize: 0,
      generation: ctx.generation,
      bestPathLength:
        ctx.bestPathLength === Infinity ? 0 : ctx.bestPathLength,
    },
  };
}

function stepGreedy(
  ctx: ACOContext,
): StepResult<AlgorithmStepMeta> {
  const patches: CellPatch[] = [];
  const path = ctx.bestPath;
  const i = ctx.vizStep;

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
        line: 6,
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

  ctx.vizStep++;

  return {
    done: false,
    patches,
    meta: {
      line: 6,
      visitedCount: ctx.visitedCount,
      frontierSize: 0,
      pathLength: path.length,
    },
  };
}
