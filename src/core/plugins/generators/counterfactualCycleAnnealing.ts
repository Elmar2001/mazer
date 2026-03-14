import {
  carvePatch,
  neighbors,
  OverlayFlag,
  WallFlag,
  type Grid,
} from "@/core/grid";
import type { CellPatch } from "@/core/patches";
import type { GeneratorPlugin } from "@/core/plugins/GeneratorPlugin";
import type {
  AlgorithmStepMeta,
  GeneratorRunOptions,
} from "@/core/plugins/types";
import type { RandomSource } from "@/core/rng";

interface NeighborSlot {
  to: number;
  wall: WallFlag;
  opposite: WallFlag;
  edge: number;
}

interface TreeEdge {
  a: number;
  b: number;
  aWall: WallFlag;
  bWall: WallFlag;
  affinity: number;
}

interface SeedMove {
  from: number;
  to: number;
  fromWall: WallFlag;
  toWall: WallFlag;
  edge: number;
}

interface SwapChoice {
  removeEdge: number;
  delta: number;
}

interface CounterfactualContext {
  grid: Grid;
  rng: RandomSource;
  startIndex: number;
  phase: "seeding" | "annealing" | "complete";
  seedMoves: SeedMove[];
  seedCursor: number;
  visited: Uint8Array;
  visitedCount: number;
  edges: TreeEdge[];
  neighborSlots: NeighborSlot[][];
  edgePresent: Uint8Array;
  edgeCooldownUntil: Uint32Array;
  openMask: Uint8Array;
  degree: Uint8Array;
  targetDegree: Uint8Array;
  annealBudget: number;
  annealStep: number;
  acceptedSwaps: number;
  initialTemperature: number;
  coolingRate: number;
  minTemperature: number;
  edgeAffinityWeight: number;
  edgeCooldownSpan: number;
  allowUphillMoves: boolean;
  noChangeStreak: number;
  maxNoChangeStreak: number;
  previousHighlights: number[];
}

const DEFAULT_SWAP_BUDGET_FACTOR = 0.75;
const DEFAULT_INITIAL_TEMPERATURE = 1;
const DEFAULT_COOLING_RATE = 0.995;
const DEFAULT_MIN_TEMPERATURE = 0.05;
const DEFAULT_EDGE_AFFINITY_WEIGHT = 0.6;
const DEFAULT_EDGE_COOLDOWN = 6;
const DEFAULT_MAX_NO_CHANGE_FACTOR = 0.1;

export const counterfactualCycleAnnealingGenerator: GeneratorPlugin<
  GeneratorRunOptions,
  AlgorithmStepMeta
> = {
  id: "counterfactual-cycle-annealing",
  label: "Counterfactual Cycle Annealing (Simulated Graph Annealing)",
  create({ grid, rng, options }) {
    const start =
      typeof options.startIndex === "number" &&
      options.startIndex >= 0 &&
      options.startIndex < grid.cellCount
        ? options.startIndex
        : rng.nextInt(grid.cellCount);

    const { edges, neighborSlots } = buildEdgeGraph(grid);
    const targetDegree = buildTargetDegrees(neighborSlots, rng);
    assignEdgeAffinities(edges, targetDegree, rng);
    const seedMoves = buildSeedMoves(start, neighborSlots, rng);

    const swapBudgetFactor = readNumericOption(
      options,
      "swapBudgetFactor",
      DEFAULT_SWAP_BUDGET_FACTOR,
      0,
      20,
    );
    const annealBudget =
      grid.cellCount <= 1
        ? 0
        : Math.max(1, Math.floor(grid.cellCount * swapBudgetFactor));

    const context: CounterfactualContext = {
      grid,
      rng,
      startIndex: start,
      phase: "seeding",
      seedMoves,
      seedCursor: 0,
      visited: new Uint8Array(grid.cellCount),
      visitedCount: 0,
      edges,
      neighborSlots,
      edgePresent: new Uint8Array(edges.length),
      edgeCooldownUntil: new Uint32Array(edges.length),
      openMask: new Uint8Array(grid.cellCount),
      degree: new Uint8Array(grid.cellCount),
      targetDegree,
      annealBudget,
      annealStep: 0,
      acceptedSwaps: 0,
      initialTemperature: readNumericOption(
        options,
        "initialTemperature",
        DEFAULT_INITIAL_TEMPERATURE,
        0.001,
        20,
      ),
      coolingRate: readNumericOption(
        options,
        "coolingRate",
        DEFAULT_COOLING_RATE,
        0.8,
        0.9999,
      ),
      minTemperature: readNumericOption(
        options,
        "minTemperature",
        DEFAULT_MIN_TEMPERATURE,
        0.001,
        1,
      ),
      edgeAffinityWeight: readNumericOption(
        options,
        "edgeAffinityWeight",
        DEFAULT_EDGE_AFFINITY_WEIGHT,
        0,
        2,
      ),
      edgeCooldownSpan: Math.floor(
        readNumericOption(options, "edgeCooldown", DEFAULT_EDGE_COOLDOWN, 0, 128),
      ),
      allowUphillMoves: readBooleanOption(options, "allowUphillMoves", false),
      noChangeStreak: 0,
      maxNoChangeStreak: Math.max(
        16,
        Math.floor(
          grid.cellCount *
            readNumericOption(
              options,
              "maxNoChangeFactor",
              DEFAULT_MAX_NO_CHANGE_FACTOR,
              0.01,
              1,
            ),
        ),
      ),
      previousHighlights: [],
    };

    return {
      step: () => stepCounterfactual(context),
    };
  },
};

function stepCounterfactual(context: CounterfactualContext) {
  const patches: CellPatch[] = [];
  clearStepHighlights(context, patches);

  if (context.phase === "complete") {
    return {
      done: true,
      patches,
      meta: {
        line: 6,
        visitedCount: context.grid.cellCount,
        frontierSize: 0,
      },
    };
  }

  if (context.phase === "seeding") {
    return stepSeeding(context, patches);
  }

  return stepAnnealing(context, patches);
}

function stepSeeding(context: CounterfactualContext, patches: CellPatch[]) {
  if (context.visitedCount === 0) {
    context.visited[context.startIndex] = 1;
    context.visitedCount = 1;

    patches.push({
      index: context.startIndex,
      overlaySet: OverlayFlag.Visited,
    });

    if (context.grid.cellCount <= 1) {
      context.phase = "complete";
      return {
        done: true,
        patches,
        meta: {
          line: 6,
          visitedCount: context.visitedCount,
          frontierSize: 0,
        },
      };
    }

    setStepHighlights(context, patches, [context.startIndex], []);

    return {
      done: false,
      patches,
      meta: {
        line: 1,
        visitedCount: context.visitedCount,
        frontierSize: context.seedMoves.length,
      },
    };
  }

  if (context.seedCursor >= context.seedMoves.length) {
    context.phase = context.annealBudget > 0 ? "annealing" : "complete";
    return {
      done: context.phase === "complete",
      patches,
      meta: {
        line: context.phase === "complete" ? 6 : 3,
        visitedCount: context.visitedCount,
        frontierSize: context.phase === "complete" ? 0 : context.annealBudget,
      },
    };
  }

  const move = context.seedMoves[context.seedCursor] as SeedMove;
  context.seedCursor += 1;

  openEdge(context, move.edge);
  patches.push(...carvePatch(move.from, move.to, move.fromWall, move.toWall));

  if (context.visited[move.to] === 0) {
    context.visited[move.to] = 1;
    context.visitedCount += 1;
    patches.push({
      index: move.to,
      overlaySet: OverlayFlag.Visited,
    });
  }

  setStepHighlights(context, patches, [move.to], []);

  return {
    done: false,
    patches,
    meta: {
      line: 2,
      visitedCount: context.visitedCount,
      frontierSize: context.seedMoves.length - context.seedCursor,
    },
  };
}

function stepAnnealing(context: CounterfactualContext, patches: CellPatch[]) {
  if (context.annealStep >= context.annealBudget) {
    context.phase = "complete";
    return {
      done: true,
      patches,
      meta: {
        line: 6,
        visitedCount: context.grid.cellCount,
        frontierSize: 0,
      },
    };
  }

  const focusCell = chooseStressFocus(context);
  const addEdge = chooseClosedEdge(context, focusCell);
  if (addEdge === -1) {
    context.phase = "complete";
    return {
      done: true,
      patches,
      meta: {
        line: 6,
        visitedCount: context.grid.cellCount,
        frontierSize: 0,
      },
    };
  }

  const add = context.edges[addEdge] as TreeEdge;
  const pathEdges = findTreePathEdges(context, add.a, add.b);
  if (pathEdges.length === 0) {
    context.annealStep += 1;
    const done = context.annealStep >= context.annealBudget;
    if (done) {
      context.phase = "complete";
    } else {
      setStepHighlights(context, patches, [focusCell], [add.a, add.b]);
    }

    return {
      done,
      patches,
      meta: {
        line: done ? 6 : 4,
        visitedCount: context.grid.cellCount,
        frontierSize: done ? 0 : context.annealBudget - context.annealStep,
      },
    };
  }

  const bestSwap = chooseRemovalEdge(context, addEdge, pathEdges);
  const temperature = annealingTemperature(context);
  const bootstrapSwap = context.annealStep === 0 && context.acceptedSwaps === 0;
  const improving = bestSwap.delta < -1e-6;
  const accepted =
    bootstrapSwap ||
    improving ||
    (context.allowUphillMoves &&
      context.rng.next() < Math.exp(-bestSwap.delta / temperature));

  let nextCurrentHighlights: number[] = [];
  let nextFrontierHighlights: number[] = [];

  if (accepted) {
    applyAcceptedSwap(context, addEdge, bestSwap.removeEdge, patches);
    context.acceptedSwaps += 1;
    context.noChangeStreak = 0;

    context.edgeCooldownUntil[addEdge] = context.annealStep + context.edgeCooldownSpan;
    context.edgeCooldownUntil[bestSwap.removeEdge] =
      context.annealStep + context.edgeCooldownSpan;

    const removed = context.edges[bestSwap.removeEdge] as TreeEdge;
    nextCurrentHighlights = [add.a, add.b];
    nextFrontierHighlights = [removed.a, removed.b];
  } else {
    context.noChangeStreak += 1;
    nextCurrentHighlights = [focusCell];
    nextFrontierHighlights = [add.a, add.b];
  }

  context.annealStep += 1;
  const done =
    context.annealStep >= context.annealBudget ||
    context.noChangeStreak >= context.maxNoChangeStreak;
  if (done) {
    context.phase = "complete";
  } else {
    setStepHighlights(
      context,
      patches,
      nextCurrentHighlights,
      nextFrontierHighlights,
    );
  }

  return {
    done,
    patches,
    meta: {
      line: done ? 6 : 5,
      visitedCount: context.grid.cellCount,
      frontierSize: done ? 0 : context.annealBudget - context.annealStep,
    },
  };
}

function applyAcceptedSwap(
  context: CounterfactualContext,
  addEdge: number,
  removeEdge: number,
  patches: CellPatch[],
): void {
  const added = context.edges[addEdge] as TreeEdge;
  const removed = context.edges[removeEdge] as TreeEdge;

  openEdge(context, addEdge);
  closeEdge(context, removeEdge);

  patches.push(...carvePatch(added.a, added.b, added.aWall, added.bWall));
  patches.push({
    index: removed.a,
    wallSet: removed.aWall,
  });
  patches.push({
    index: removed.b,
    wallSet: removed.bWall,
  });
}

function chooseStressFocus(context: CounterfactualContext): number {
  const sampleCount = Math.min(context.grid.cellCount, 48);
  let best = context.rng.nextInt(context.grid.cellCount);
  let bestScore = cellStress(context, best) + context.rng.next() * 0.05;

  for (let i = 1; i < sampleCount; i += 1) {
    const candidate = context.rng.nextInt(context.grid.cellCount);
    const score = cellStress(context, candidate) + context.rng.next() * 0.05;
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return best;
}

function cellStress(context: CounterfactualContext, cell: number): number {
  const degreeGap = Math.abs(
    (context.degree[cell] as number) - (context.targetDegree[cell] as number),
  );

  let closedNeighbors = 0;
  for (const slot of context.neighborSlots[cell] as NeighborSlot[]) {
    if (context.edgePresent[slot.edge] === 0) {
      closedNeighbors += 1;
    }
  }

  return degreeGap + (closedNeighbors > 0 ? 0.15 : 0);
}

function chooseClosedEdge(
  context: CounterfactualContext,
  focusCell: number,
): number {
  const localCandidates: number[] = [];
  for (const slot of context.neighborSlots[focusCell] as NeighborSlot[]) {
    if (
      context.edgePresent[slot.edge] === 0 &&
      context.edgeCooldownUntil[slot.edge] <= context.annealStep
    ) {
      localCandidates.push(slot.edge);
    }
  }

  if (localCandidates.length > 0) {
    let best = localCandidates[0] as number;
    let bestScore = edgeDesirability(context, best);
    for (let i = 1; i < localCandidates.length; i += 1) {
      const edge = localCandidates[i] as number;
      const score = edgeDesirability(context, edge);
      if (score > bestScore) {
        best = edge;
        bestScore = score;
      }
    }
    return best;
  }

  for (let i = 0; i < 64; i += 1) {
    const edge = context.rng.nextInt(context.edges.length);
    if (
      context.edgePresent[edge] === 0 &&
      context.edgeCooldownUntil[edge] <= context.annealStep
    ) {
      return edge;
    }
  }

  for (let i = 0; i < context.edges.length; i += 1) {
    if (context.edgePresent[i] === 0) {
      return i;
    }
  }

  return -1;
}

function edgeDesirability(context: CounterfactualContext, edgeIndex: number): number {
  const edge = context.edges[edgeIndex] as TreeEdge;
  const endpointStress = cellStress(context, edge.a) + cellStress(context, edge.b);
  return edge.affinity + endpointStress * 0.25;
}

function chooseRemovalEdge(
  context: CounterfactualContext,
  addEdge: number,
  pathEdges: number[],
): SwapChoice {
  let bestEdge = -1;
  let bestDelta = Number.POSITIVE_INFINITY;

  for (const edge of pathEdges) {
    if (context.edgeCooldownUntil[edge] > context.annealStep) {
      continue;
    }

    const delta = swapEnergyDelta(context, addEdge, edge);
    if (delta < bestDelta) {
      bestDelta = delta;
      bestEdge = edge;
    }
  }

  if (bestEdge !== -1) {
    return {
      removeEdge: bestEdge,
      delta: bestDelta,
    };
  }

  for (const edge of pathEdges) {
    const delta = swapEnergyDelta(context, addEdge, edge);
    if (delta < bestDelta) {
      bestDelta = delta;
      bestEdge = edge;
    }
  }

  return {
    removeEdge: bestEdge,
    delta: bestDelta,
  };
}

function swapEnergyDelta(
  context: CounterfactualContext,
  addEdge: number,
  removeEdge: number,
): number {
  const added = context.edges[addEdge] as TreeEdge;
  const removed = context.edges[removeEdge] as TreeEdge;

  const deltas = new Map<number, number>();
  accumulateDelta(deltas, added.a, 1);
  accumulateDelta(deltas, added.b, 1);
  accumulateDelta(deltas, removed.a, -1);
  accumulateDelta(deltas, removed.b, -1);

  let before = 0;
  let after = 0;

  for (const [cell, delta] of deltas.entries()) {
    const degree = context.degree[cell] as number;
    const target = context.targetDegree[cell] as number;
    before += Math.abs(degree - target);
    after += Math.abs(degree + delta - target);
  }

  const edgeDelta =
    context.edgeAffinityWeight * (removed.affinity - added.affinity);

  return after - before + edgeDelta;
}

function accumulateDelta(
  deltas: Map<number, number>,
  cell: number,
  value: number,
): void {
  const current = deltas.get(cell) ?? 0;
  deltas.set(cell, current + value);
}

function annealingTemperature(context: CounterfactualContext): number {
  const base =
    context.initialTemperature *
    Math.pow(context.coolingRate, context.annealStep);
  return Math.max(context.minTemperature, base);
}

function findTreePathEdges(
  context: CounterfactualContext,
  start: number,
  goal: number,
): number[] {
  if (start === goal) {
    return [];
  }

  const parentCell = new Int32Array(context.grid.cellCount);
  const parentEdge = new Int32Array(context.grid.cellCount);
  parentCell.fill(-1);
  parentEdge.fill(-1);

  const queue: number[] = [start];
  parentCell[start] = start;
  let head = 0;
  let found = false;

  while (head < queue.length && !found) {
    const current = queue[head] as number;
    head += 1;

    for (const slot of context.neighborSlots[current] as NeighborSlot[]) {
      if ((context.openMask[current] & slot.wall) === 0) {
        continue;
      }

      if (parentCell[slot.to] !== -1) {
        continue;
      }

      parentCell[slot.to] = current;
      parentEdge[slot.to] = slot.edge;

      if (slot.to === goal) {
        found = true;
        break;
      }

      queue.push(slot.to);
    }
  }

  if (!found) {
    return [];
  }

  const result: number[] = [];
  let node = goal;
  while (node !== start) {
    const edge = parentEdge[node] as number;
    if (edge < 0) {
      return [];
    }
    result.push(edge);
    node = parentCell[node] as number;
  }

  return result;
}

function openEdge(context: CounterfactualContext, edgeIndex: number): void {
  if (context.edgePresent[edgeIndex] === 1) {
    return;
  }

  const edge = context.edges[edgeIndex] as TreeEdge;
  context.edgePresent[edgeIndex] = 1;
  context.openMask[edge.a] |= edge.aWall;
  context.openMask[edge.b] |= edge.bWall;
  context.degree[edge.a] += 1;
  context.degree[edge.b] += 1;
}

function closeEdge(context: CounterfactualContext, edgeIndex: number): void {
  if (context.edgePresent[edgeIndex] === 0) {
    return;
  }

  const edge = context.edges[edgeIndex] as TreeEdge;
  context.edgePresent[edgeIndex] = 0;
  context.openMask[edge.a] &= ~edge.aWall;
  context.openMask[edge.b] &= ~edge.bWall;
  context.degree[edge.a] -= 1;
  context.degree[edge.b] -= 1;
}

function buildSeedMoves(
  start: number,
  neighborSlots: NeighborSlot[][],
  rng: RandomSource,
): SeedMove[] {
  const visited = new Uint8Array(neighborSlots.length);
  const stack: number[] = [start];
  visited[start] = 1;

  const moves: SeedMove[] = [];

  while (stack.length > 0) {
    const current = stack[stack.length - 1] as number;
    const choices = (neighborSlots[current] as NeighborSlot[]).filter(
      (slot) => visited[slot.to] === 0,
    );

    if (choices.length === 0) {
      stack.pop();
      continue;
    }

    const pick = choices[rng.nextInt(choices.length)] as NeighborSlot;
    visited[pick.to] = 1;
    stack.push(pick.to);
    moves.push({
      from: current,
      to: pick.to,
      fromWall: pick.wall,
      toWall: pick.opposite,
      edge: pick.edge,
    });
  }

  return moves;
}

function buildTargetDegrees(
  neighborSlots: NeighborSlot[][],
  rng: RandomSource,
): Uint8Array {
  const target = new Uint8Array(neighborSlots.length);

  for (let i = 0; i < neighborSlots.length; i += 1) {
    const draw = rng.next();
    let desired = 2;
    if (draw < 0.22) {
      desired = 1;
    } else if (draw > 0.86) {
      desired = 3;
    }

    const cap = neighborSlots[i]?.length ?? 0;
    target[i] = Math.max(1, Math.min(desired, cap));
  }

  return target;
}

function assignEdgeAffinities(
  edges: TreeEdge[],
  targetDegree: Uint8Array,
  rng: RandomSource,
): void {
  const phases = new Float32Array(targetDegree.length);
  for (let i = 0; i < phases.length; i += 1) {
    phases[i] = rng.next() * Math.PI * 2;
  }

  for (const edge of edges) {
    const phaseGap = (phases[edge.a] as number) - (phases[edge.b] as number);
    const alignment = 0.5 + 0.5 * Math.cos(phaseGap);
    const degreeHarmony =
      Math.abs((targetDegree[edge.a] as number) - (targetDegree[edge.b] as number)) <=
      1
        ? 1
        : 0.2;

    edge.affinity = alignment * 0.75 + degreeHarmony * 0.25;
  }
}

function buildEdgeGraph(grid: Grid): {
  edges: TreeEdge[];
  neighborSlots: NeighborSlot[][];
} {
  const edges: TreeEdge[] = [];
  const neighborSlots: NeighborSlot[][] = Array.from(
    { length: grid.cellCount },
    () => [],
  );
  const edgeByKey = new Map<number, number>();

  for (let i = 0; i < grid.cellCount; i += 1) {
    for (const neighbor of neighbors(grid, i)) {
      const a = Math.min(i, neighbor.index);
      const b = Math.max(i, neighbor.index);
      const key = a * grid.cellCount + b;

      let edgeIndex = edgeByKey.get(key);
      if (typeof edgeIndex !== "number") {
        const aWall = a === i ? neighbor.direction.wall : neighbor.direction.opposite;
        const bWall = a === i ? neighbor.direction.opposite : neighbor.direction.wall;

        edges.push({
          a,
          b,
          aWall,
          bWall,
          affinity: 0,
        });
        edgeIndex = edges.length - 1;
        edgeByKey.set(key, edgeIndex);
      }

      neighborSlots[i]?.push({
        to: neighbor.index,
        wall: neighbor.direction.wall,
        opposite: neighbor.direction.opposite,
        edge: edgeIndex,
      });
    }
  }

  return {
    edges,
    neighborSlots,
  };
}

function clearStepHighlights(
  context: CounterfactualContext,
  patches: CellPatch[],
): void {
  for (const index of context.previousHighlights) {
    patches.push({
      index,
      overlayClear: OverlayFlag.Current | OverlayFlag.Frontier,
    });
  }
  context.previousHighlights = [];
}

function setStepHighlights(
  context: CounterfactualContext,
  patches: CellPatch[],
  current: number[],
  frontier: number[],
): void {
  const unique = new Set<number>();

  for (const index of current) {
    unique.add(index);
    patches.push({
      index,
      overlaySet: OverlayFlag.Current,
    });
  }

  for (const index of frontier) {
    unique.add(index);
    patches.push({
      index,
      overlaySet: OverlayFlag.Frontier,
    });
  }

  context.previousHighlights = Array.from(unique);
}

function readNumericOption(
  options: GeneratorRunOptions,
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = options[key];
  const parsed =
    typeof raw === "number"
      ? raw
      : typeof raw === "string"
        ? Number.parseFloat(raw)
        : Number.NaN;

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}

function readBooleanOption(
  options: GeneratorRunOptions,
  key: string,
  fallback: boolean,
): boolean {
  const raw = options[key];

  if (typeof raw === "boolean") {
    return raw;
  }

  if (typeof raw === "string") {
    const normalized = raw.trim().toLowerCase();
    if (normalized === "true") {
      return true;
    }
    if (normalized === "false") {
      return false;
    }
  }

  return fallback;
}
