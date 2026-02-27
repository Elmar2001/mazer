import {
  CrossingKind,
  OverlayFlag,
  WallFlag,
  type Grid,
} from "@/core/grid";
import type { CellPatch } from "@/core/patches";
import type { GeneratorPlugin, GeneratorStepper } from "@/core/plugins/GeneratorPlugin";
import { growingTreeGenerator } from "@/core/plugins/generators/growingTree";
import type {
  AlgorithmStepMeta,
  GeneratorRunOptions,
} from "@/core/plugins/types";
import type { RandomSource } from "@/core/rng";

interface WeaveContext {
  grid: Grid;
  rng: RandomSource;
  phase: "base" | "weave";
  baseStepper: GeneratorStepper<AlgorithmStepMeta>;
  candidates: number[];
  cursor: number;
  targetCrossings: number;
  createdCrossings: number;
  current: number;
}

export const weaveGrowingTreeGenerator: GeneratorPlugin<
  GeneratorRunOptions,
  AlgorithmStepMeta
> = {
  id: "weave-growing-tree",
  label: "Weave Growing Tree",
  implementationKind: "hybrid",
  create({ grid, rng, options }) {
    const baseStepper = growingTreeGenerator.create({
      grid,
      rng,
      options,
    });

    const context: WeaveContext = {
      grid,
      rng,
      phase: "base",
      baseStepper,
      candidates: [],
      cursor: 0,
      targetCrossings: Math.max(1, Math.floor(grid.cellCount * 0.015)),
      createdCrossings: 0,
      current: -1,
    };

    return {
      step: () => stepWeave(context),
    };
  },
};

function stepWeave(context: WeaveContext) {
  const patches: CellPatch[] = [];

  if (context.current !== -1) {
    patches.push({
      index: context.current,
      overlayClear: OverlayFlag.Current,
    });
    context.current = -1;
  }

  if (context.phase === "base") {
    const base = context.baseStepper.step();
    patches.push(...base.patches);

    if (!base.done) {
      return {
        done: false,
        patches,
        meta: {
          ...(base.meta ?? {}),
          line: 1,
        },
      };
    }

    context.phase = "weave";
    context.candidates = collectInteriorCells(context.grid);
    shuffle(context.candidates, context.rng);
    context.cursor = 0;

    return {
      done: false,
      patches,
      meta: {
        line: 2,
        visitedCount: context.grid.cellCount,
        frontierSize: context.candidates.length,
      },
    };
  }

  while (context.cursor < context.candidates.length) {
    const index = context.candidates[context.cursor] as number;
    context.cursor += 1;

    if (context.grid.crossings[index] !== CrossingKind.None) {
      continue;
    }

    const walls = context.grid.walls[index] as number;
    const horizontal =
      isOpen(walls, WallFlag.East) &&
      isOpen(walls, WallFlag.West) &&
      !isOpen(walls, WallFlag.North) &&
      !isOpen(walls, WallFlag.South);
    const vertical =
      isOpen(walls, WallFlag.North) &&
      isOpen(walls, WallFlag.South) &&
      !isOpen(walls, WallFlag.East) &&
      !isOpen(walls, WallFlag.West);

    if (!horizontal && !vertical) {
      continue;
    }

    if (horizontal) {
      const north = index - context.grid.width;
      const south = index + context.grid.width;

      if (
        context.grid.tunnels[north] === -1 &&
        context.grid.tunnels[south] === -1
      ) {
        patches.push({
          index,
          crossingSet: CrossingKind.HorizontalOverVertical,
          overlaySet: OverlayFlag.Visited | OverlayFlag.Current,
        });
        patches.push({
          index: north,
          tunnelToSet: south,
          overlaySet: OverlayFlag.Visited,
        });
        patches.push({
          index: south,
          tunnelToSet: north,
          overlaySet: OverlayFlag.Visited,
        });

        context.current = index;
        context.createdCrossings += 1;

        return {
          done: context.createdCrossings >= context.targetCrossings,
          patches,
          meta: {
            line: 4,
            visitedCount: context.grid.cellCount,
            frontierSize: Math.max(0, context.candidates.length - context.cursor),
          },
        };
      }
    }

    if (vertical) {
      const west = index - 1;
      const east = index + 1;

      if (
        context.grid.tunnels[west] === -1 &&
        context.grid.tunnels[east] === -1
      ) {
        patches.push({
          index,
          crossingSet: CrossingKind.VerticalOverHorizontal,
          overlaySet: OverlayFlag.Visited | OverlayFlag.Current,
        });
        patches.push({
          index: west,
          tunnelToSet: east,
          overlaySet: OverlayFlag.Visited,
        });
        patches.push({
          index: east,
          tunnelToSet: west,
          overlaySet: OverlayFlag.Visited,
        });

        context.current = index;
        context.createdCrossings += 1;

        return {
          done: context.createdCrossings >= context.targetCrossings,
          patches,
          meta: {
            line: 4,
            visitedCount: context.grid.cellCount,
            frontierSize: Math.max(0, context.candidates.length - context.cursor),
          },
        };
      }
    }
  }

  return {
    done: true,
    patches,
    meta: {
      line: 5,
      visitedCount: context.grid.cellCount,
      frontierSize: 0,
    },
  };
}

function collectInteriorCells(grid: Grid): number[] {
  const cells: number[] = [];

  for (let y = 1; y < grid.height - 1; y += 1) {
    for (let x = 1; x < grid.width - 1; x += 1) {
      cells.push(y * grid.width + x);
    }
  }

  return cells;
}

function isOpen(walls: number, wall: WallFlag): boolean {
  return (walls & wall) === 0;
}

function shuffle(items: number[], rng: RandomSource): void {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = rng.nextInt(i + 1);
    const tmp = items[i] as number;
    items[i] = items[j] as number;
    items[j] = tmp;
  }
}
