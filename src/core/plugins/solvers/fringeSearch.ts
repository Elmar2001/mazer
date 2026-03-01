import { OverlayFlag, type Grid } from "@/core/grid";
import type { CellPatch } from "@/core/patches";
import type { SolverPlugin } from "@/core/plugins/SolverPlugin";
import type { AlgorithmStepMeta, SolverRunOptions } from "@/core/plugins/types";
import {
  buildPath,
  getOpenNeighbors,
  manhattan,
} from "@/core/plugins/solvers/helpers";

interface FringeContext {
  grid: Grid;
  startIndex: number;
  goalIndex: number;
  now: number[];
  later: number[];
  listFlags: Uint8Array;
  gScore: Float64Array;
  parents: Int32Array;
  threshold: number;
  nextThreshold: number;
  visitedFlags: Uint8Array;
  visitedCount: number;
  previousFrontierNodes: number[];
  currentIndex: number;
  done: boolean;
  solved: boolean;
  pathLength: number;
}

export const fringeSearchSolver: SolverPlugin<SolverRunOptions, AlgorithmStepMeta> = {
  id: "fringe-search",
  label: "Fringe Search",
  create({ grid, options }) {
    const gScore = new Float64Array(grid.cellCount);
    gScore.fill(Number.POSITIVE_INFINITY);
    gScore[options.startIndex] = 0;

    const parents = new Int32Array(grid.cellCount);
    parents.fill(-1);
    parents[options.startIndex] = options.startIndex;

    const listFlags = new Uint8Array(grid.cellCount);
    listFlags[options.startIndex] = 1;

    const context: FringeContext = {
      grid,
      startIndex: options.startIndex,
      goalIndex: options.goalIndex,
      now: [options.startIndex],
      later: [],
      listFlags,
      gScore,
      parents,
      threshold: manhattan(grid.width, options.startIndex, options.goalIndex),
      nextThreshold: Number.POSITIVE_INFINITY,
      visitedFlags: new Uint8Array(grid.cellCount),
      visitedCount: 0,
      previousFrontierNodes: [],
      currentIndex: -1,
      done: false,
      solved: false,
      pathLength: 0,
    };

    return {
      step: () => stepFringeSearch(context),
    };
  },
};

function stepFringeSearch(context: FringeContext) {
  const patches: CellPatch[] = [];

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

  if (context.done) {
    return {
      done: true,
      patches,
      meta: {
        line: 5,
        visitedCount: context.visitedCount,
        frontierSize: 0,
        solved: context.solved,
        pathLength: context.pathLength,
      },
    };
  }

  if (context.now.length === 0) {
    if (context.later.length === 0 || !Number.isFinite(context.nextThreshold)) {
      context.done = true;
      context.solved = false;
      return {
        done: true,
        patches,
        meta: {
          line: 5,
          visitedCount: context.visitedCount,
          frontierSize: 0,
          solved: false,
        },
      };
    }

    context.threshold = context.nextThreshold;
    context.nextThreshold = Number.POSITIVE_INFINITY;

    context.now = context.later;
    context.later = [];
    for (const node of context.now) {
      context.listFlags[node] = 1;
    }
  }

  const node = context.now.shift() as number;
  if (context.listFlags[node] === 1) {
    context.listFlags[node] = 0;
  }

  context.currentIndex = node;

  const fScore =
    (context.gScore[node] as number) +
    manhattan(context.grid.width, node, context.goalIndex);

  if (fScore > context.threshold) {
    context.later.push(node);
    context.listFlags[node] = 2;

    if (fScore < context.nextThreshold) {
      context.nextThreshold = fScore;
    }
  } else {
    if (context.visitedFlags[node] === 0) {
      context.visitedFlags[node] = 1;
      context.visitedCount += 1;
      patches.push({
        index: node,
        overlaySet: OverlayFlag.Visited,
      });
    }

    if (node === context.goalIndex) {
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
    } else {
      for (const neighbor of getOpenNeighbors(context.grid, node)) {
        const tentative = (context.gScore[node] as number) + 1;
        if (tentative >= (context.gScore[neighbor] as number)) {
          continue;
        }

        context.gScore[neighbor] = tentative;
        context.parents[neighbor] = node;

        if (context.listFlags[neighbor] === 0) {
          context.now.unshift(neighbor);
          context.listFlags[neighbor] = 1;
          continue;
        }

        if (context.listFlags[neighbor] === 2) {
          removeFromArray(context.later, neighbor);
          context.now.unshift(neighbor);
          context.listFlags[neighbor] = 1;
        }
      }
    }
  }

  for (const frontier of context.now) {
    patches.push({
      index: frontier,
      overlaySet: OverlayFlag.Frontier,
    });
    context.previousFrontierNodes.push(frontier);
  }

  patches.push({
    index: node,
    overlaySet: OverlayFlag.Current,
  });

  return {
    done: context.done,
    patches,
    meta: {
      line: context.done ? 4 : 3,
      visitedCount: context.visitedCount,
      frontierSize: context.now.length + context.later.length,
      solved: context.solved,
      pathLength: context.pathLength,
    },
  };
}

function removeFromArray(items: number[], value: number): void {
  const index = items.indexOf(value);
  if (index !== -1) {
    items.splice(index, 1);
  }
}
