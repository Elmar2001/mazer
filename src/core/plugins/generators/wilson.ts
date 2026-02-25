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

interface WilsonContext {
  grid: Grid;
  rng: RandomSource;
  inTree: Uint8Array;
  unvisitedList: number[];
  unvisitedPos: Int32Array;
  walkPath: number[];
  walkPos: Int32Array;
  current: number;
  visitedCount: number;
}

export const wilsonGenerator: GeneratorPlugin<
  GeneratorRunOptions,
  AlgorithmStepMeta
> = {
  id: "wilson",
  label: "Wilson",
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

    const context: WilsonContext = {
      grid,
      rng,
      inTree,
      unvisitedList,
      unvisitedPos,
      walkPath: [],
      walkPos: new Int32Array(grid.cellCount),
      current: -1,
      visitedCount: 1,
    };

    context.walkPos.fill(-1);

    return {
      step: () => stepWilson(context, root),
    };
  },
};

function stepWilson(context: WilsonContext, root: number) {
  const patches: CellPatch[] = [];

  if (context.visitedCount === 1 && context.walkPath.length === 0 && context.current === -1) {
    patches.push({
      index: root,
      overlaySet: OverlayFlag.Visited,
    });
  }

  if (context.current !== -1) {
    patches.push({
      index: context.current,
      overlayClear: OverlayFlag.Current,
    });
    context.current = -1;
  }

  if (context.unvisitedList.length === 0 && context.walkPath.length === 0) {
    return {
      done: true,
      patches,
      meta: {
        visitedCount: context.visitedCount,
        frontierSize: 0,
      },
    };
  }

  if (context.walkPath.length === 0) {
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
        visitedCount: context.visitedCount,
        frontierSize: context.walkPath.length,
      },
    };
  }

  const from = context.walkPath[context.walkPath.length - 1] as number;
  const choices = neighbors(context.grid, from);
  const pick = choices[context.rng.nextInt(choices.length)]!;
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
      done: context.unvisitedList.length === 0,
      patches,
      meta: {
        visitedCount: context.visitedCount,
        frontierSize: 0,
      },
    };
  }

  const seenPos = context.walkPos[to] as number;
  if (seenPos !== -1) {
    const removeStart = seenPos + 1;
    const removed = context.walkPath.splice(removeStart);

    for (const node of removed) {
      context.walkPos[node] = -1;
      patches.push({
        index: node,
        overlayClear: OverlayFlag.Frontier | OverlayFlag.Current,
      });
    }

    const current = context.walkPath[context.walkPath.length - 1] as number;
    context.current = current;
    patches.push({
      index: current,
      overlaySet: OverlayFlag.Current,
    });

    return {
      done: false,
      patches,
      meta: {
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

  throw new Error("Wilson path contains non-adjacent cells.");
}

function removeUnvisited(context: WilsonContext, index: number): void {
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
