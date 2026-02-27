import { OverlayFlag, WallFlag, type Grid } from "@/core/grid";
import type { CellPatch } from "@/core/patches";
import type { SolverPlugin } from "@/core/plugins/SolverPlugin";
import type { AlgorithmStepMeta, SolverRunOptions } from "@/core/plugins/types";
import { buildPath } from "@/core/plugins/solvers/helpers";

const DIRS = [
  { dx: 0, dy: -1, wall: WallFlag.North },
  { dx: 1, dy: 0, wall: WallFlag.East },
  { dx: 0, dy: 1, wall: WallFlag.South },
  { dx: -1, dy: 0, wall: WallFlag.West },
] as const;

interface WallFollowerContext {
  grid: Grid;
  startIndex: number;
  goalIndex: number;
  started: boolean;
  current: number;
  heading: number;
  parents: Int32Array;
  discovered: Uint8Array;
  seenStates: Uint8Array;
  visitedCount: number;
}

export const wallFollowerSolver: SolverPlugin<
  SolverRunOptions,
  AlgorithmStepMeta
> = {
  id: "wall-follower",
  label: "Wall Follower (Right-Hand)",
  create({ grid, options }) {
    const parents = new Int32Array(grid.cellCount);
    parents.fill(-1);

    const context: WallFollowerContext = {
      grid,
      startIndex: options.startIndex,
      goalIndex: options.goalIndex,
      started: false,
      current: options.startIndex,
      heading: 1,
      parents,
      discovered: new Uint8Array(grid.cellCount),
      seenStates: new Uint8Array(grid.cellCount * 4),
      visitedCount: 0,
    };

    return {
      step: () => stepWallFollower(context),
    };
  },
};

function stepWallFollower(context: WallFollowerContext) {
  const patches: CellPatch[] = [];

  if (!context.started) {
    context.started = true;
    context.discovered[context.startIndex] = 1;
    context.parents[context.startIndex] = context.startIndex;
    context.seenStates[stateKey(context.startIndex, context.heading)] = 1;
    context.visitedCount = 1;

    patches.push({
      index: context.startIndex,
      overlaySet: OverlayFlag.Visited | OverlayFlag.Current | OverlayFlag.Frontier,
    });

    if (context.startIndex === context.goalIndex) {
      patches.push({
        index: context.startIndex,
        overlaySet: OverlayFlag.Path,
        overlayClear: OverlayFlag.Current | OverlayFlag.Frontier,
      });

      return {
        done: true,
        patches,
        meta: {
          line: 1,
          solved: true,
          pathLength: 1,
          visitedCount: context.visitedCount,
          frontierSize: 0,
        },
      };
    }

    return {
      done: false,
      patches,
      meta: {
        line: 1,
        visitedCount: context.visitedCount,
        frontierSize: 1,
      },
    };
  }

  patches.push({
    index: context.current,
    overlayClear: OverlayFlag.Current | OverlayFlag.Frontier,
  });

  if (context.current === context.goalIndex) {
    const path = buildPath(context.startIndex, context.goalIndex, context.parents);
    for (const index of path) {
      patches.push({ index, overlaySet: OverlayFlag.Path });
    }

    return {
      done: true,
      patches,
      meta: {
        line: 2,
        solved: true,
        pathLength: path.length,
        visitedCount: context.visitedCount,
        frontierSize: 0,
      },
    };
  }

  const next = pickNextStep(context);
  context.heading = next.direction;
  context.current = next.index;
  const nextState = stateKey(context.current, context.heading);

  if (context.discovered[next.index] === 0) {
    context.discovered[next.index] = 1;
    context.parents[next.index] = next.from;
    context.visitedCount += 1;
  }

  patches.push({
    index: next.index,
    overlaySet: OverlayFlag.Visited | OverlayFlag.Current | OverlayFlag.Frontier,
  });

  if (context.current === context.goalIndex) {
    const path = buildPath(context.startIndex, context.goalIndex, context.parents);
    for (const index of path) {
      patches.push({ index, overlaySet: OverlayFlag.Path });
    }

    patches.push({
      index: context.current,
      overlayClear: OverlayFlag.Current | OverlayFlag.Frontier,
    });

    return {
      done: true,
      patches,
      meta: {
        line: 4,
        solved: true,
        pathLength: path.length,
        visitedCount: context.visitedCount,
        frontierSize: 0,
      },
    };
  }

  if (context.seenStates[nextState] === 1) {
    patches.push({
      index: context.current,
      overlayClear: OverlayFlag.Current | OverlayFlag.Frontier,
    });

    return {
      done: true,
      patches,
      meta: {
        line: 5,
        solved: false,
        visitedCount: context.visitedCount,
        frontierSize: 0,
      },
    };
  }

  context.seenStates[nextState] = 1;

  return {
    done: false,
    patches,
    meta: {
      line: 3,
      visitedCount: context.visitedCount,
      frontierSize: 1,
    },
  };
}

function stateKey(index: number, heading: number): number {
  return index * 4 + heading;
}

function pickNextStep(context: WallFollowerContext): {
  from: number;
  index: number;
  direction: number;
} {
  const priority = [
    (context.heading + 1) % 4,
    context.heading,
    (context.heading + 3) % 4,
    (context.heading + 2) % 4,
  ];

  for (const direction of priority) {
    const candidate = neighborForDirection(context.grid, context.current, direction);
    if (!candidate) {
      continue;
    }

    if ((context.grid.walls[context.current] & candidate.wall) !== 0) {
      continue;
    }

    return {
      from: context.current,
      index: candidate.index,
      direction,
    };
  }

  return {
    from: context.current,
    index: context.current,
    direction: context.heading,
  };
}

function neighborForDirection(
  grid: Grid,
  index: number,
  direction: number,
): { index: number; wall: WallFlag } | null {
  const x = index % grid.width;
  const y = Math.floor(index / grid.width);

  const move = DIRS[direction] as (typeof DIRS)[number];
  const nx = x + move.dx;
  const ny = y + move.dy;

  if (nx < 0 || nx >= grid.width || ny < 0 || ny >= grid.height) {
    return null;
  }

  return {
    index: ny * grid.width + nx,
    wall: move.wall,
  };
}
