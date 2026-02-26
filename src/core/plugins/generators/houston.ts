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

type HoustonPhase = "ab" | "wilson";

interface HoustonContext {
  grid: Grid;
  rng: RandomSource;
  started: boolean;
  phase: HoustonPhase;
  inTree: Uint8Array;
  unvisitedList: number[];
  unvisitedPos: Int32Array;
  visitedCount: number;
  targetVisited: number;
  abCurrent: number;
  walkPath: number[];
  walkPos: Int32Array;
  current: number;
}

export const houstonGenerator: GeneratorPlugin<
  GeneratorRunOptions,
  AlgorithmStepMeta
> = {
  id: "houston",
  label: "Houston (AB + Wilson)",
  implementationKind: "hybrid",
  create({ grid, rng }) {
    const root = rng.nextInt(grid.cellCount);

    const inTree = new Uint8Array(grid.cellCount);
    inTree[root] = 1;

    const unvisitedList: number[] = [];
    const unvisitedPos = new Int32Array(grid.cellCount);
    unvisitedPos.fill(-1);

    for (let i = 0; i < grid.cellCount; i += 1) {
      if (i === root) {
        continue;
      }

      unvisitedPos[i] = unvisitedList.length;
      unvisitedList.push(i);
    }

    const walkPos = new Int32Array(grid.cellCount);
    walkPos.fill(-1);

    const targetVisited = Math.max(2, Math.floor(grid.cellCount * 0.3));

    const context: HoustonContext = {
      grid,
      rng,
      started: false,
      phase: "ab",
      inTree,
      unvisitedList,
      unvisitedPos,
      visitedCount: 1,
      targetVisited: Math.min(targetVisited, Math.max(1, grid.cellCount - 1)),
      abCurrent: root,
      walkPath: [],
      walkPos,
      current: -1,
    };

    return {
      step: () => stepHouston(context, root),
    };
  },
};

function stepHouston(context: HoustonContext, root: number) {
  const patches: CellPatch[] = [];

  if (!context.started) {
    context.started = true;
    context.current = root;

    patches.push({
      index: root,
      overlaySet: OverlayFlag.Visited | OverlayFlag.Current,
    });

    return {
      done: context.grid.cellCount === 1,
      patches,
      meta: {
        line: 1,
        visitedCount: context.visitedCount,
        frontierSize: 1,
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

  if (context.visitedCount >= context.grid.cellCount) {
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

  if (context.phase === "ab" && context.visitedCount < context.targetVisited) {
    const from = context.abCurrent;
    const options = neighbors(context.grid, from);
    const pick = options[context.rng.nextInt(options.length)]!;

    if (context.inTree[pick.index] === 0) {
      context.inTree[pick.index] = 1;
      context.visitedCount += 1;
      removeUnvisited(context, pick.index);

      patches.push(
        ...carvePatch(from, pick.index, pick.direction.wall, pick.direction.opposite),
      );
      patches.push({
        index: pick.index,
        overlaySet: OverlayFlag.Visited,
      });
    }

    context.abCurrent = pick.index;
    context.current = pick.index;

    patches.push({
      index: pick.index,
      overlaySet: OverlayFlag.Current,
    });

    return {
      done: false,
      patches,
      meta: {
        line: 2,
        visitedCount: context.visitedCount,
        frontierSize: 1,
      },
    };
  }

  context.phase = "wilson";

  if (context.walkPath.length === 0) {
    if (context.unvisitedList.length === 0) {
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

    const startPos = context.rng.nextInt(context.unvisitedList.length);
    const start = context.unvisitedList[startPos] as number;

    context.walkPath.push(start);
    context.walkPos[start] = 0;
    context.current = start;

    patches.push({
      index: start,
      overlaySet: OverlayFlag.Frontier | OverlayFlag.Current,
    });

    return {
      done: false,
      patches,
      meta: {
        line: 4,
        visitedCount: context.visitedCount,
        frontierSize: context.walkPath.length,
      },
    };
  }

  const from = context.walkPath[context.walkPath.length - 1] as number;
  const options = neighbors(context.grid, from);
  const pick = options[context.rng.nextInt(options.length)]!;
  const to = pick.index;

  if (context.inTree[to] === 1) {
    const fullPath = context.walkPath.concat(to);

    for (let i = 0; i < fullPath.length - 1; i += 1) {
      const a = fullPath[i] as number;
      const b = fullPath[i + 1] as number;
      patches.push(...carveBetween(context.grid, a, b));
    }

    for (const node of context.walkPath) {
      context.walkPos[node] = -1;

      if (context.inTree[node] === 0) {
        context.inTree[node] = 1;
        context.visitedCount += 1;
        removeUnvisited(context, node);
      }

      patches.push({
        index: node,
        overlaySet: OverlayFlag.Visited,
        overlayClear: OverlayFlag.Frontier | OverlayFlag.Current,
      });
    }

    context.walkPath.length = 0;

    return {
      done: context.visitedCount >= context.grid.cellCount,
      patches,
      meta: {
        line: 5,
        visitedCount: context.visitedCount,
        frontierSize: 0,
      },
    };
  }

  const seen = context.walkPos[to] as number;
  if (seen !== -1) {
    const removeFrom = seen + 1;
    const removed = context.walkPath.splice(removeFrom);

    for (const node of removed) {
      context.walkPos[node] = -1;
      patches.push({
        index: node,
        overlayClear: OverlayFlag.Frontier | OverlayFlag.Current,
      });
    }

    const keep = context.walkPath[context.walkPath.length - 1] as number;
    context.current = keep;
    patches.push({
      index: keep,
      overlaySet: OverlayFlag.Current,
    });

    return {
      done: false,
      patches,
      meta: {
        line: 5,
        visitedCount: context.visitedCount,
        frontierSize: context.walkPath.length,
      },
    };
  }

  context.walkPos[to] = context.walkPath.length;
  context.walkPath.push(to);
  context.current = to;

  patches.push({
    index: to,
    overlaySet: OverlayFlag.Frontier | OverlayFlag.Current,
  });

  return {
    done: false,
    patches,
    meta: {
      line: 5,
      visitedCount: context.visitedCount,
      frontierSize: context.walkPath.length,
    },
  };
}

function carveBetween(grid: Grid, a: number, b: number): CellPatch[] {
  const ax = a % grid.width;
  const ay = Math.floor(a / grid.width);
  const bx = b % grid.width;
  const by = Math.floor(b / grid.width);

  if (bx === ax + 1 && by === ay) {
    return carvePatch(a, b, WallFlag.East, WallFlag.West);
  }

  if (bx === ax - 1 && by === ay) {
    return carvePatch(a, b, WallFlag.West, WallFlag.East);
  }

  if (by === ay + 1 && bx === ax) {
    return carvePatch(a, b, WallFlag.South, WallFlag.North);
  }

  if (by === ay - 1 && bx === ax) {
    return carvePatch(a, b, WallFlag.North, WallFlag.South);
  }

  throw new Error("Houston walk produced non-adjacent nodes.");
}

function removeUnvisited(context: HoustonContext, index: number): void {
  const pos = context.unvisitedPos[index] as number;
  if (pos < 0) {
    return;
  }

  const lastPos = context.unvisitedList.length - 1;
  const last = context.unvisitedList[lastPos] as number;

  context.unvisitedList[pos] = last;
  context.unvisitedPos[last] = pos;
  context.unvisitedList.pop();
  context.unvisitedPos[index] = -1;
}
