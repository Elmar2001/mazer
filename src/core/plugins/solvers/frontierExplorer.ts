import { OverlayFlag, type Grid } from "@/core/grid";
import type { CellPatch } from "@/core/patches";
import type { SolverPlugin } from "@/core/plugins/SolverPlugin";
import type { AlgorithmStepMeta, SolverRunOptions } from "@/core/plugins/types";
import { buildPath, getOpenNeighbors } from "@/core/plugins/solvers/helpers";

interface FrontierContext {
  grid: Grid;
  startIndex: number;
  goalIndex: number;
  currentIndex: number;
  previousCurrent: number;
  known: Uint8Array;
  knownCount: number;
  frontierFlags: Uint8Array;
  frontierNodes: number[];
  previousFrontierNodes: number[];
  phase: "explore" | "navigate" | "done";
  plannedPath: number[];
  plannedCursor: number;
  solved: boolean;
  pathLength: number;
}

export const frontierExplorerSolver: SolverPlugin<
  SolverRunOptions,
  AlgorithmStepMeta
> = {
  id: "frontier-explorer",
  label: "Frontier-Based Exploration",
  create({ grid, options }) {
    const known = new Uint8Array(grid.cellCount);
    const frontierFlags = new Uint8Array(grid.cellCount);

    const context: FrontierContext = {
      grid,
      startIndex: options.startIndex,
      goalIndex: options.goalIndex,
      currentIndex: options.startIndex,
      previousCurrent: -1,
      known,
      knownCount: 0,
      frontierFlags,
      frontierNodes: [],
      previousFrontierNodes: [],
      phase: "explore",
      plannedPath: [],
      plannedCursor: 0,
      solved: false,
      pathLength: 0,
    };

    revealKnown(context, options.startIndex, []);
    recomputeFrontier(context);

    if (context.known[context.goalIndex] === 1) {
      context.phase = "navigate";
    }

    return {
      step: () => stepFrontierExplorer(context),
    };
  },
};

function stepFrontierExplorer(context: FrontierContext) {
  const patches: CellPatch[] = [];

  if (context.previousCurrent !== -1) {
    patches.push({
      index: context.previousCurrent,
      overlayClear: OverlayFlag.Current,
    });
  }

  for (const node of context.previousFrontierNodes) {
    patches.push({
      index: node,
      overlayClear: OverlayFlag.Frontier,
    });
  }
  context.previousFrontierNodes = [];

  if (context.phase === "done") {
    return {
      done: true,
      patches,
      meta: {
        line: 4,
        visitedCount: context.knownCount,
        frontierSize: 0,
        solved: context.solved,
        pathLength: context.pathLength,
      },
    };
  }

  if (context.phase === "explore") {
    if (context.known[context.goalIndex] === 1) {
      context.phase = "navigate";
      context.plannedPath = [];
      context.plannedCursor = 0;
    } else {
      if (context.plannedPath.length === 0 || context.plannedCursor >= context.plannedPath.length) {
        const target = nearestFrontierTarget(context);
        if (target === -1) {
          context.phase = "done";
          context.solved = false;
        } else {
          context.plannedPath = bfsKnownPath(context, context.currentIndex, target);
          context.plannedCursor = 1;
        }
      }

      moveAlongPlan(context);
      revealKnown(context, context.currentIndex, patches);

      if (context.known[context.goalIndex] === 1) {
        context.phase = "navigate";
        context.plannedPath = [];
        context.plannedCursor = 0;
      }
    }
  }

  if (context.phase === "navigate") {
    if (context.currentIndex !== context.goalIndex) {
      if (context.plannedPath.length === 0 || context.plannedCursor >= context.plannedPath.length) {
        context.plannedPath = bfsKnownPath(context, context.currentIndex, context.goalIndex);
        context.plannedCursor = 1;

        if (context.plannedPath.length === 0) {
          context.phase = "done";
          context.solved = false;
        }
      }

      moveAlongPlan(context);
      revealKnown(context, context.currentIndex, patches);
    }

    if (context.currentIndex === context.goalIndex) {
      const finalPath = bfsKnownPath(context, context.startIndex, context.goalIndex);
      for (const index of finalPath) {
        patches.push({
          index,
          overlaySet: OverlayFlag.Path,
        });
      }

      context.pathLength = finalPath.length;
      context.solved = finalPath.length > 0;
      context.phase = "done";
    }
  }

  recomputeFrontier(context);
  for (const node of context.frontierNodes) {
    patches.push({
      index: node,
      overlaySet: OverlayFlag.Frontier,
    });
    context.previousFrontierNodes.push(node);
  }

  patches.push({
    index: context.currentIndex,
    overlaySet: OverlayFlag.Current | OverlayFlag.Visited,
  });
  context.previousCurrent = context.currentIndex;

  return {
    done: context.phase === "done",
    patches,
    meta: {
      line: context.phase === "explore" ? 2 : 3,
      visitedCount: context.knownCount,
      frontierSize: context.frontierNodes.length,
      solved: context.solved,
      pathLength: context.pathLength,
    },
  };
}

function moveAlongPlan(context: FrontierContext): void {
  if (
    context.plannedPath.length === 0 ||
    context.plannedCursor >= context.plannedPath.length
  ) {
    return;
  }

  const next = context.plannedPath[context.plannedCursor] as number;
  context.plannedCursor += 1;
  context.currentIndex = next;
}

function revealKnown(
  context: FrontierContext,
  index: number,
  patches: CellPatch[],
): void {
  if (context.known[index] === 0) {
    context.known[index] = 1;
    context.knownCount += 1;
    patches.push({
      index,
      overlaySet: OverlayFlag.Visited,
    });
  }

  for (const neighbor of getOpenNeighbors(context.grid, index)) {
    if (context.known[neighbor] === 1) {
      continue;
    }

    context.known[neighbor] = 1;
    context.knownCount += 1;
    patches.push({
      index: neighbor,
      overlaySet: OverlayFlag.Visited,
    });
  }
}

function recomputeFrontier(context: FrontierContext): void {
  context.frontierFlags.fill(0);
  context.frontierNodes = [];

  for (let cell = 0; cell < context.grid.cellCount; cell += 1) {
    if (context.known[cell] === 0) {
      continue;
    }

    for (const neighbor of getOpenNeighbors(context.grid, cell)) {
      if (context.known[neighbor] === 0) {
        context.frontierFlags[cell] = 1;
        context.frontierNodes.push(cell);
        break;
      }
    }
  }
}

function nearestFrontierTarget(context: FrontierContext): number {
  if (context.frontierNodes.length === 0) {
    return -1;
  }

  const queue = [context.currentIndex];
  const parents = new Int32Array(context.grid.cellCount);
  parents.fill(-1);
  parents[context.currentIndex] = context.currentIndex;

  let head = 0;
  while (head < queue.length) {
    const current = queue[head] as number;
    head += 1;

    if (context.frontierFlags[current] === 1) {
      return current;
    }

    for (const neighbor of getOpenNeighbors(context.grid, current)) {
      if (context.known[neighbor] === 0 || parents[neighbor] !== -1) {
        continue;
      }

      parents[neighbor] = current;
      queue.push(neighbor);
    }
  }

  return -1;
}

function bfsKnownPath(
  context: FrontierContext,
  start: number,
  goal: number,
): number[] {
  const parents = new Int32Array(context.grid.cellCount);
  parents.fill(-1);
  parents[start] = start;

  const queue = [start];
  let head = 0;

  while (head < queue.length) {
    const current = queue[head] as number;
    head += 1;

    if (current === goal) {
      return buildPath(start, goal, parents);
    }

    for (const neighbor of getOpenNeighbors(context.grid, current)) {
      if (context.known[neighbor] === 0 || parents[neighbor] !== -1) {
        continue;
      }

      parents[neighbor] = current;
      queue.push(neighbor);
    }
  }

  return [];
}
