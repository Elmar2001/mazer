import { OverlayFlag, type Grid } from "@/core/grid";
import type { CellPatch } from "@/core/patches";
import type { SolverPlugin } from "@/core/plugins/SolverPlugin";
import type { AlgorithmStepMeta, SolverRunOptions } from "@/core/plugins/types";
import { buildPath, getOpenNeighbors } from "@/core/plugins/solvers/helpers";

interface ElectricContext {
  grid: Grid;
  startIndex: number;
  goalIndex: number;
  neighbors: number[][];
  voltages: Float64Array;
  iteration: number;
  minRelaxIterations: number;
  maxIterations: number;
  epsilon: number;
  phase: "relax" | "extract" | "done";
  frontierSize: number;
  visitedCount: number;
  firstStep: boolean;
  mathConverged: boolean;
  visualReachedGoal: boolean;
  currentIndex: number;
  explorationVisited: Uint8Array;
  explorationFrontier: Uint8Array;
  explorationQueue: number[];
  explorationHead: number;
  path: number[];
  pathCursor: number;
  currentPathIndex: number;
}

export const electricCircuitSolver: SolverPlugin<
  SolverRunOptions,
  AlgorithmStepMeta
> = {
  id: "electric-circuit",
  label: "Electric Circuit (Resistor Network)",
  create({ grid, options }) {
    const voltages = new Float64Array(grid.cellCount);
    voltages.fill(0.5);
    voltages[options.startIndex] = 1;
    voltages[options.goalIndex] = 0;

    const context: ElectricContext = {
      grid,
      startIndex: options.startIndex,
      goalIndex: options.goalIndex,
      neighbors: buildNeighborCache(grid),
      voltages,
      iteration: 0,
      minRelaxIterations: Math.max(
        120,
        Math.min(320, Math.floor(grid.cellCount * 0.5)),
      ),
      maxIterations: 1000,
      epsilon: 1e-4,
      phase: "relax",
      frontierSize: 1,
      visitedCount: 0,
      firstStep: true,
      mathConverged: false,
      visualReachedGoal: false,
      currentIndex: -1,
      explorationVisited: new Uint8Array(grid.cellCount),
      explorationFrontier: (() => {
        const flags = new Uint8Array(grid.cellCount);
        flags[options.startIndex] = 1;
        return flags;
      })(),
      explorationQueue: [options.startIndex],
      explorationHead: 0,
      path: [],
      pathCursor: 0,
      currentPathIndex: -1,
    };

    return {
      step: () => stepElectricCircuit(context),
    };
  },
};

function stepElectricCircuit(context: ElectricContext) {
  const patches: CellPatch[] = [];

  if (context.currentPathIndex !== -1) {
    patches.push({
      index: context.currentPathIndex,
      overlayClear: OverlayFlag.Current,
    });
    context.currentPathIndex = -1;
  }

  if (context.phase === "done") {
    return {
      done: true,
      patches,
      meta: {
        line: 4,
        visitedCount: context.visitedCount,
        frontierSize: 0,
        solved: context.path.length > 0,
        pathLength: context.path.length,
      },
    };
  }

  if (context.phase === "relax") {
    if (!context.mathConverged) {
      const maxDelta = relaxVoltages(context);
      context.iteration += 1;

      if (
        (context.iteration >= context.minRelaxIterations &&
          maxDelta < context.epsilon) ||
        context.iteration >= context.maxIterations
      ) {
        context.mathConverged = true;
      }
    }

    if (context.firstStep) {
      patches.push({
        index: context.startIndex,
        overlaySet: OverlayFlag.Frontier,
      });
      context.firstStep = false;
    }

    if (!context.visualReachedGoal && context.explorationHead < context.explorationQueue.length) {
      const cell = context.explorationQueue[context.explorationHead] as number;
      context.explorationHead += 1;
      context.explorationFrontier[cell] = 0;
      context.frontierSize -= 1;

      context.currentIndex = cell;
      context.explorationVisited[cell] = 1;
      context.visitedCount += 1;

      patches.push({
        index: cell,
        overlayClear: OverlayFlag.Frontier,
        overlaySet: OverlayFlag.Visited | OverlayFlag.Current,
      });

      if (cell === context.goalIndex) {
        context.visualReachedGoal = true;
      } else {
        const rankedNeighbors = rankElectricNeighbors(context, cell);
        for (const neighbor of rankedNeighbors) {
          if (context.explorationVisited[neighbor] === 1 || context.explorationFrontier[neighbor] === 1) {
            continue;
          }

          context.explorationFrontier[neighbor] = 1;
          context.explorationQueue.push(neighbor);
          context.frontierSize += 1;
          patches.push({
            index: neighbor,
            overlaySet: OverlayFlag.Frontier,
          });
        }
      }
    }

    if (
      context.explorationHead > 128 &&
      context.explorationHead * 2 > context.explorationQueue.length
    ) {
      context.explorationQueue = context.explorationQueue.slice(context.explorationHead);
      context.explorationHead = 0;
    }

    if (
      context.mathConverged &&
      (context.visualReachedGoal || context.explorationHead >= context.explorationQueue.length)
    ) {
      context.path = extractCircuitPath(context);
      if (context.path.length === 0) {
        context.path = bfsFallbackPath(context);
      }
      context.phase = "extract";
      context.pathCursor = 0;
    }

    return {
      done: false,
      patches,
      meta: {
        line: 1,
        visitedCount: context.visitedCount,
        frontierSize: context.frontierSize,
      },
    };
  }

  if (context.pathCursor >= context.path.length) {
    context.phase = "done";
    return {
      done: true,
      patches,
      meta: {
        line: 3,
        visitedCount: context.visitedCount,
        frontierSize: 0,
        solved: context.path.length > 0,
        pathLength: context.path.length,
      },
    };
  }

  const index = context.path[context.pathCursor] as number;
  patches.push({
    index,
    overlaySet: OverlayFlag.Path | OverlayFlag.Current,
  });

  context.currentPathIndex = index;
  context.pathCursor += 1;

  if (context.pathCursor >= context.path.length) {
    context.phase = "done";
  }

  return {
    done: context.phase === "done",
    patches,
    meta: {
      line: 3,
      visitedCount: context.visitedCount,
      frontierSize: 0,
      solved: context.path.length > 0,
      pathLength: context.path.length,
    },
  };
}

function relaxVoltages(context: ElectricContext): number {
  let maxDelta = 0;

  for (let cell = 0; cell < context.grid.cellCount; cell += 1) {
    if (cell === context.startIndex || cell === context.goalIndex) {
      continue;
    }

    const neighbors = context.neighbors[cell] as number[];
    if (neighbors.length === 0) {
      continue;
    }

    let sum = 0;
    for (const neighbor of neighbors) {
      sum += context.voltages[neighbor] as number;
    }

    const nextVoltage = sum / neighbors.length;
    const delta = Math.abs(nextVoltage - (context.voltages[cell] as number));
    if (delta > maxDelta) {
      maxDelta = delta;
    }

    context.voltages[cell] = nextVoltage;
  }

  context.voltages[context.startIndex] = 1;
  context.voltages[context.goalIndex] = 0;

  return maxDelta;
}



function rankElectricNeighbors(
  context: ElectricContext,
  cell: number,
): number[] {
  const currentVoltage = context.voltages[cell] as number;
  return (context.neighbors[cell] as number[]).slice().sort((a, b) => {
    const dropA = currentVoltage - (context.voltages[a] as number);
    const dropB = currentVoltage - (context.voltages[b] as number);
    return dropB - dropA;
  });
}



function extractCircuitPath(context: ElectricContext): number[] {
  const path = [context.startIndex];
  const seen = new Uint8Array(context.grid.cellCount);
  seen[context.startIndex] = 1;

  let current = context.startIndex;
  let guard = 0;

  while (current !== context.goalIndex && guard < context.grid.cellCount * 4) {
    guard += 1;

    const currentVoltage = context.voltages[current] as number;
    let bestNeighbor = -1;
    let bestDrop = -Number.POSITIVE_INFINITY;

    for (const neighbor of context.neighbors[current] as number[]) {
      if (seen[neighbor] === 1) {
        continue;
      }

      const drop = currentVoltage - (context.voltages[neighbor] as number);
      if (drop > bestDrop) {
        bestDrop = drop;
        bestNeighbor = neighbor;
      }
    }

    if (bestNeighbor === -1) {
      break;
    }

    current = bestNeighbor;
    seen[current] = 1;
    path.push(current);
  }

  if (current === context.goalIndex) {
    return path;
  }

  return [];
}

function bfsFallbackPath(context: ElectricContext): number[] {
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

    for (const neighbor of context.neighbors[current] as number[]) {
      if (parents[neighbor] !== -1) {
        continue;
      }

      parents[neighbor] = current;
      queue.push(neighbor);
    }
  }

  return [];
}

function buildNeighborCache(grid: Grid): number[][] {
  return Array.from({ length: grid.cellCount }, (_, index) =>
    getOpenNeighbors(grid, index),
  );
}
