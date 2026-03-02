import { OverlayFlag, type Grid } from "@/core/grid";
import type { CellPatch } from "@/core/patches";
import type { SolverPlugin } from "@/core/plugins/SolverPlugin";
import type { AlgorithmStepMeta, SolverRunOptions } from "@/core/plugins/types";
import { buildPath, getOpenNeighbors } from "@/core/plugins/solvers/helpers";

interface EdgeRef {
  a: number;
  b: number;
}

interface AdjEdge {
  neighbor: number;
  edgeIndex: number;
}

interface PhysarumContext {
  grid: Grid;
  startIndex: number;
  goalIndex: number;
  adjacency: AdjEdge[][];
  edges: EdgeRef[];
  pressure: Float64Array;
  conductivity: Float64Array;
  iteration: number;
  minFlowIterations: number;
  maxIterations: number;
  mathConverged: boolean;
  visualReachedGoal: boolean;
  explorationVisited: Uint8Array;
  explorationFrontier: Uint8Array;
  explorationQueue: number[];
  explorationHead: number;
  path: number[];
  pathCursor: number;
  currentPathIndex: number;
}

const SIGMA = 0.45;
const DECAY = 0.2;
const MIN_CONDUCTIVITY = 0.02;
const MAX_CONDUCTIVITY = 6.0;
const PRESSURE_EPSILON = 1e-4;
const CONDUCTIVITY_EPSILON = 1e-3;

export const physarumSolver: SolverPlugin<SolverRunOptions, AlgorithmStepMeta> = {
  id: "physarum",
  label: "Physarum (Slime Mold)",
  create({ grid, options }) {
    const graph = buildGraph(grid);
    const pressure = new Float64Array(grid.cellCount);
    pressure.fill(0.5);
    pressure[options.startIndex] = 1;
    pressure[options.goalIndex] = 0;

    const context: PhysarumContext = {
      grid,
      startIndex: options.startIndex,
      goalIndex: options.goalIndex,
      adjacency: graph.adjacency,
      edges: graph.edges,
      pressure,
      conductivity: new Float64Array(graph.edges.length).fill(1),
      iteration: 0,
      minFlowIterations: Math.max(
        120,
        Math.min(320, Math.floor(grid.cellCount * 0.5)),
      ),
      maxIterations: 900,
      phase: "flow",
      frontierSize: 1,
      visitedCount: 0,
      firstStep: true,
      mathConverged: false,
      visualReachedGoal: false,
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
      step: () => stepPhysarum(context),
    };
  },
};

function stepPhysarum(context: PhysarumContext) {
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

  if (context.phase === "flow") {
    if (!context.mathConverged) {
      const pressureDelta = relaxPressure(context);
      const conductivityDelta = adaptConductivity(context);
      context.iteration += 1;

      const converged =
        context.iteration >= context.minFlowIterations &&
        pressureDelta < PRESSURE_EPSILON &&
        conductivityDelta < CONDUCTIVITY_EPSILON;

      if (converged || context.iteration >= context.maxIterations) {
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

    if (context.currentIndex !== -1) {
      patches.push({
        index: context.currentIndex,
        overlayClear: OverlayFlag.Current,
      });
      context.currentIndex = -1;
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
        const rankedNeighbors = rankPhysarumNeighbors(context, cell);
        for (const edge of rankedNeighbors) {
          const neighbor = edge.neighbor;
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
      context.path = extractConductivityPath(context);
      if (context.path.length === 0) {
        context.path = bfsFallbackPath(context);
      }
      context.pathCursor = 0;
      context.phase = "extract";
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

function relaxPressure(context: PhysarumContext): number {
  let maxDelta = 0;

  for (let cell = 0; cell < context.grid.cellCount; cell += 1) {
    if (cell === context.startIndex || cell === context.goalIndex) {
      continue;
    }

    const neighbors = context.adjacency[cell] as AdjEdge[];
    if (neighbors.length === 0) {
      continue;
    }

    let numerator = 0;
    let denominator = 0;

    for (const edge of neighbors) {
      const conductivity = context.conductivity[edge.edgeIndex] as number;
      numerator += conductivity * (context.pressure[edge.neighbor] as number);
      denominator += conductivity;
    }

    if (denominator <= 0) {
      continue;
    }

    const nextPressure = numerator / denominator;
    const delta = Math.abs(nextPressure - (context.pressure[cell] as number));
    if (delta > maxDelta) {
      maxDelta = delta;
    }

    context.pressure[cell] = nextPressure;
  }

  context.pressure[context.startIndex] = 1;
  context.pressure[context.goalIndex] = 0;

  return maxDelta;
}

function adaptConductivity(context: PhysarumContext): number {
  let maxDelta = 0;

  for (let i = 0; i < context.edges.length; i += 1) {
    const edge = context.edges[i] as EdgeRef;
    const current = context.conductivity[i] as number;

    const flow = current * ((context.pressure[edge.a] as number) - (context.pressure[edge.b] as number));
    const updated = clamp(
      current + SIGMA * Math.abs(flow) - DECAY * current,
      MIN_CONDUCTIVITY,
      MAX_CONDUCTIVITY,
    );

    const delta = Math.abs(updated - current);
    if (delta > maxDelta) {
      maxDelta = delta;
    }

    context.conductivity[i] = updated;
  }

  return maxDelta;
}



function rankPhysarumNeighbors(
  context: PhysarumContext,
  cell: number,
): AdjEdge[] {
  const currentPressure = context.pressure[cell] as number;
  return (context.adjacency[cell] as AdjEdge[]).slice().sort((a, b) => {
    const conductivityA = context.conductivity[a.edgeIndex] as number;
    const conductivityB = context.conductivity[b.edgeIndex] as number;
    const pressureDropA = Math.max(
      0,
      currentPressure - (context.pressure[a.neighbor] as number),
    );
    const pressureDropB = Math.max(
      0,
      currentPressure - (context.pressure[b.neighbor] as number),
    );
    const scoreA = conductivityA + pressureDropA * 0.7;
    const scoreB = conductivityB + pressureDropB * 0.7;
    return scoreB - scoreA;
  });
}



function extractConductivityPath(context: PhysarumContext): number[] {
  const path = [context.startIndex];
  const seen = new Uint8Array(context.grid.cellCount);
  seen[context.startIndex] = 1;

  let current = context.startIndex;
  let guard = 0;

  while (current !== context.goalIndex && guard < context.grid.cellCount * 4) {
    guard += 1;

    let bestNeighbor = -1;
    let bestConductivity = -1;
    let bestPressureDrop = -Number.POSITIVE_INFINITY;

    for (const edge of context.adjacency[current] as AdjEdge[]) {
      const neighbor = edge.neighbor;
      if (seen[neighbor] === 1) {
        continue;
      }

      const conductivity = context.conductivity[edge.edgeIndex] as number;
      const pressureDrop =
        (context.pressure[current] as number) - (context.pressure[neighbor] as number);

      if (
        conductivity > bestConductivity ||
        (conductivity === bestConductivity && pressureDrop > bestPressureDrop)
      ) {
        bestConductivity = conductivity;
        bestPressureDrop = pressureDrop;
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

function bfsFallbackPath(context: PhysarumContext): number[] {
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

    for (const edge of context.adjacency[current] as AdjEdge[]) {
      const neighbor = edge.neighbor;
      if (parents[neighbor] !== -1) {
        continue;
      }

      parents[neighbor] = current;
      queue.push(neighbor);
    }
  }

  return [];
}

function buildGraph(grid: Grid): { adjacency: AdjEdge[][]; edges: EdgeRef[] } {
  const adjacency: AdjEdge[][] = Array.from({ length: grid.cellCount }, () => []);
  const edges: EdgeRef[] = [];

  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    for (const neighbor of getOpenNeighbors(grid, cell)) {
      if (neighbor < cell) {
        continue;
      }

      const edgeIndex = edges.length;
      edges.push({ a: cell, b: neighbor });
      adjacency[cell]?.push({ neighbor, edgeIndex });
      adjacency[neighbor]?.push({ neighbor: cell, edgeIndex });
    }
  }

  return { adjacency, edges };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
