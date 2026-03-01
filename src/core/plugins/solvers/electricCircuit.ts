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
  maxIterations: number;
  epsilon: number;
  phase: "relax" | "extract" | "done";
  frontierSize: number;
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
      maxIterations: 1000,
      epsilon: 1e-4,
      phase: "relax",
      frontierSize: 0,
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
        visitedCount: context.iteration,
        frontierSize: 0,
        solved: context.path.length > 0,
        pathLength: context.path.length,
      },
    };
  }

  if (context.phase === "relax") {
    const maxDelta = relaxVoltages(context);
    context.iteration += 1;
    context.frontierSize = updateVoltageOverlays(context, patches);

    if (maxDelta < context.epsilon || context.iteration >= context.maxIterations) {
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
        visitedCount: context.iteration,
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
        visitedCount: context.iteration,
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
      visitedCount: context.iteration,
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

function updateVoltageOverlays(
  context: ElectricContext,
  patches: CellPatch[],
): number {
  let frontier = 0;

  for (let i = 0; i < context.grid.cellCount; i += 1) {
    const voltage = context.voltages[i] as number;

    let overlaySet = 0;
    if (voltage > 0.66) {
      overlaySet = OverlayFlag.Frontier | OverlayFlag.Visited;
    } else if (voltage > 0.33) {
      overlaySet = OverlayFlag.Visited;
    }

    if (voltage > 0.5) {
      frontier += 1;
    }

    patches.push({
      index: i,
      overlaySet,
      overlayClear: OverlayFlag.Visited | OverlayFlag.Frontier,
    });
  }

  return frontier;
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
