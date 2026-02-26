import { OverlayFlag, type Grid } from "@/core/grid";
import type { CellPatch, StepResult } from "@/core/patches";
import type { SolverPlugin } from "@/core/plugins/SolverPlugin";
import type { AlgorithmStepMeta, SolverRunOptions } from "@/core/plugins/types";
import { getOpenNeighbors } from "@/core/plugins/solvers/helpers";
import type { RandomSource } from "@/core/rng";

/**
 * Ant Colony Optimization solver.
 *
 * Ants navigate using only pheromone trails — no global heuristic. Early ants
 * explore widely; as pheromone concentrates on the solution path over
 * generations, later ants follow it more directly. Each step() runs one full
 * ant and visualizes the cells it explored (Frontier overlay). Visited overlay
 * accumulates across all ants. After training the best path is traced as Path.
 */

const NUM_ANTS = 10;
const NUM_GENERATIONS = 30;
const PHEROMONE_ALPHA = 2; // strong pheromone influence for visible convergence
const EVAPORATION_RATE = 0.15;
const INITIAL_PHEROMONE = 0.1; // low so first generation is near-random
const ELITE_BONUS = 3.0;

type Phase = "training" | "greedy";

interface ACOContext {
  grid: Grid;
  rng: RandomSource;
  startIndex: number;
  goalIndex: number;

  pheromone: Float64Array;
  neighborCache: number[][];

  phase: Phase;
  generation: number;
  bestPath: number[];
  bestPathLength: number;

  // Current generation
  antIndex: number;
  genPaths: number[][];
  genExploredTotal: number; // sum of allVisited lengths this generation

  // Early stopping on exploration efficiency
  prevAvgExplored: number;
  staleCount: number;

  // Viz: cells drawn for the last ant
  lastAntCells: number[];

  // Greedy visualization
  vizStep: number;

  // Stats
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

interface AntResult {
  path: number[];       // clean path (backtracked) — used for pheromone deposit
  allVisited: number[]; // every cell the ant touched — used for visualization
}

/** Run one ant using pheromone-weighted random walk with backtracking. */
function runAnt(ctx: ACOContext): AntResult | null {
  const path: number[] = [ctx.startIndex];
  const visited = new Uint8Array(ctx.grid.cellCount);
  visited[ctx.startIndex] = 1;
  const allVisited: number[] = [ctx.startIndex];
  let current = ctx.startIndex;
  const maxSteps = ctx.grid.cellCount * 4;

  for (let s = 0; s < maxSteps; s++) {
    if (current === ctx.goalIndex) return { path, allVisited };

    const neighbors = ctx.neighborCache[current]!;
    const candidates: number[] = [];
    for (const n of neighbors) {
      if (!visited[n]) candidates.push(n);
    }

    // Dead end: backtrack
    if (candidates.length === 0) {
      if (path.length <= 1) return null;
      path.pop();
      current = path[path.length - 1]!;
      continue;
    }

    // Pheromone-only weighted selection
    const weights: number[] = new Array(candidates.length);
    let totalWeight = 0;

    for (let i = 0; i < candidates.length; i++) {
      const tau = Math.max(
        getPheromone(ctx, current, candidates[i]!),
        0.001,
      );
      const w = Math.pow(tau, PHEROMONE_ALPHA);
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

    visited[chosen] = 1;
    path.push(chosen);
    allVisited.push(chosen);
    current = chosen;
  }

  return null;
}

function finishGeneration(ctx: ACOContext): boolean {
  evaporatePheromones(ctx);

  for (const path of ctx.genPaths) {
    depositPheromone(ctx, path, 0);
    if (path.length < ctx.bestPathLength) {
      ctx.bestPath = [...path];
      ctx.bestPathLength = path.length;
    }
  }

  if (ctx.bestPath.length > 0) {
    depositPheromone(ctx, ctx.bestPath, ELITE_BONUS / ctx.bestPathLength);
  }

  // Check exploration efficiency convergence
  const successfulAnts = ctx.genPaths.length;
  const avgExplored =
    successfulAnts > 0
      ? ctx.genExploredTotal / successfulAnts
      : ctx.prevAvgExplored;

  if (avgExplored >= ctx.prevAvgExplored * 0.95) {
    ctx.staleCount++;
  } else {
    ctx.staleCount = 0;
  }
  ctx.prevAvgExplored = avgExplored;

  ctx.generation++;
  ctx.genPaths = [];
  ctx.genExploredTotal = 0;
  ctx.antIndex = 0;

  // Early stop: converged when exploration efficiency plateaus
  return ctx.staleCount >= 5 && ctx.bestPath.length > 0;
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

    const ctx: ACOContext = {
      grid,
      rng,
      startIndex: options.startIndex,
      goalIndex: options.goalIndex,
      pheromone,
      neighborCache,
      phase: "training",
      generation: 0,
      bestPath: [],
      bestPathLength: Infinity,
      antIndex: 0,
      genPaths: [],
      genExploredTotal: 0,
      prevAvgExplored: Infinity,
      staleCount: 0,
      lastAntCells: [],
      vizStep: 0,
      visitedCount: 0,
      totalVisited: new Uint8Array(grid.cellCount),
    };

    return { step: () => stepACO(ctx) };
  },
};

function stepACO(ctx: ACOContext): StepResult<AlgorithmStepMeta> {
  if (ctx.phase === "training") {
    return stepTraining(ctx);
  }
  return stepGreedy(ctx);
}

function stepTraining(
  ctx: ACOContext,
): StepResult<AlgorithmStepMeta> {
  const patches: CellPatch[] = [];

  // Clear previous ant's Frontier/Current overlays
  for (const cell of ctx.lastAntCells) {
    patches.push({
      index: cell,
      overlayClear: OverlayFlag.Frontier | OverlayFlag.Current,
    });
  }

  // Run one full ant internally
  const result = runAnt(ctx);
  ctx.antIndex++;

  if (result) {
    ctx.genPaths.push(result.path);
    ctx.genExploredTotal += result.allVisited.length;

    // Visualize: ALL cells the ant explored (including dead ends)
    const cells = result.allVisited;
    ctx.lastAntCells = cells;

    for (const cell of cells) {
      if (!ctx.totalVisited[cell]) {
        ctx.totalVisited[cell] = 1;
        ctx.visitedCount++;
      }
      patches.push({
        index: cell,
        overlaySet: OverlayFlag.Visited | OverlayFlag.Frontier,
      });
    }

    const lastCell = result.path[result.path.length - 1]!;
    patches.push({ index: lastCell, overlaySet: OverlayFlag.Current });
  } else {
    ctx.lastAntCells = [];
  }

  // End of generation?
  if (ctx.antIndex >= NUM_ANTS) {
    const converged = finishGeneration(ctx);

    if (ctx.generation >= NUM_GENERATIONS || converged) {
      ctx.phase = "greedy";
      ctx.vizStep = 0;

      if (ctx.bestPath.length === 0) {
        return {
          done: true,
          patches,
          meta: { line: 6, visitedCount: ctx.visitedCount, solved: false },
        };
      }
    }
  }

  return {
    done: false,
    patches,
    meta: {
      line: ctx.antIndex === 0 ? 5 : 1,
      visitedCount: ctx.visitedCount,
      frontierSize: ctx.lastAntCells.length,
      generation: ctx.generation + (ctx.antIndex > 0 ? 1 : 0),
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

  // First greedy step: clear training overlays
  if (i === 0) {
    for (const cell of ctx.lastAntCells) {
      patches.push({
        index: cell,
        overlayClear: OverlayFlag.Frontier | OverlayFlag.Current,
      });
    }
    ctx.lastAntCells = [];
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
