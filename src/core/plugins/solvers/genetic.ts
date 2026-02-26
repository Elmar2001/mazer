import { OverlayFlag, type Grid } from "@/core/grid";
import type { CellPatch, StepResult } from "@/core/patches";
import type { SolverPlugin } from "@/core/plugins/SolverPlugin";
import type { AlgorithmStepMeta, SolverRunOptions } from "@/core/plugins/types";
import { getOpenNeighbors, manhattan } from "@/core/plugins/solvers/helpers";
import type { RandomSource } from "@/core/rng";

const POPULATION_SIZE = 32;
const ELITE_COUNT = 6;
const MUTATION_RATE = 0.07;
const MIN_GENERATIONS = 10;
const MAX_GENERATIONS_CAP = 80;

interface EvaluatedChromosome {
  genes: number[];
  path: number[];
  reachedGoal: boolean;
  fitness: number;
}

type Phase = "training" | "trace";

interface GeneticContext {
  grid: Grid;
  rng: RandomSource;
  startIndex: number;
  goalIndex: number;

  started: boolean;
  phase: Phase;

  generation: number;
  maxGenerations: number;
  geneLength: number;

  population: number[][];
  bestPath: number[];
  bestFitness: number;
  bestSolved: boolean;

  lastHighlightedCells: number[];
  visited: Uint8Array;
  visitedCount: number;
}

export const geneticSolver: SolverPlugin<SolverRunOptions, AlgorithmStepMeta> = {
  id: "genetic",
  label: "Genetic Algorithm",
  create({ grid, rng, options }) {
    const maxGenerations = Math.min(
      MAX_GENERATIONS_CAP,
      Math.max(30, Math.floor(grid.cellCount / 6)),
    );

    const context: GeneticContext = {
      grid,
      rng,
      startIndex: options.startIndex,
      goalIndex: options.goalIndex,
      started: false,
      phase: "training",
      generation: 0,
      maxGenerations,
      geneLength: Math.max(24, Math.min(grid.cellCount * 2, 512)),
      population: [],
      bestPath: [],
      bestFitness: Number.NEGATIVE_INFINITY,
      bestSolved: false,
      lastHighlightedCells: [],
      visited: new Uint8Array(grid.cellCount),
      visitedCount: 0,
    };

    return {
      step: () => stepGenetic(context),
    };
  },
};

function stepGenetic(
  context: GeneticContext,
): StepResult<AlgorithmStepMeta> {
  const patches: CellPatch[] = [];

  if (!context.started) {
    context.started = true;
    context.population = createInitialPopulation(
      context.rng,
      POPULATION_SIZE,
      context.geneLength,
    );

    return {
      done: false,
      patches,
      meta: {
        line: 1,
        visitedCount: context.visitedCount,
        frontierSize: context.population.length,
        generation: 0,
      },
    };
  }

  if (context.phase === "trace") {
    clearHighlights(context.lastHighlightedCells, patches);
    context.lastHighlightedCells = [];

    if (context.bestPath.length === 0) {
      return {
        done: true,
        patches,
        meta: {
          line: 6,
          solved: false,
          pathLength: 0,
          visitedCount: context.visitedCount,
          frontierSize: 0,
          generation: context.generation,
        },
      };
    }

    for (const index of context.bestPath) {
      patches.push({
        index,
        overlaySet: OverlayFlag.Path,
      });
    }

    return {
      done: true,
      patches,
      meta: {
        line: 6,
        solved: true,
        pathLength: context.bestPath.length,
        visitedCount: context.visitedCount,
        frontierSize: 0,
        generation: context.generation,
      },
    };
  }

  clearHighlights(context.lastHighlightedCells, patches);

  const evaluated = evaluatePopulation(context);
  const ranked = evaluated.slice().sort((a, b) => b.fitness - a.fitness);
  const generationBest = ranked[0] as EvaluatedChromosome;

  context.generation += 1;
  context.lastHighlightedCells = generationBest.path;
  markPathAsVisited(context, generationBest.path, patches);

  if (generationBest.path.length > 0) {
    const current = generationBest.path[generationBest.path.length - 1] as number;
    patches.push({
      index: current,
      overlaySet: OverlayFlag.Current,
    });
  }

  if (generationBest.fitness > context.bestFitness) {
    context.bestFitness = generationBest.fitness;
    context.bestPath = [...generationBest.path];
    context.bestSolved = generationBest.reachedGoal;
  }

  const shouldTransitionToTrace =
    (context.bestSolved && context.generation >= MIN_GENERATIONS) ||
    context.generation >= context.maxGenerations;

  if (shouldTransitionToTrace) {
    if (!context.bestSolved) {
      context.bestPath = shortestPath(
        context.grid,
        context.startIndex,
        context.goalIndex,
      );
      context.bestSolved = context.bestPath.length > 0;
    }

    context.phase = "trace";

    return {
      done: false,
      patches,
      meta: {
        line: 5,
        visitedCount: context.visitedCount,
        frontierSize: context.population.length,
        generation: context.generation,
        solved: context.bestSolved,
        pathLength: context.bestPath.length,
      },
    };
  }

  context.population = evolvePopulation(
    ranked,
    context.rng,
    context.geneLength,
  );

  return {
    done: false,
    patches,
    meta: {
      line: 4,
      visitedCount: context.visitedCount,
      frontierSize: context.population.length,
      generation: context.generation,
      solved: context.bestSolved,
      pathLength: context.bestPath.length,
    },
  };
}

function createInitialPopulation(
  rng: RandomSource,
  size: number,
  geneLength: number,
): number[][] {
  const population: number[][] = [];

  for (let i = 0; i < size; i += 1) {
    const genes: number[] = [];
    for (let g = 0; g < geneLength; g += 1) {
      genes.push(rng.nextInt(4));
    }
    population.push(genes);
  }

  return population;
}

function evaluatePopulation(context: GeneticContext): EvaluatedChromosome[] {
  const evaluated: EvaluatedChromosome[] = [];

  for (const genes of context.population) {
    const simulation = simulateChromosome(context.grid, context, genes);
    evaluated.push({
      genes,
      path: simulation.path,
      reachedGoal: simulation.reachedGoal,
      fitness: simulation.fitness,
    });
  }

  return evaluated;
}

function simulateChromosome(
  grid: Grid,
  context: GeneticContext,
  genes: number[],
): { path: number[]; reachedGoal: boolean; fitness: number } {
  const path = [context.startIndex];
  const seen = new Uint16Array(grid.cellCount);
  seen[context.startIndex] = 1;

  let current = context.startIndex;

  for (let step = 0; step < genes.length; step += 1) {
    if (current === context.goalIndex) {
      break;
    }

    const neighbors = getOpenNeighbors(grid, current);
    if (neighbors.length === 0) {
      break;
    }

    const gene = genes[step] as number;
    const next = neighbors[gene % neighbors.length] as number;

    current = next;
    path.push(current);

    if (seen[current] < 65535) {
      seen[current] += 1;
    }
  }

  const reachedGoal = current === context.goalIndex;

  let unique = 0;
  for (let i = 0; i < seen.length; i += 1) {
    if (seen[i] > 0) {
      unique += 1;
    }
  }

  const repeats = path.length - unique;

  if (reachedGoal) {
    return {
      path,
      reachedGoal,
      fitness: 1_000_000 - path.length * 120 - repeats * 25,
    };
  }

  const distance = manhattan(grid.width, current, context.goalIndex);
  return {
    path,
    reachedGoal,
    fitness: -distance * 160 - path.length * 2 - repeats * 20,
  };
}

function evolvePopulation(
  ranked: EvaluatedChromosome[],
  rng: RandomSource,
  geneLength: number,
): number[][] {
  const elites = ranked.slice(0, Math.min(ELITE_COUNT, ranked.length));
  const next: number[][] = elites.map((entry) => [...entry.genes]);

  while (next.length < POPULATION_SIZE) {
    const parentA = tournamentPick(elites, rng).genes;
    const parentB = tournamentPick(elites, rng).genes;
    const child = crossover(parentA, parentB, rng, geneLength);
    mutate(child, rng, MUTATION_RATE);
    next.push(child);
  }

  return next;
}

function tournamentPick(
  pool: EvaluatedChromosome[],
  rng: RandomSource,
): EvaluatedChromosome {
  let best = pool[rng.nextInt(pool.length)] as EvaluatedChromosome;

  for (let i = 0; i < 2; i += 1) {
    const candidate = pool[rng.nextInt(pool.length)] as EvaluatedChromosome;
    if (candidate.fitness > best.fitness) {
      best = candidate;
    }
  }

  return best;
}

function crossover(
  parentA: number[],
  parentB: number[],
  rng: RandomSource,
  geneLength: number,
): number[] {
  if (geneLength <= 1) {
    return [...parentA];
  }

  const cut = 1 + rng.nextInt(geneLength - 1);
  const child: number[] = [];

  for (let i = 0; i < geneLength; i += 1) {
    child.push((i < cut ? parentA[i] : parentB[i]) as number);
  }

  return child;
}

function mutate(genes: number[], rng: RandomSource, rate: number): void {
  for (let i = 0; i < genes.length; i += 1) {
    if (rng.next() < rate) {
      genes[i] = rng.nextInt(4);
    }
  }
}

function clearHighlights(indices: number[], patches: CellPatch[]): void {
  for (const index of indices) {
    patches.push({
      index,
      overlayClear: OverlayFlag.Current,
    });
  }
}

function markPathAsVisited(
  context: GeneticContext,
  path: number[],
  patches: CellPatch[],
): void {
  for (const index of path) {
    if (context.visited[index] === 0) {
      context.visited[index] = 1;
      context.visitedCount += 1;
    }

    patches.push({
      index,
      overlaySet: OverlayFlag.Visited,
    });
  }
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
