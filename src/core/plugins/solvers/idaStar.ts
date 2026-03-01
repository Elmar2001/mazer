import { OverlayFlag, type Grid } from "@/core/grid";
import type { CellPatch } from "@/core/patches";
import type { SolverPlugin } from "@/core/plugins/SolverPlugin";
import type { AlgorithmStepMeta, SolverRunOptions } from "@/core/plugins/types";
import {
  buildPath,
  getOpenNeighbors,
  manhattan,
} from "@/core/plugins/solvers/helpers";

interface IdaFrame {
  index: number;
  g: number;
  neighbors: number[];
  cursor: number;
  entered: boolean;
}

interface IdaContext {
  grid: Grid;
  startIndex: number;
  goalIndex: number;
  threshold: number;
  nextThreshold: number;
  started: boolean;
  done: boolean;
  solved: boolean;
  stack: IdaFrame[];
  inPath: Uint8Array;
  parents: Int32Array;
  visitedFlags: Uint8Array;
  visitedCount: number;
  iterationVisitedFlags: Uint8Array;
  iterationVisitedNodes: number[];
  previousFrontierNodes: number[];
  currentIndex: number;
  pathLength: number;
}

export const idaStarSolver: SolverPlugin<SolverRunOptions, AlgorithmStepMeta> = {
  id: "ida-star",
  label: "IDA* (Iterative Deepening A*)",
  create({ grid, options }) {
    const parents = new Int32Array(grid.cellCount);
    parents.fill(-1);

    const context: IdaContext = {
      grid,
      startIndex: options.startIndex,
      goalIndex: options.goalIndex,
      threshold: manhattan(grid.width, options.startIndex, options.goalIndex),
      nextThreshold: Number.POSITIVE_INFINITY,
      started: false,
      done: false,
      solved: false,
      stack: [],
      inPath: new Uint8Array(grid.cellCount),
      parents,
      visitedFlags: new Uint8Array(grid.cellCount),
      visitedCount: 0,
      iterationVisitedFlags: new Uint8Array(grid.cellCount),
      iterationVisitedNodes: [],
      previousFrontierNodes: [],
      currentIndex: -1,
      pathLength: 0,
    };

    return {
      step: () => stepIdaStar(context),
    };
  },
};

function stepIdaStar(context: IdaContext) {
  const patches: CellPatch[] = [];

  clearTransientOverlays(context, patches);

  if (context.done) {
    return {
      done: true,
      patches,
      meta: {
        line: 6,
        visitedCount: context.visitedCount,
        frontierSize: 0,
        solved: context.solved,
        pathLength: context.pathLength,
      },
    };
  }

  if (!context.started) {
    startIteration(context);
    context.started = true;
  }

  const actionsPerStep = 24;
  let actions = 0;

  while (!context.done && actions < actionsPerStep) {
    if (context.stack.length === 0) {
      if (!Number.isFinite(context.nextThreshold)) {
        context.done = true;
        context.solved = false;
        break;
      }

      context.threshold = context.nextThreshold;
      context.nextThreshold = Number.POSITIVE_INFINITY;
      resetIteration(context, patches);
      startIteration(context);
    }

    processSingleStackAction(context, patches);
    actions += 1;
  }

  syncFrontierAndCurrentOverlays(context, patches);

  return {
    done: context.done,
    patches,
    meta: {
      line: context.done ? 4 : 3,
      visitedCount: context.visitedCount,
      frontierSize: context.stack.length,
      solved: context.solved,
      pathLength: context.pathLength,
    },
  };
}

function clearTransientOverlays(context: IdaContext, patches: CellPatch[]): void {
  if (context.currentIndex !== -1) {
    patches.push({
      index: context.currentIndex,
      overlayClear: OverlayFlag.Current,
    });
    context.currentIndex = -1;
  }

  for (const node of context.previousFrontierNodes) {
    patches.push({
      index: node,
      overlayClear: OverlayFlag.Frontier,
    });
  }
  context.previousFrontierNodes = [];
}

function startIteration(context: IdaContext): void {
  context.parents.fill(-1);
  context.inPath.fill(0);

  context.parents[context.startIndex] = context.startIndex;
  context.inPath[context.startIndex] = 1;
  context.stack.push(createFrame(context.grid, context.startIndex, 0, context.goalIndex));
}

function resetIteration(context: IdaContext, patches: CellPatch[]): void {
  for (const node of context.iterationVisitedNodes) {
    patches.push({
      index: node,
      overlayClear: OverlayFlag.Visited | OverlayFlag.Frontier | OverlayFlag.Current,
    });
    context.iterationVisitedFlags[node] = 0;
  }

  context.iterationVisitedNodes = [];
  context.stack = [];
}

function processSingleStackAction(context: IdaContext, patches: CellPatch[]): void {
  if (context.stack.length === 0 || context.done) {
    return;
  }

  const frame = context.stack[context.stack.length - 1] as IdaFrame;

  if (!frame.entered) {
    const f = frame.g + manhattan(context.grid.width, frame.index, context.goalIndex);
    if (f > context.threshold) {
      if (f < context.nextThreshold) {
        context.nextThreshold = f;
      }

      context.stack.pop();
      context.inPath[frame.index] = 0;
      return;
    }

    frame.entered = true;

    if (context.visitedFlags[frame.index] === 0) {
      context.visitedFlags[frame.index] = 1;
      context.visitedCount += 1;
    }

    if (context.iterationVisitedFlags[frame.index] === 0) {
      context.iterationVisitedFlags[frame.index] = 1;
      context.iterationVisitedNodes.push(frame.index);
      patches.push({
        index: frame.index,
        overlaySet: OverlayFlag.Visited,
      });
    }

    if (frame.index === context.goalIndex) {
      const path = buildPath(context.startIndex, context.goalIndex, context.parents);
      for (const index of path) {
        patches.push({
          index,
          overlaySet: OverlayFlag.Path,
        });
      }

      context.done = true;
      context.solved = true;
      context.pathLength = path.length;
      context.stack = [];
      return;
    }
  }

  while (frame.cursor < frame.neighbors.length) {
    const next = frame.neighbors[frame.cursor] as number;
    frame.cursor += 1;

    if (context.inPath[next] === 1) {
      continue;
    }

    context.parents[next] = frame.index;
    context.inPath[next] = 1;
    context.stack.push(createFrame(context.grid, next, frame.g + 1, context.goalIndex));
    return;
  }

  context.stack.pop();
  context.inPath[frame.index] = 0;
}

function syncFrontierAndCurrentOverlays(
  context: IdaContext,
  patches: CellPatch[],
): void {
  for (const frame of context.stack) {
    patches.push({
      index: frame.index,
      overlaySet: OverlayFlag.Frontier,
    });
    context.previousFrontierNodes.push(frame.index);
  }

  if (context.stack.length > 0) {
    const top = context.stack[context.stack.length - 1] as IdaFrame;
    context.currentIndex = top.index;
    patches.push({
      index: top.index,
      overlaySet: OverlayFlag.Current,
    });
  }
}

function createFrame(
  grid: Grid,
  index: number,
  g: number,
  goalIndex: number,
): IdaFrame {
  const neighbors = getOpenNeighbors(grid, index);
  neighbors.sort(
    (a, b) => manhattan(grid.width, a, goalIndex) - manhattan(grid.width, b, goalIndex),
  );

  return {
    index,
    g,
    neighbors,
    cursor: 0,
    entered: false,
  };
}
