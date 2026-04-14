import { OverlayFlag, type Grid } from "@/core/grid";
import type { CellPatch, StepResult } from "@/core/patches";
import type { SolverPlugin } from "@/core/plugins/SolverPlugin";
import type { AlgorithmStepMeta, SolverRunOptions } from "@/core/plugins/types";
import { buildPath, getOpenNeighbors } from "@/core/plugins/solvers/helpers";

interface BmsspContext {
  batches: Array<StepResult<AlgorithmStepMeta>>;
  cursor: number;
}

interface PlannerState {
  grid: Grid;
  startIndex: number;
  goalIndex: number;
  k: number;
  t: number;
  topLevel: number;
  dist: Float64Array;
  parents: Int32Array;
  complete: Uint8Array;
  planner: VisualizationPlanner;
}

interface BmsspResult {
  boundary: number;
  vertices: number[];
}

export const bmsspSolver: SolverPlugin<SolverRunOptions, AlgorithmStepMeta> = {
  id: "bmssp",
  label: "BMSSP (Bounded Multi-Source Shortest Path)",
  create({ grid, options }) {
    const batches = planBmssp(grid, options.startIndex, options.goalIndex);
    const context: BmsspContext = {
      batches,
      cursor: 0,
    };

    return {
      step: () => stepBmssp(context),
    };
  },
};

function stepBmssp(context: BmsspContext): StepResult<AlgorithmStepMeta> {
  if (context.cursor >= context.batches.length) {
    const finalBatch = context.batches[context.batches.length - 1];
    return {
      done: true,
      patches: [],
      meta: finalBatch?.meta ?? {
        line: 6,
        solved: false,
        visitedCount: 0,
        frontierSize: 0,
      },
    };
  }

  const batch = context.batches[context.cursor] as StepResult<AlgorithmStepMeta>;
  context.cursor += 1;
  return batch;
}

function planBmssp(
  grid: Grid,
  startIndex: number,
  goalIndex: number,
): Array<StepResult<AlgorithmStepMeta>> {
  const cellCount = grid.cellCount;
  const logN = Math.max(2, Math.log2(Math.max(4, cellCount)));
  const k = Math.max(2, Math.floor(Math.pow(logN, 1 / 3)));
  const t = Math.max(2, Math.floor(Math.pow(logN, 2 / 3)));
  const topLevel = Math.max(0, Math.ceil(Math.log2(Math.max(1, cellCount)) / t));

  const dist = new Float64Array(cellCount);
  dist.fill(Number.POSITIVE_INFINITY);
  dist[startIndex] = 0;

  const parents = new Int32Array(cellCount);
  parents.fill(-1);
  parents[startIndex] = startIndex;

  const complete = new Uint8Array(cellCount);
  complete[startIndex] = 1;

  const planner = new VisualizationPlanner();
  const state: PlannerState = {
    grid,
    startIndex,
    goalIndex,
    k,
    t,
    topLevel,
    dist,
    parents,
    complete,
    planner,
  };

  planner.push({
    line: 1,
    current: [startIndex],
    frontier: [startIndex],
    visit: [startIndex],
    solved: startIndex === goalIndex,
    pathLength: startIndex === goalIndex ? 1 : 0,
  });

  runBmssp(topLevel, Number.POSITIVE_INFINITY, [startIndex], state);

  const path = buildPath(startIndex, goalIndex, parents);
  planner.push({
    line: 6,
    current: [],
    frontier: [],
    path,
    done: true,
    solved: path.length > 0,
    pathLength: path.length,
  });

  return planner.batches;
}

function runBmssp(
  level: number,
  bound: number,
  sources: number[],
  state: PlannerState,
): BmsspResult {
  const frontierSources = sortByDistance(uniqueFiniteNodes(sources, state.dist), state.dist);
  if (frontierSources.length === 0) {
    return {
      boundary: bound,
      vertices: [],
    };
  }

  if (level === 0) {
    return runBaseCase(bound, frontierSources[0] as number, state);
  }

  const { pivots, witnesses } = findPivots(bound, frontierSources, state);
  const frontier = new Map<number, number>();
  for (const pivot of pivots) {
    insertFrontier(frontier, pivot, nodeLabel(state, pivot));
  }

  const stepBudget = Math.min(
    state.grid.cellCount,
    Math.max(
      state.k + 1,
      state.k * state.k * powerOfTwo(level * state.t),
    ),
  );
  const pullSize = Math.max(1, powerOfTwo((level - 1) * state.t));

  const claimedFlags = new Uint8Array(state.grid.cellCount);
  const claimed: number[] = [];
  let finalBoundary = bound;

  while (frontier.size > 0 && claimed.length < stepBudget) {
    const pulled = pullFrontier(frontier, pullSize, bound);
    if (pulled.sources.length === 0) {
      break;
    }

    state.planner.push({
      line: 4,
      current: [pulled.sources[0] as number],
      frontier: pulled.sources,
    });

    const child = runBmssp(level - 1, pulled.boundary, pulled.sources, state);
    finalBoundary = child.boundary;

    for (const node of child.vertices) {
      if (claimedFlags[node] === 1) {
        continue;
      }

      claimedFlags[node] = 1;
      claimed.push(node);
    }

    for (const node of pulled.sources) {
      const label = nodeLabel(state, node);
      if (label >= child.boundary && label < pulled.boundary) {
        insertFrontier(frontier, node, label);
      }
    }

    for (const from of child.vertices) {
      const baseDist = state.dist[from] as number;
      if (!Number.isFinite(baseDist)) {
        continue;
      }

      for (const to of sortedNeighbors(state.grid, from)) {
        const candidate = baseDist + 1;
        if (candidate > (state.dist[to] as number)) {
          continue;
        }

        updateBestDistance(state, to, candidate, from);

        const candidateLabel = labelValue(state, candidate, to);
        if (candidateLabel >= child.boundary && candidateLabel < bound) {
          insertFrontier(frontier, to, candidateLabel);
        }
      }
    }

    state.planner.push({
      line: 5,
      current: child.vertices.length > 0 ? [child.vertices[0] as number] : [],
      frontier: sortFrontierKeys(frontier, state.dist),
      visit: child.vertices,
    });

    if (claimed.length >= stepBudget && frontier.size > 0) {
      finalBoundary = child.boundary;
      break;
    }
  }

  if (frontier.size === 0) {
    finalBoundary = bound;
  }

  const returned: number[] = [];
  const returnedFlags = new Uint8Array(state.grid.cellCount);

  for (const node of claimed) {
    if (returnedFlags[node] === 1) {
      continue;
    }

    returnedFlags[node] = 1;
    returned.push(node);
  }

  for (const node of witnesses) {
    if (!isNodeBelowBound(state, node, finalBoundary) || returnedFlags[node] === 1) {
      continue;
    }

    returnedFlags[node] = 1;
    returned.push(node);
  }

  markComplete(state, returned);

  return {
    boundary: finalBoundary,
    vertices: sortByDistance(returned, state.dist),
  };
}

function runBaseCase(
  bound: number,
  source: number,
  state: PlannerState,
): BmsspResult {
  const open: number[] = [source];
  const inOpen = new Uint8Array(state.grid.cellCount);
  const closed = new Uint8Array(state.grid.cellCount);
  const extracted: number[] = [];
  inOpen[source] = 1;

  state.planner.push({
    line: 2,
    current: [source],
    frontier: [source],
  });

  while (open.length > 0 && extracted.length < state.k + 1) {
    const pick = pickMinByDistance(open, state.dist);
    const current = open[pick] as number;

    open[pick] = open[open.length - 1] as number;
    open.pop();
    inOpen[current] = 0;

    if (closed[current] === 1) {
      continue;
    }

    closed[current] = 1;
    extracted.push(current);

    const baseDist = state.dist[current] as number;
    if (Number.isFinite(baseDist) && isNodeBelowBound(state, current, bound)) {
      for (const neighbor of sortedNeighbors(state.grid, current)) {
        const candidate = baseDist + 1;
        if (
          candidate > (state.dist[neighbor] as number) ||
          !isLabelBelowBound(state, candidate, neighbor, bound)
        ) {
          continue;
        }

        updateBestDistance(state, neighbor, candidate, current);

        if (inOpen[neighbor] === 0 && closed[neighbor] === 0) {
          open.push(neighbor);
          inOpen[neighbor] = 1;
        }
      }
    }

    state.planner.push({
      line: 2,
      current: [current],
      frontier: sortByDistance(open, state.dist),
      visit: [current],
    });
  }

  let finalBoundary = bound;
  let returned = extracted;

  if (extracted.length > state.k) {
    finalBoundary = nodeLabel(state, extracted[state.k] as number);
    returned = extracted.filter((node) => nodeLabel(state, node) < finalBoundary);
  }

  markComplete(state, returned);

  return {
    boundary: finalBoundary,
    vertices: sortByDistance(returned, state.dist),
  };
}

function findPivots(
  bound: number,
  sources: number[],
  state: PlannerState,
): { pivots: number[]; witnesses: number[] } {
  const sourceFlags = new Uint8Array(state.grid.cellCount);
  const witnessFlags = new Uint8Array(state.grid.cellCount);
  const witnesses: number[] = [];

  for (const source of sources) {
    sourceFlags[source] = 1;
    if (witnessFlags[source] === 0) {
      witnessFlags[source] = 1;
      witnesses.push(source);
    }
  }

  let wave = sources.slice();

  state.planner.push({
    line: 3,
    current: wave.length > 0 ? [wave[0] as number] : [],
    frontier: wave,
  });

  for (let round = 0; round < state.k; round += 1) {
    const nextFlags = new Uint8Array(state.grid.cellCount);
    const nextWave: number[] = [];

    for (const from of wave) {
      const baseDist = state.dist[from] as number;
      if (!Number.isFinite(baseDist) || !isNodeBelowBound(state, from, bound)) {
        continue;
      }

      for (const to of sortedNeighbors(state.grid, from)) {
        const candidate = baseDist + 1;
        if (
          candidate > (state.dist[to] as number) ||
          !isLabelBelowBound(state, candidate, to, bound)
        ) {
          continue;
        }

        updateBestDistance(state, to, candidate, from);

        if (nextFlags[to] === 0) {
          nextFlags[to] = 1;
          nextWave.push(to);
        }

        if (witnessFlags[to] === 0) {
          witnessFlags[to] = 1;
          witnesses.push(to);
        }
      }
    }

    wave = sortByDistance(nextWave, state.dist);

    if (witnesses.length > state.k * Math.max(1, sources.length)) {
      state.planner.push({
        line: 3,
        current: sources.length > 0 ? [sources[0] as number] : [],
        frontier: sources,
      });
      return {
        pivots: sources,
        witnesses: sortByDistance(witnesses, state.dist),
      };
    }

    if (wave.length === 0) {
      break;
    }

    state.planner.push({
      line: 3,
      current: [wave[0] as number],
      frontier: wave,
    });
  }

  const subtreeSizes = new Int32Array(state.grid.cellCount);
  for (const node of witnesses) {
    const root = traceRoot(node, sourceFlags, state.parents);
    if (root !== -1) {
      subtreeSizes[root] += 1;
    }
  }

  const pivots = sortByDistance(
    sources.filter((node) => subtreeSizes[node] >= state.k),
    state.dist,
  );

  state.planner.push({
    line: 3,
    current: pivots.length > 0 ? [pivots[0] as number] : [],
    frontier: pivots,
  });

  return {
    pivots,
    witnesses: sortByDistance(witnesses, state.dist),
  };
}

function pickMinByDistance(items: number[], dist: Float64Array): number {
  let bestIndex = 0;
  let bestNode = items[0] as number;
  let bestDist = dist[bestNode] as number;

  for (let i = 1; i < items.length; i += 1) {
    const node = items[i] as number;
    const nodeDist = dist[node] as number;

    if (
      nodeDist < bestDist ||
      (nodeDist === bestDist && node < bestNode)
    ) {
      bestIndex = i;
      bestNode = node;
      bestDist = nodeDist;
    }
  }

  return bestIndex;
}

function uniqueFiniteNodes(nodes: number[], dist: Float64Array): number[] {
  const seen = new Set<number>();
  const result: number[] = [];

  for (const node of nodes) {
    if (seen.has(node) || !Number.isFinite(dist[node] as number)) {
      continue;
    }

    seen.add(node);
    result.push(node);
  }

  return result;
}

function sortByDistance(nodes: number[], dist: Float64Array): number[] {
  return [...nodes].sort((left, right) => {
    const leftDist = dist[left] as number;
    const rightDist = dist[right] as number;
    if (leftDist !== rightDist) {
      return leftDist - rightDist;
    }

    return left - right;
  });
}

function sortedNeighbors(grid: Grid, index: number): number[] {
  return getOpenNeighbors(grid, index).sort((left, right) => left - right);
}

function insertFrontier(
  frontier: Map<number, number>,
  node: number,
  value: number,
): void {
  const existing = frontier.get(node);
  if (existing === undefined || value < existing) {
    frontier.set(node, value);
    return;
  }

  if (value === existing) {
    frontier.set(node, value);
  }
}

function pullFrontier(
  frontier: Map<number, number>,
  count: number,
  fallbackBound: number,
): { sources: number[]; boundary: number } {
  const entries = [...frontier.entries()].sort((left, right) => {
    if (left[1] !== right[1]) {
      return left[1] - right[1];
    }

    return left[0] - right[0];
  });

  const pulled = entries.slice(0, count);
  for (const [node] of pulled) {
    frontier.delete(node);
  }

  const boundary =
    entries.length > count
      ? (entries[count] as [number, number])[1]
      : fallbackBound;

  return {
    sources: pulled.map(([node]) => node),
    boundary,
  };
}

function sortFrontierKeys(
  frontier: Map<number, number>,
  dist: Float64Array,
): number[] {
  return sortByDistance([...frontier.keys()], dist);
}

function updateBestDistance(
  state: PlannerState,
  node: number,
  candidate: number,
  parent: number,
): void {
  const current = state.dist[node] as number;
  if (
    candidate < current ||
    (candidate === current && shouldPreferParent(parent, state.parents[node] as number))
  ) {
    state.dist[node] = candidate;
    state.parents[node] = parent;
  }
}

function shouldPreferParent(candidate: number, current: number): boolean {
  if (current === -1) {
    return true;
  }

  return candidate < current;
}

function traceRoot(
  node: number,
  sourceFlags: Uint8Array,
  parents: Int32Array,
): number {
  let current = node;

  while (current !== -1 && sourceFlags[current] === 0) {
    const parent = parents[current] as number;
    if (parent === current) {
      break;
    }

    current = parent;
  }

  if (current !== -1 && sourceFlags[current] === 1) {
    return current;
  }

  return -1;
}

function markComplete(state: PlannerState, nodes: number[]): void {
  for (const node of nodes) {
    state.complete[node] = 1;
  }
}

function powerOfTwo(exponent: number): number {
  return Math.max(1, Math.round(Math.pow(2, exponent)));
}

function labelValue(
  state: PlannerState,
  distance: number,
  node: number,
): number {
  if (!Number.isFinite(distance)) {
    return Number.POSITIVE_INFINITY;
  }

  return distance * (state.grid.cellCount + 1) + node;
}

function nodeLabel(state: PlannerState, node: number): number {
  return labelValue(state, state.dist[node] as number, node);
}

function isLabelBelowBound(
  state: PlannerState,
  distance: number,
  node: number,
  bound: number,
): boolean {
  return labelValue(state, distance, node) < bound;
}

function isNodeBelowBound(
  state: PlannerState,
  node: number,
  bound: number,
): boolean {
  return nodeLabel(state, node) < bound;
}

class VisualizationPlanner {
  batches: Array<StepResult<AlgorithmStepMeta>> = [];

  private frontier = new Set<number>();
  private current = new Set<number>();
  private visited = new Set<number>();
  private path = new Set<number>();

  push(args: {
    line: number;
    current?: number[];
    frontier?: number[];
    visit?: number[];
    path?: number[];
    done?: boolean;
    solved?: boolean;
    pathLength?: number;
  }): void {
    const nextCurrent = new Set(args.current ?? []);
    const nextFrontier = new Set(args.frontier ?? []);
    const patches: CellPatch[] = [];

    for (const index of sortAscending(this.current)) {
      if (!nextCurrent.has(index)) {
        patches.push({
          index,
          overlayClear: OverlayFlag.Current,
        });
      }
    }

    for (const index of sortAscending(this.frontier)) {
      if (!nextFrontier.has(index)) {
        patches.push({
          index,
          overlayClear: OverlayFlag.Frontier,
        });
      }
    }

    for (const index of sortAscending(nextFrontier)) {
      if (!this.frontier.has(index)) {
        patches.push({
          index,
          overlaySet: OverlayFlag.Frontier,
        });
      }
    }

    for (const index of sortAscending(nextCurrent)) {
      if (!this.current.has(index)) {
        patches.push({
          index,
          overlaySet: OverlayFlag.Current,
        });
      }
    }

    for (const index of sortAscending(args.visit ?? [])) {
      if (this.visited.has(index)) {
        continue;
      }

      this.visited.add(index);
      patches.push({
        index,
        overlaySet: OverlayFlag.Visited,
      });
    }

    for (const index of sortAscending(args.path ?? [])) {
      if (this.path.has(index)) {
        continue;
      }

      this.path.add(index);
      patches.push({
        index,
        overlaySet: OverlayFlag.Path,
      });
    }

    this.current = nextCurrent;
    this.frontier = nextFrontier;

    this.batches.push({
      done: args.done ?? false,
      patches,
      meta: {
        line: args.line,
        visitedCount: this.visited.size,
        frontierSize: this.frontier.size,
        solved: args.solved,
        pathLength: args.pathLength,
      },
    });
  }
}

function sortAscending(values: Iterable<number>): number[] {
  return [...values].sort((left, right) => left - right);
}
