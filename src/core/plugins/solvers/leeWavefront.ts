import { OverlayFlag, type Grid } from "@/core/grid";
import type { CellPatch } from "@/core/patches";
import type { SolverPlugin } from "@/core/plugins/SolverPlugin";
import type { AlgorithmStepMeta, SolverRunOptions } from "@/core/plugins/types";
import { getOpenNeighbors } from "@/core/plugins/solvers/helpers";

type LeePhase = "wave" | "trace";

interface LeeContext {
  grid: Grid;
  startIndex: number;
  goalIndex: number;
  started: boolean;
  phase: LeePhase;
  queue: number[];
  head: number;
  frontierFlags: Uint8Array;
  waveVisited: Uint8Array;
  dist: Int32Array;
  current: number;
  traceCurrent: number;
  visitedCount: number;
  frontierSize: number;
  pathLength: number;
}

export const leeWavefrontSolver: SolverPlugin<SolverRunOptions, AlgorithmStepMeta> = {
  id: "lee-wavefront",
  label: "Lee Wavefront",
  create({ grid, options }) {
    const dist = new Int32Array(grid.cellCount);
    dist.fill(-1);

    const context: LeeContext = {
      grid,
      startIndex: options.startIndex,
      goalIndex: options.goalIndex,
      started: false,
      phase: "wave",
      queue: [],
      head: 0,
      frontierFlags: new Uint8Array(grid.cellCount),
      waveVisited: new Uint8Array(grid.cellCount),
      dist,
      current: -1,
      traceCurrent: -1,
      visitedCount: 0,
      frontierSize: 0,
      pathLength: 0,
    };

    return {
      step: () => stepLee(context),
    };
  },
};

function stepLee(context: LeeContext) {
  const patches: CellPatch[] = [];

  if (!context.started) {
    context.started = true;

    if (context.startIndex === context.goalIndex) {
      patches.push({
        index: context.startIndex,
        overlaySet: OverlayFlag.Visited | OverlayFlag.Path,
      });

      return {
        done: true,
        patches,
        meta: {
          solved: true,
          pathLength: 1,
          visitedCount: 1,
          frontierSize: 0,
        },
      };
    }

    context.queue.push(context.goalIndex);
    context.frontierFlags[context.goalIndex] = 1;
    context.dist[context.goalIndex] = 0;
    context.frontierSize = 1;

    patches.push({
      index: context.goalIndex,
      overlaySet: OverlayFlag.Frontier,
    });

    return {
      done: false,
      patches,
      meta: {
        visitedCount: context.visitedCount,
        frontierSize: context.frontierSize,
      },
    };
  }

  if (context.current !== -1) {
    patches.push({
      index: context.current,
      overlayClear: OverlayFlag.Current,
    });
    context.current = -1;
  }

  if (context.phase === "wave") {
    if (context.head >= context.queue.length) {
      if (context.dist[context.startIndex] === -1) {
        return {
          done: true,
          patches,
          meta: {
            solved: false,
            visitedCount: context.visitedCount,
            frontierSize: 0,
          },
        };
      }

      startTrace(context, patches);
      return {
        done: false,
        patches,
        meta: {
          solved: false,
          pathLength: context.pathLength,
          visitedCount: context.visitedCount,
          frontierSize: context.frontierSize,
        },
      };
    }

    const node = context.queue[context.head] as number;
    context.head += 1;
    context.current = node;

    if (context.frontierFlags[node] === 1) {
      context.frontierFlags[node] = 0;
      context.frontierSize = Math.max(0, context.frontierSize - 1);
      patches.push({
        index: node,
        overlayClear: OverlayFlag.Frontier,
      });
    }

    if (context.waveVisited[node] === 0) {
      context.waveVisited[node] = 1;
      context.visitedCount += 1;
      patches.push({
        index: node,
        overlaySet: OverlayFlag.Visited | OverlayFlag.Current,
      });
    } else {
      patches.push({
        index: node,
        overlaySet: OverlayFlag.Current,
      });
    }

    for (const neighbor of getOpenNeighbors(context.grid, node)) {
      if (context.dist[neighbor] !== -1) {
        continue;
      }

      context.dist[neighbor] = (context.dist[node] as number) + 1;
      context.queue.push(neighbor);

      if (context.frontierFlags[neighbor] === 0) {
        context.frontierFlags[neighbor] = 1;
        context.frontierSize += 1;
        patches.push({
          index: neighbor,
          overlaySet: OverlayFlag.Frontier,
        });
      }
    }

    if (context.dist[context.startIndex] !== -1) {
      startTrace(context, patches);
    }

    return {
      done: false,
      patches,
      meta: {
        visitedCount: context.visitedCount,
        frontierSize: context.frontierSize,
        pathLength: context.pathLength,
      },
    };
  }

  if (context.traceCurrent === context.goalIndex) {
    patches.push({
      index: context.goalIndex,
      overlayClear: OverlayFlag.Current | OverlayFlag.Frontier,
    });

    return {
      done: true,
      patches,
      meta: {
        solved: true,
        pathLength: context.pathLength,
        visitedCount: context.visitedCount,
        frontierSize: 0,
      },
    };
  }

  const next = nextTraceStep(context);
  if (next === -1) {
    return {
      done: true,
      patches,
      meta: {
        solved: false,
        pathLength: context.pathLength,
        visitedCount: context.visitedCount,
        frontierSize: context.frontierSize,
      },
    };
  }

  patches.push({
    index: context.traceCurrent,
    overlayClear: OverlayFlag.Current | OverlayFlag.Frontier,
  });

  context.traceCurrent = next;
  context.current = next;
  context.pathLength += 1;

  if (context.waveVisited[next] === 0) {
    context.waveVisited[next] = 1;
    context.visitedCount += 1;
  }

  patches.push({
    index: next,
    overlaySet: OverlayFlag.Path | OverlayFlag.Current | OverlayFlag.Visited,
    overlayClear: OverlayFlag.Frontier,
  });

  return {
    done: false,
    patches,
    meta: {
      solved: false,
      pathLength: context.pathLength,
      visitedCount: context.visitedCount,
      frontierSize: context.frontierSize,
    },
  };
}

function startTrace(context: LeeContext, patches: CellPatch[]): void {
  context.phase = "trace";
  clearRemainingFrontier(context, patches);

  context.traceCurrent = context.startIndex;
  context.current = context.startIndex;
  context.pathLength = 1;

  if (context.waveVisited[context.startIndex] === 0) {
    context.waveVisited[context.startIndex] = 1;
    context.visitedCount += 1;
  }

  patches.push({
    index: context.startIndex,
    overlaySet: OverlayFlag.Path | OverlayFlag.Current | OverlayFlag.Visited,
    overlayClear: OverlayFlag.Frontier,
  });
}

function clearRemainingFrontier(context: LeeContext, patches: CellPatch[]): void {
  for (let i = 0; i < context.frontierFlags.length; i += 1) {
    if (context.frontierFlags[i] === 0) {
      continue;
    }

    context.frontierFlags[i] = 0;
    patches.push({
      index: i,
      overlayClear: OverlayFlag.Frontier,
    });
  }

  context.frontierSize = 0;
}

function nextTraceStep(context: LeeContext): number {
  const current = context.traceCurrent;
  const currentDist = context.dist[current] as number;

  let best = -1;
  let bestDist = currentDist;

  for (const neighbor of getOpenNeighbors(context.grid, current)) {
    const d = context.dist[neighbor] as number;
    if (d < 0 || d >= bestDist) {
      continue;
    }

    best = neighbor;
    bestDist = d;
  }

  return best;
}
