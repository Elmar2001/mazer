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
  maxIterations: number;
  phase: "flow" | "extract" | "done";
  frontierSize: number;
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
      maxIterations: 900,
      phase: "flow",
      frontierSize: 0,
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
        visitedCount: context.iteration,
        frontierSize: 0,
        solved: context.path.length > 0,
        pathLength: context.path.length,
      },
    };
  }

  if (context.phase === "flow") {
    const pressureDelta = relaxPressure(context);
    const conductivityDelta = adaptConductivity(context);
    context.iteration += 1;
    context.frontierSize = updateConductivityOverlays(context, patches);

    const converged =
      context.iteration >= 20 &&
      pressureDelta < PRESSURE_EPSILON &&
      conductivityDelta < CONDUCTIVITY_EPSILON;

    if (converged || context.iteration >= context.maxIterations) {
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

function updateConductivityOverlays(
  context: PhysarumContext,
  patches: CellPatch[],
): number {
  let frontier = 0;

  for (let cell = 0; cell < context.grid.cellCount; cell += 1) {
    const neighbors = context.adjacency[cell] as AdjEdge[];
    let maxConductivity = 0;

    for (const edge of neighbors) {
      const value = context.conductivity[edge.edgeIndex] as number;
      if (value > maxConductivity) {
        maxConductivity = value;
      }
    }

    let overlaySet = 0;
    if (maxConductivity >= 1.3) {
      overlaySet = OverlayFlag.Visited | OverlayFlag.Frontier;
      frontier += 1;
    } else if (maxConductivity >= 0.7) {
      overlaySet = OverlayFlag.Visited;
    }

    patches.push({
      index: cell,
      overlaySet,
      overlayClear: OverlayFlag.Visited | OverlayFlag.Frontier,
    });
  }

  return frontier;
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
