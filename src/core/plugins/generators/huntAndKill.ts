import { carvePatch, neighbors, OverlayFlag, type Grid } from "@/core/grid";
import type { CellPatch } from "@/core/patches";
import type { GeneratorPlugin } from "@/core/plugins/GeneratorPlugin";
import type {
  AlgorithmStepMeta,
  GeneratorRunOptions,
} from "@/core/plugins/types";
import type { RandomSource } from "@/core/rng";

interface HuntAndKillContext {
  grid: Grid;
  rng: RandomSource;
  started: boolean;
  current: number;
  scanCursor: number;
  visited: Uint8Array;
  visitedCount: number;
}

export const huntAndKillGenerator: GeneratorPlugin<
  GeneratorRunOptions,
  AlgorithmStepMeta
> = {
  id: "hunt-and-kill",
  label: "Hunt-and-Kill",
  create({ grid, rng }) {
    const start = rng.nextInt(grid.cellCount);

    const context: HuntAndKillContext = {
      grid,
      rng,
      started: false,
      current: start,
      scanCursor: 0,
      visited: new Uint8Array(grid.cellCount),
      visitedCount: 0,
    };

    return {
      step: () => stepHuntAndKill(context),
    };
  },
};

function stepHuntAndKill(context: HuntAndKillContext) {
  const patches: CellPatch[] = [];

  if (!context.started) {
    context.started = true;
    context.visited[context.current] = 1;
    context.visitedCount = 1;

    patches.push({
      index: context.current,
      overlaySet: OverlayFlag.Visited | OverlayFlag.Current,
    });

    if (context.grid.cellCount === 1) {
      patches.push({
        index: context.current,
        overlayClear: OverlayFlag.Current,
      });

      return {
        done: true,
        patches,
        meta: {
          visitedCount: context.visitedCount,
          frontierSize: 0,
        },
      };
    }

    return {
      done: false,
      patches,
      meta: {
        visitedCount: context.visitedCount,
        frontierSize: 1,
      },
    };
  }

  patches.push({
    index: context.current,
    overlayClear: OverlayFlag.Current,
  });

  if (context.visitedCount >= context.grid.cellCount) {
    return {
      done: true,
      patches,
      meta: {
        visitedCount: context.visitedCount,
        frontierSize: 0,
      },
    };
  }

  const walkChoices = neighbors(context.grid, context.current).filter(
    (neighbor) => context.visited[neighbor.index] === 0,
  );

  if (walkChoices.length > 0) {
    const pick = walkChoices[context.rng.nextInt(walkChoices.length)]!;

    context.visited[pick.index] = 1;
    context.visitedCount += 1;

    patches.push(
      ...carvePatch(
        context.current,
        pick.index,
        pick.direction.wall,
        pick.direction.opposite,
      ),
    );

    context.current = pick.index;
    patches.push({
      index: context.current,
      overlaySet: OverlayFlag.Visited | OverlayFlag.Current,
    });

    return {
      done: false,
      patches,
      meta: {
        visitedCount: context.visitedCount,
        frontierSize: 1,
      },
    };
  }

  for (let offset = 0; offset < context.grid.cellCount; offset += 1) {
    const candidate = (context.scanCursor + offset) % context.grid.cellCount;

    if (context.visited[candidate] === 1) {
      continue;
    }

    const visitedNeighbors = neighbors(context.grid, candidate).filter(
      (neighbor) => context.visited[neighbor.index] === 1,
    );

    if (visitedNeighbors.length === 0) {
      continue;
    }

    const join = visitedNeighbors[context.rng.nextInt(visitedNeighbors.length)]!;

    context.visited[candidate] = 1;
    context.visitedCount += 1;
    context.current = candidate;
    context.scanCursor = candidate + 1;

    patches.push(
      ...carvePatch(
        candidate,
        join.index,
        join.direction.wall,
        join.direction.opposite,
      ),
    );
    patches.push({
      index: candidate,
      overlaySet: OverlayFlag.Visited | OverlayFlag.Current,
    });

    return {
      done: false,
      patches,
      meta: {
        visitedCount: context.visitedCount,
        frontierSize: 1,
      },
    };
  }

  return {
    done: true,
    patches,
    meta: {
      visitedCount: context.visitedCount,
      frontierSize: 0,
    },
  };
}
