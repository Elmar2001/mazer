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

interface PledgeContext {
  grid: Grid;
  startIndex: number;
  goalIndex: number;
  started: boolean;
  current: number;
  heading: number;
  preferredHeading: number;
  followingWall: boolean;
  turnBalance: number;
  parents: Int32Array;
  discovered: Uint8Array;
  visited: Uint8Array;
  visitedCount: number;
}

export const pledgeSolver: SolverPlugin<SolverRunOptions, AlgorithmStepMeta> = {
  id: "pledge",
  label: "Pledge Algorithm (Wall Follower Extension)",
  tier: "alias",
  implementationKind: "alias",
  aliasOf: "wall-follower",
  create({ grid, options }) {
    const parents = new Int32Array(grid.cellCount);
    parents.fill(-1);

    const preferredHeading = pickPreferredHeading(
      grid,
      options.startIndex,
      options.goalIndex,
    );

    const context: PledgeContext = {
      grid,
      startIndex: options.startIndex,
      goalIndex: options.goalIndex,
      started: false,
      current: options.startIndex,
      heading: preferredHeading,
      preferredHeading,
      followingWall: false,
      turnBalance: 0,
      parents,
      discovered: new Uint8Array(grid.cellCount),
      visited: new Uint8Array(grid.cellCount),
      visitedCount: 0,
    };

    return {
      step: () => stepPledge(context),
    };
  },
};

function stepPledge(context: PledgeContext) {
  const patches: CellPatch[] = [];

  if (!context.started) {
    context.started = true;
    context.parents[context.startIndex] = context.startIndex;
    context.discovered[context.startIndex] = 1;
    context.visited[context.startIndex] = 1;
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
        line: 5,
        solved: true,
        pathLength: path.length,
        visitedCount: context.visitedCount,
        frontierSize: 0,
      },
    };
  }

  let line = 2;
  let nextMove: { index: number; direction: number } | null = null;

  if (!context.followingWall) {
    nextMove = tryMove(context.grid, context.current, context.preferredHeading);
  }

  if (!nextMove) {
    if (!context.followingWall) {
      context.followingWall = true;
      context.turnBalance = 0;
    }

    nextMove = pickWallFollowingMove(context);
    line = 3;
  }

  if (!nextMove) {
    return {
      done: true,
      patches,
      meta: {
        line: 6,
        solved: false,
        visitedCount: context.visitedCount,
        frontierSize: 0,
      },
    };
  }

  if (context.followingWall) {
    context.turnBalance += turnDelta(context.heading, nextMove.direction);
    context.heading = nextMove.direction;

    if (
      context.heading === context.preferredHeading &&
      context.turnBalance === 0
    ) {
      context.followingWall = false;
      line = 4;
    }
  } else {
    context.heading = nextMove.direction;
  }

  const previous = context.current;
  const next = nextMove.index;
  context.current = next;

  if (context.discovered[next] === 0) {
    context.discovered[next] = 1;
    context.parents[next] = previous;
  }

  if (context.visited[next] === 0) {
    context.visited[next] = 1;
    context.visitedCount += 1;
  }

  patches.push({
    index: next,
    overlaySet: OverlayFlag.Visited | OverlayFlag.Current | OverlayFlag.Frontier,
  });

  if (next === context.goalIndex) {
    const path = buildPath(context.startIndex, context.goalIndex, context.parents);
    for (const index of path) {
      patches.push({
        index,
        overlaySet: OverlayFlag.Path,
      });
    }

    patches.push({
      index: next,
      overlayClear: OverlayFlag.Current | OverlayFlag.Frontier,
    });

    return {
      done: true,
      patches,
      meta: {
        line: 5,
        solved: true,
        pathLength: path.length,
        visitedCount: context.visitedCount,
        frontierSize: 0,
      },
    };
  }

  return {
    done: false,
    patches,
    meta: {
      line,
      visitedCount: context.visitedCount,
      frontierSize: 1,
    },
  };
}

function pickWallFollowingMove(context: PledgeContext) {
  const priority = [
    (context.heading + 1) % 4,
    context.heading,
    (context.heading + 3) % 4,
    (context.heading + 2) % 4,
  ];

  for (const direction of priority) {
    const move = tryMove(context.grid, context.current, direction);
    if (move) {
      return move;
    }
  }

  return null;
}

function tryMove(grid: Grid, index: number, direction: number) {
  const neighbor = neighborForDirection(grid, index, direction);
  if (!neighbor) {
    return null;
  }

  if ((grid.walls[index] & neighbor.wall) !== 0) {
    return null;
  }

  return {
    index: neighbor.index,
    direction,
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

function turnDelta(fromDirection: number, toDirection: number): number {
  const clockwiseTurns = (toDirection - fromDirection + 4) % 4;
  if (clockwiseTurns === 0) {
    return 0;
  }

  if (clockwiseTurns === 1) {
    return 1;
  }

  if (clockwiseTurns === 2) {
    return 2;
  }

  return -1;
}

function pickPreferredHeading(
  grid: Grid,
  startIndex: number,
  goalIndex: number,
): number {
  const sx = startIndex % grid.width;
  const sy = Math.floor(startIndex / grid.width);
  const gx = goalIndex % grid.width;
  const gy = Math.floor(goalIndex / grid.width);

  const dx = gx - sx;
  const dy = gy - sy;

  if (Math.abs(dx) >= Math.abs(dy)) {
    if (dx > 0) {
      return 1;
    }

    if (dx < 0) {
      return 3;
    }
  }

  if (dy > 0) {
    return 2;
  }

  if (dy < 0) {
    return 0;
  }

  return 1;
}
