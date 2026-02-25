import { OverlayFlag, type Grid } from "@/core/grid";
import type { CellPatch } from "@/core/patches";
import type { SolverPlugin } from "@/core/plugins/SolverPlugin";
import type { AlgorithmStepMeta, SolverRunOptions } from "@/core/plugins/types";
import { getOpenNeighbors } from "@/core/plugins/solvers/helpers";

interface BidirectionalContext {
  grid: Grid;
  startIndex: number;
  goalIndex: number;
  started: boolean;
  queueA: number[];
  queueB: number[];
  headA: number;
  headB: number;
  discoveredA: Uint8Array;
  discoveredB: Uint8Array;
  frontierA: Uint8Array;
  frontierB: Uint8Array;
  parentA: Int32Array;
  parentB: Int32Array;
  currentA: number;
  currentB: number;
  frontierCount: number;
}

export const bidirectionalBfsSolver: SolverPlugin<
  SolverRunOptions,
  AlgorithmStepMeta
> = {
  id: "bidirectional-bfs",
  label: "Bidirectional BFS",
  create({ grid, options }) {
    const parentA = new Int32Array(grid.cellCount);
    parentA.fill(-1);
    const parentB = new Int32Array(grid.cellCount);
    parentB.fill(-1);

    const context: BidirectionalContext = {
      grid,
      startIndex: options.startIndex,
      goalIndex: options.goalIndex,
      started: false,
      queueA: [],
      queueB: [],
      headA: 0,
      headB: 0,
      discoveredA: new Uint8Array(grid.cellCount),
      discoveredB: new Uint8Array(grid.cellCount),
      frontierA: new Uint8Array(grid.cellCount),
      frontierB: new Uint8Array(grid.cellCount),
      parentA,
      parentB,
      currentA: -1,
      currentB: -1,
      frontierCount: 0,
    };

    return {
      step: () => stepBidirectional(context),
    };
  },
};

function stepBidirectional(context: BidirectionalContext) {
  const patches: CellPatch[] = [];

  if (!context.started) {
    context.started = true;

    context.queueA.push(context.startIndex);
    context.queueB.push(context.goalIndex);

    context.parentA[context.startIndex] = context.startIndex;
    context.parentB[context.goalIndex] = context.goalIndex;

    context.discoveredA[context.startIndex] = 1;
    context.discoveredB[context.goalIndex] = 1;

    setFrontier(context, context.startIndex, "A", true, patches);
    setFrontier(context, context.goalIndex, "B", true, patches);

    if (context.startIndex === context.goalIndex) {
      patches.push({ index: context.startIndex, overlaySet: OverlayFlag.Path });
      patches.push({ index: context.startIndex, overlayClear: OverlayFlag.Frontier });

      return {
        done: true,
        patches,
        meta: {
          solved: true,
          pathLength: 1,
          frontierSize: 0,
        },
      };
    }

    return {
      done: false,
      patches,
      meta: {
        frontierSize: context.frontierCount,
      },
    };
  }

  if (context.currentA !== -1) {
    patches.push({
      index: context.currentA,
      overlayClear: OverlayFlag.Current,
    });
    context.currentA = -1;
  }

  if (context.currentB !== -1) {
    patches.push({
      index: context.currentB,
      overlayClear: OverlayFlag.Current,
    });
    context.currentB = -1;
  }

  const hasA = context.headA < context.queueA.length;
  const hasB = context.headB < context.queueB.length;

  if (!hasA || !hasB) {
    return {
      done: true,
      patches,
      meta: {
        solved: false,
        frontierSize: context.frontierCount,
      },
    };
  }

  const remainingA = context.queueA.length - context.headA;
  const remainingB = context.queueB.length - context.headB;
  const expandA = remainingA <= remainingB;

  const meeting = expandA
    ? expandOneSide(context, "A", patches)
    : expandOneSide(context, "B", patches);

  if (meeting === -1) {
    return {
      done: false,
      patches,
      meta: {
        frontierSize: context.frontierCount,
      },
    };
  }

  const path = buildBidirectionalPath(context, meeting);
  for (const index of path) {
    patches.push({ index, overlaySet: OverlayFlag.Path });
  }

  if (context.currentA !== -1) {
    patches.push({ index: context.currentA, overlayClear: OverlayFlag.Current });
    context.currentA = -1;
  }

  if (context.currentB !== -1) {
    patches.push({ index: context.currentB, overlayClear: OverlayFlag.Current });
    context.currentB = -1;
  }

  return {
    done: true,
    patches,
    meta: {
      solved: true,
      pathLength: path.length,
      frontierSize: context.frontierCount,
    },
  };
}

function expandOneSide(
  context: BidirectionalContext,
  side: "A" | "B",
  patches: CellPatch[],
): number {
  const queue = side === "A" ? context.queueA : context.queueB;
  const current = queue[side === "A" ? context.headA : context.headB] as number;

  if (side === "A") {
    context.headA += 1;
    context.currentA = current;
  } else {
    context.headB += 1;
    context.currentB = current;
  }

  setFrontier(context, current, side, false, patches);
  patches.push({
    index: current,
    overlaySet: OverlayFlag.Visited | OverlayFlag.Current,
  });

  const thisDiscovered = side === "A" ? context.discoveredA : context.discoveredB;
  const otherDiscovered = side === "A" ? context.discoveredB : context.discoveredA;
  const thisParents = side === "A" ? context.parentA : context.parentB;

  if (otherDiscovered[current] === 1) {
    return current;
  }

  for (const neighbor of getOpenNeighbors(context.grid, current)) {
    if (thisDiscovered[neighbor] === 1) {
      continue;
    }

    thisDiscovered[neighbor] = 1;
    thisParents[neighbor] = current;
    queue.push(neighbor);
    setFrontier(context, neighbor, side, true, patches);

    if (otherDiscovered[neighbor] === 1) {
      return neighbor;
    }
  }

  return -1;
}

function setFrontier(
  context: BidirectionalContext,
  index: number,
  side: "A" | "B",
  value: boolean,
  patches: CellPatch[],
): void {
  const a = context.frontierA[index] === 1;
  const b = context.frontierB[index] === 1;
  const beforeUnion = a || b;

  if (side === "A") {
    context.frontierA[index] = value ? 1 : 0;
  } else {
    context.frontierB[index] = value ? 1 : 0;
  }

  const afterUnion =
    context.frontierA[index] === 1 || context.frontierB[index] === 1;

  if (beforeUnion === afterUnion) {
    return;
  }

  if (afterUnion) {
    context.frontierCount += 1;
    patches.push({ index, overlaySet: OverlayFlag.Frontier });
  } else {
    context.frontierCount = Math.max(0, context.frontierCount - 1);
    patches.push({ index, overlayClear: OverlayFlag.Frontier });
  }
}

function buildBidirectionalPath(
  context: BidirectionalContext,
  meeting: number,
): number[] {
  const left: number[] = [];
  let current = meeting;

  while (current !== context.startIndex) {
    left.push(current);
    current = context.parentA[current] as number;
  }

  left.push(context.startIndex);
  left.reverse();

  const right: number[] = [];
  current = meeting;
  while (current !== context.goalIndex) {
    current = context.parentB[current] as number;
    right.push(current);
  }

  return left.concat(right);
}
