import { OverlayFlag, type Grid } from "@/core/grid";
import type { CellPatch, StepResult } from "@/core/patches";
import type { SolverPlugin } from "@/core/plugins/SolverPlugin";
import type { AlgorithmStepMeta, SolverRunOptions } from "@/core/plugins/types";
import { getOpenNeighbors } from "@/core/plugins/solvers/helpers";
import type { RandomSource } from "@/core/rng";

/**
 * Ant Colony Optimization solver.
 *
 * Unlike the previous implementation that ran a full ant in one step(), this
 * version advances one ant move (or backtrack) per step() so the search is
 * visually inspectable like other solvers.
 */

const NUM_ANTS = 4;
const NUM_GENERATIONS = 12;
const PHEROMONE_ALPHA = 2;
const EVAPORATION_RATE = 0.15;
const INITIAL_PHEROMONE = 0.1;
const ELITE_BONUS = 3.0;
const STALE_LIMIT = 5;

type Phase = "training" | "greedy";

interface ActiveAntRun {
  path: number[];
  visited: Uint8Array;
  allVisited: number[];
  current: number;
  steps: number;
}

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

  numAnts: number;
  maxGenerations: number;
  antMaxSteps: number;

  antIndex: number;
  activeAnt: ActiveAntRun | null;
  genPaths: number[][];
  genExploredTotal: number;

  prevAvgExplored: number;
  staleCount: number;

  lastAntCells: number[];

  vizStep: number;

  visitedCount: number;
  totalVisited: Uint8Array;
}

function neighborSlot(neighbors: number[], neighbor: number): number {
  return neighbors.indexOf(neighbor);
}

function getPheromone(ctx: ACOContext, from: number, to: number): number {
  const neighbors = ctx.neighborCache[from]!;
  const slot = neighborSlot(neighbors, to);
  if (slot === -1) {
    return 0;
  }
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
  for (let i = 0; i < ctx.pheromone.length; i += 1) {
    ctx.pheromone[i] *= 1 - EVAPORATION_RATE;
  }
}

function depositPheromone(ctx: ACOContext, path: number[], bonus: number): void {
  const amount = 1 / path.length + bonus;
  for (let i = 0; i < path.length - 1; i += 1) {
    addPheromone(ctx, path[i]!, path[i + 1]!, amount);
    addPheromone(ctx, path[i + 1]!, path[i]!, amount);
  }
}

function markVisitedOverlay(
  ctx: ACOContext,
  cell: number,
  patches: CellPatch[],
): void {
  if (ctx.totalVisited[cell] === 0) {
    ctx.totalVisited[cell] = 1;
    ctx.visitedCount += 1;
  }

  patches.push({
    index: cell,
    overlaySet: OverlayFlag.Visited,
  });
}

function pickWeightedNeighbor(
  ctx: ACOContext,
  from: number,
  candidates: number[],
): number {
  const weights: number[] = new Array(candidates.length);
  let totalWeight = 0;

  for (let i = 0; i < candidates.length; i += 1) {
    const tau = Math.max(getPheromone(ctx, from, candidates[i]!), 0.001);
    const weight = Math.pow(tau, PHEROMONE_ALPHA);
    weights[i] = weight;
    totalWeight += weight;
  }

  let r = ctx.rng.next() * totalWeight;
  let chosen = candidates[candidates.length - 1]!;

  for (let i = 0; i < candidates.length; i += 1) {
    r -= weights[i]!;
    if (r <= 0) {
      chosen = candidates[i]!;
      break;
    }
  }

  return chosen;
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

  const successfulAnts = ctx.genPaths.length;
  const avgExplored =
    successfulAnts > 0
      ? ctx.genExploredTotal / successfulAnts
      : ctx.prevAvgExplored;

  if (avgExplored >= ctx.prevAvgExplored * 0.95) {
    ctx.staleCount += 1;
  } else {
    ctx.staleCount = 0;
  }

  ctx.prevAvgExplored = avgExplored;
  ctx.generation += 1;
  ctx.antIndex = 0;
  ctx.genPaths = [];
  ctx.genExploredTotal = 0;

  return ctx.staleCount >= STALE_LIMIT && ctx.bestPath.length > 0;
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

function beginAnt(ctx: ACOContext, patches: CellPatch[]): void {
  for (const cell of ctx.lastAntCells) {
    patches.push({
      index: cell,
      overlayClear: OverlayFlag.Frontier | OverlayFlag.Current,
    });
  }

  const visited = new Uint8Array(ctx.grid.cellCount);
  visited[ctx.startIndex] = 1;

  ctx.activeAnt = {
    path: [ctx.startIndex],
    visited,
    allVisited: [ctx.startIndex],
    current: ctx.startIndex,
    steps: 0,
  };

  markVisitedOverlay(ctx, ctx.startIndex, patches);
  patches.push({
    index: ctx.startIndex,
    overlaySet: OverlayFlag.Frontier | OverlayFlag.Current,
  });
}

function finalizeAnt(
  ctx: ACOContext,
  patches: CellPatch[],
  success: boolean,
  line: number,
): StepResult<AlgorithmStepMeta> {
  const ant = ctx.activeAnt;
  if (!ant) {
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

  ctx.lastAntCells = [...ant.allVisited];

  if (success) {
    ctx.genPaths.push([...ant.path]);
    ctx.genExploredTotal += ant.allVisited.length;
  }

  ctx.activeAnt = null;
  ctx.antIndex += 1;

  let done = false;
  let solved: boolean | undefined;
  let pathLength: number | undefined;

  if (ctx.antIndex >= ctx.numAnts) {
    const converged = finishGeneration(ctx);

    if (ctx.generation >= ctx.maxGenerations || converged) {
      if (ctx.bestPath.length === 0) {
        ctx.bestPath = shortestPath(ctx.grid, ctx.startIndex, ctx.goalIndex);
        if (ctx.bestPath.length > 0) {
          ctx.bestPathLength = ctx.bestPath.length;
        }
      }

      if (ctx.bestPath.length === 0) {
        done = true;
        solved = false;
        pathLength = 0;
      } else {
        ctx.phase = "greedy";
        ctx.vizStep = 0;
      }
    }
  }

  return {
    done,
    patches,
    meta: {
      line,
      visitedCount: ctx.visitedCount,
      frontierSize: ctx.lastAntCells.length,
      generation: ctx.generation + 1,
      bestPathLength: ctx.bestPathLength === Infinity ? 0 : ctx.bestPathLength,
      solved,
      pathLength,
    },
  };
}

export const antColonySolver: SolverPlugin<
  SolverRunOptions,
  AlgorithmStepMeta
> = {
  id: "ant-colony",
  label: "Ant Colony Optimization",
  create({ grid, rng, options }) {
    const neighborCache: number[][] = new Array(grid.cellCount);
    for (let i = 0; i < grid.cellCount; i += 1) {
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
      numAnts: NUM_ANTS,
      maxGenerations: NUM_GENERATIONS,
      antMaxSteps: Math.max(64, Math.min(400, Math.floor(grid.cellCount * 1.25))),
      antIndex: 0,
      activeAnt: null,
      genPaths: [],
      genExploredTotal: 0,
      prevAvgExplored: Infinity,
      staleCount: 0,
      lastAntCells: [],
      vizStep: 0,
      visitedCount: 0,
      totalVisited: new Uint8Array(grid.cellCount),
    };

    return {
      step: () => stepACO(ctx),
    };
  },
};

function stepACO(ctx: ACOContext): StepResult<AlgorithmStepMeta> {
  if (ctx.phase === "training") {
    return stepTraining(ctx);
  }

  return stepGreedy(ctx);
}

function stepTraining(ctx: ACOContext): StepResult<AlgorithmStepMeta> {
  const patches: CellPatch[] = [];

  if (!ctx.activeAnt) {
    beginAnt(ctx, patches);
    return {
      done: false,
      patches,
      meta: {
        line: 1,
        visitedCount: ctx.visitedCount,
        frontierSize: 1,
        generation: ctx.generation + 1,
        bestPathLength: ctx.bestPathLength === Infinity ? 0 : ctx.bestPathLength,
      },
    };
  }

  const ant = ctx.activeAnt;
  patches.push({
    index: ant.current,
    overlayClear: OverlayFlag.Current,
  });

  if (ant.current === ctx.goalIndex) {
    return finalizeAnt(ctx, patches, true, 4);
  }

  if (ant.steps >= ctx.antMaxSteps) {
    return finalizeAnt(ctx, patches, false, 3);
  }

  const candidates = ctx.neighborCache[ant.current]!.filter(
    (neighbor) => ant.visited[neighbor] === 0,
  );

  if (candidates.length === 0) {
    if (ant.path.length <= 1) {
      return finalizeAnt(ctx, patches, false, 3);
    }

    ant.path.pop();
    ant.current = ant.path[ant.path.length - 1] as number;
    ant.steps += 1;

    patches.push({
      index: ant.current,
      overlaySet: OverlayFlag.Frontier | OverlayFlag.Current,
    });

    return {
      done: false,
      patches,
      meta: {
        line: 3,
        visitedCount: ctx.visitedCount,
        frontierSize: ant.path.length,
        generation: ctx.generation + 1,
        bestPathLength: ctx.bestPathLength === Infinity ? 0 : ctx.bestPathLength,
      },
    };
  }

  const chosen = pickWeightedNeighbor(ctx, ant.current, candidates);

  ant.visited[chosen] = 1;
  ant.path.push(chosen);
  ant.allVisited.push(chosen);
  ant.current = chosen;
  ant.steps += 1;

  markVisitedOverlay(ctx, chosen, patches);
  patches.push({
    index: chosen,
    overlaySet: OverlayFlag.Frontier | OverlayFlag.Current,
  });

  if (chosen === ctx.goalIndex) {
    return finalizeAnt(ctx, patches, true, 2);
  }

  if (ant.steps >= ctx.antMaxSteps) {
    return finalizeAnt(ctx, patches, false, 3);
  }

  return {
    done: false,
    patches,
    meta: {
      line: 2,
      visitedCount: ctx.visitedCount,
      frontierSize: ant.path.length,
      generation: ctx.generation + 1,
      bestPathLength: ctx.bestPathLength === Infinity ? 0 : ctx.bestPathLength,
    },
  };
}

function stepGreedy(ctx: ACOContext): StepResult<AlgorithmStepMeta> {
  const patches: CellPatch[] = [];
  const path = ctx.bestPath;
  const i = ctx.vizStep;

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
      index: path[i - 1] as number,
      overlayClear: OverlayFlag.Current,
    });
  }

  const cell = path[i] as number;
  patches.push({
    index: cell,
    overlaySet: OverlayFlag.Visited | OverlayFlag.Current,
  });

  ctx.vizStep += 1;

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
