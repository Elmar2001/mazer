import { OverlayFlag, type Grid } from "@/core/grid";
import type { CellPatch, StepResult } from "@/core/patches";
import type { SolverPlugin } from "@/core/plugins/SolverPlugin";
import type { AlgorithmStepMeta, SolverRunOptions } from "@/core/plugins/types";
import { getOpenNeighbors, manhattan } from "@/core/plugins/solvers/helpers";
import type { RandomSource } from "@/core/rng";

interface FrontierEdge {
  from: number;
  to: number;
}

type Phase = "build" | "trace";

interface RrtStarContext {
  grid: Grid;
  rng: RandomSource;
  startIndex: number;
  goalIndex: number;

  started: boolean;
  phase: Phase;
  maxIterations: number;
  iterations: number;

  parents: Int32Array;
  costs: Int32Array;
  inTree: Uint8Array;

  treeNodes: number[];
  frontierEdges: FrontierEdge[];

  currentIndex: number;
  visitedCount: number;

  bestPath: number[];
}

const GOAL_SAMPLE_PROBABILITY = 0.25;
const REWIRE_RADIUS = 2;

export const rrtStarSolver: SolverPlugin<SolverRunOptions, AlgorithmStepMeta> = {
  id: "rrt-star",
  label: "RRT* (Grid Approximation)",
  create({ grid, rng, options }) {
    const parents = new Int32Array(grid.cellCount);
    parents.fill(-1);

    const costs = new Int32Array(grid.cellCount);
    costs.fill(Number.MAX_SAFE_INTEGER);

    const context: RrtStarContext = {
      grid,
      rng,
      startIndex: options.startIndex,
      goalIndex: options.goalIndex,
      started: false,
      phase: "build",
      maxIterations: Math.max(grid.cellCount * 2, 200),
      iterations: 0,
      parents,
      costs,
      inTree: new Uint8Array(grid.cellCount),
      treeNodes: [],
      frontierEdges: [],
      currentIndex: -1,
      visitedCount: 0,
      bestPath: [],
    };

    return {
      step: () => stepRrtStar(context),
    };
  },
};

function stepRrtStar(
  context: RrtStarContext,
): StepResult<AlgorithmStepMeta> {
  const patches: CellPatch[] = [];

  if (!context.started) {
    context.started = true;
    insertNode(context, context.startIndex, context.startIndex, patches);

    if (context.startIndex === context.goalIndex) {
      context.bestPath = [context.startIndex];
      context.phase = "trace";
    }

    return {
      done: false,
      patches,
      meta: {
        line: 1,
        visitedCount: context.visitedCount,
        frontierSize: context.frontierEdges.length,
      },
    };
  }

  if (context.currentIndex !== -1) {
    patches.push({
      index: context.currentIndex,
      overlayClear: OverlayFlag.Current,
    });
    context.currentIndex = -1;
  }

  if (context.phase === "trace") {
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
        solved: context.bestPath.length > 0,
        pathLength: context.bestPath.length,
        visitedCount: context.visitedCount,
        frontierSize: context.frontierEdges.length,
      },
    };
  }

  if (
    context.inTree[context.goalIndex] === 1 ||
    context.iterations >= context.maxIterations ||
    context.frontierEdges.length === 0
  ) {
    context.bestPath =
      context.inTree[context.goalIndex] === 1
        ? buildTreePath(context)
        : shortestPath(context.grid, context.startIndex, context.goalIndex);
    context.phase = "trace";

    return {
      done: false,
      patches,
      meta: {
        line: 5,
        visitedCount: context.visitedCount,
        frontierSize: context.frontierEdges.length,
        solved: context.bestPath.length > 0,
        pathLength: context.bestPath.length,
      },
    };
  }

  const sample =
    context.rng.next() < GOAL_SAMPLE_PROBABILITY
      ? context.goalIndex
      : context.rng.nextInt(context.grid.cellCount);

  const edgeIndex = pickFrontierEdge(context, sample);
  if (edgeIndex === -1) {
    context.bestPath = shortestPath(context.grid, context.startIndex, context.goalIndex);
    context.phase = "trace";

    return {
      done: false,
      patches,
      meta: {
        line: 5,
        visitedCount: context.visitedCount,
        frontierSize: context.frontierEdges.length,
        solved: context.bestPath.length > 0,
        pathLength: context.bestPath.length,
      },
    };
  }

  const edge = removeFrontierEdgeAt(context, edgeIndex);
  if (!edge || context.inTree[edge.to] === 1) {
    return {
      done: false,
      patches,
      meta: {
        line: 2,
        visitedCount: context.visitedCount,
        frontierSize: context.frontierEdges.length,
      },
    };
  }

  insertNode(context, edge.to, edge.from, patches);
  tryRewireAround(context, edge.to);
  context.iterations += 1;

  if (context.inTree[context.goalIndex] === 1) {
    context.bestPath = buildTreePath(context);
    context.phase = "trace";
  }

  return {
    done: false,
    patches,
    meta: {
      line: 4,
      visitedCount: context.visitedCount,
      frontierSize: context.frontierEdges.length,
      iterations: context.iterations,
      solved: context.inTree[context.goalIndex] === 1,
    },
  };
}

function insertNode(
  context: RrtStarContext,
  node: number,
  suggestedParent: number,
  patches: CellPatch[],
): void {
  if (context.inTree[node] === 1) {
    return;
  }

  let bestParent = suggestedParent;
  let bestCost =
    context.costs[suggestedParent] === Number.MAX_SAFE_INTEGER
      ? Number.MAX_SAFE_INTEGER
      : context.costs[suggestedParent] + 1;

  for (const neighbor of getOpenNeighbors(context.grid, node)) {
    if (context.inTree[neighbor] === 0) {
      continue;
    }

    const candidateCost = context.costs[neighbor] + 1;
    if (candidateCost < bestCost) {
      bestCost = candidateCost;
      bestParent = neighbor;
    }
  }

  context.inTree[node] = 1;
  context.parents[node] = node === context.startIndex ? node : bestParent;
  context.costs[node] = node === context.startIndex ? 0 : bestCost;
  context.treeNodes.push(node);
  context.currentIndex = node;

  context.visitedCount += 1;

  patches.push({
    index: node,
    overlaySet: OverlayFlag.Visited | OverlayFlag.Current,
  });

  refreshFrontierState(context, node, patches);

  if (node !== context.startIndex) {
    refreshFrontierState(context, context.parents[node] as number, patches);
  }

  for (const neighbor of getOpenNeighbors(context.grid, node)) {
    if (context.inTree[neighbor] === 1) {
      continue;
    }

    context.frontierEdges.push({
      from: node,
      to: neighbor,
    });
  }
}

function refreshFrontierState(
  context: RrtStarContext,
  node: number,
  patches: CellPatch[],
): void {
  let hasExpandableNeighbor = false;

  for (const neighbor of getOpenNeighbors(context.grid, node)) {
    if (context.inTree[neighbor] === 0) {
      hasExpandableNeighbor = true;
      break;
    }
  }

  patches.push({
    index: node,
    overlaySet: hasExpandableNeighbor ? OverlayFlag.Frontier : undefined,
    overlayClear: hasExpandableNeighbor ? undefined : OverlayFlag.Frontier,
  });
}

function pickFrontierEdge(context: RrtStarContext, sample: number): number {
  let bestIndex = -1;
  let bestScore = Number.POSITIVE_INFINITY;

  for (let i = 0; i < context.frontierEdges.length; i += 1) {
    const edge = context.frontierEdges[i] as FrontierEdge;

    if (context.inTree[edge.to] === 1 || context.inTree[edge.from] === 0) {
      continue;
    }

    const sampleDistance = manhattan(context.grid.width, edge.to, sample);
    const goalDistance = manhattan(context.grid.width, edge.to, context.goalIndex);
    const score =
      sampleDistance * 0.65 +
      goalDistance * 0.25 +
      (context.costs[edge.from] + 1) * 0.05 +
      context.rng.next() * 0.25;

    if (score < bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }

  return bestIndex;
}

function removeFrontierEdgeAt(
  context: RrtStarContext,
  index: number,
): FrontierEdge | null {
  if (index < 0 || index >= context.frontierEdges.length) {
    return null;
  }

  const edge = context.frontierEdges[index] as FrontierEdge;
  const last = context.frontierEdges[context.frontierEdges.length - 1] as FrontierEdge;
  context.frontierEdges[index] = last;
  context.frontierEdges.pop();

  return edge;
}

function tryRewireAround(context: RrtStarContext, node: number): void {
  for (const neighbor of getOpenNeighbors(context.grid, node)) {
    if (context.inTree[neighbor] === 0 || neighbor === (context.parents[node] as number)) {
      continue;
    }

    if (isAncestor(context, neighbor, node)) {
      continue;
    }

    const throughNewCost = context.costs[node] + 1;
    if (throughNewCost >= context.costs[neighbor]) {
      continue;
    }

    context.parents[neighbor] = node;
    context.costs[neighbor] = throughNewCost;
    recomputeDescendantCosts(context, neighbor);
  }

  for (const nearby of collectNearbyNodes(context, node, REWIRE_RADIUS)) {
    if (nearby === node || nearby === context.startIndex) {
      continue;
    }

    const nearNeighbors = getOpenNeighbors(context.grid, nearby);
    let bestParent = context.parents[nearby] as number;
    let bestCost = context.costs[nearby] as number;

    for (const candidate of nearNeighbors) {
      if (context.inTree[candidate] === 0 || candidate === nearby) {
        continue;
      }

      if (isAncestor(context, nearby, candidate)) {
        continue;
      }

      const candidateCost = context.costs[candidate] + 1;
      if (candidateCost < bestCost) {
        bestCost = candidateCost;
        bestParent = candidate;
      }
    }

    if (bestParent !== (context.parents[nearby] as number)) {
      context.parents[nearby] = bestParent;
      context.costs[nearby] = bestCost;
      recomputeDescendantCosts(context, nearby);
    }
  }
}

function collectNearbyNodes(
  context: RrtStarContext,
  origin: number,
  radius: number,
): number[] {
  const nearby: number[] = [];

  for (const node of context.treeNodes) {
    if (context.inTree[node] === 0) {
      continue;
    }

    if (manhattan(context.grid.width, node, origin) <= radius) {
      nearby.push(node);
    }
  }

  return nearby;
}

function isAncestor(context: RrtStarContext, maybeAncestor: number, node: number): boolean {
  let current = node;

  for (let i = 0; i < context.grid.cellCount; i += 1) {
    if (current === maybeAncestor) {
      return true;
    }

    const parent = context.parents[current] as number;
    if (parent === -1 || parent === current) {
      return false;
    }

    current = parent;
  }

  return false;
}

function recomputeDescendantCosts(context: RrtStarContext, root: number): void {
  const queue = [root];
  let head = 0;

  while (head < queue.length) {
    const parent = queue[head] as number;
    head += 1;

    for (const node of context.treeNodes) {
      if (node === parent || context.inTree[node] === 0) {
        continue;
      }

      if (context.parents[node] !== parent) {
        continue;
      }

      context.costs[node] = context.costs[parent] + 1;
      queue.push(node);
    }
  }
}

function buildTreePath(context: RrtStarContext): number[] {
  if (context.inTree[context.goalIndex] === 0) {
    return [];
  }

  const path: number[] = [];
  let current = context.goalIndex;

  for (let i = 0; i < context.grid.cellCount; i += 1) {
    path.push(current);

    if (current === context.startIndex) {
      path.reverse();
      return path;
    }

    current = context.parents[current] as number;

    if (current < 0) {
      break;
    }
  }

  return [];
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
