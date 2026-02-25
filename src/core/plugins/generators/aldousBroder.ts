import { carvePatch, neighbors, OverlayFlag, type Grid } from "@/core/grid";
import type { CellPatch } from "@/core/patches";
import type { GeneratorPlugin } from "@/core/plugins/GeneratorPlugin";
import type {
  AlgorithmStepMeta,
  GeneratorRunOptions,
} from "@/core/plugins/types";
import type { RandomSource } from "@/core/rng";

interface AldousBroderContext {
  grid: Grid;
  rng: RandomSource;
  started: boolean;
  current: number;
  visited: Uint8Array;
  visitedCount: number;
}

export const aldousBroderGenerator: GeneratorPlugin<
  GeneratorRunOptions,
  AlgorithmStepMeta
> = {
  id: "aldous-broder",
  label: "Aldous-Broder",
  create({ grid, rng }) {
    const start = rng.nextInt(grid.cellCount);

    const context: AldousBroderContext = {
      grid,
      rng,
      started: false,
      current: start,
      visited: new Uint8Array(grid.cellCount),
      visitedCount: 0,
    };

    return {
      step: () => stepAldousBroder(context),
    };
  },
};

function stepAldousBroder(context: AldousBroderContext) {
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

  const candidates = neighbors(context.grid, context.current);
  const pick = candidates[context.rng.nextInt(candidates.length)]!;

  if (context.visited[pick.index] === 0) {
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

    patches.push({
      index: pick.index,
      overlaySet: OverlayFlag.Visited,
    });
  }

  context.current = pick.index;

  const done = context.visitedCount >= context.grid.cellCount;
  if (!done) {
    patches.push({
      index: context.current,
      overlaySet: OverlayFlag.Current,
    });
  }

  return {
    done,
    patches,
    meta: {
      visitedCount: context.visitedCount,
      frontierSize: done ? 0 : 1,
    },
  };
}
