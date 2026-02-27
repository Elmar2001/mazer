import { describe, expect, it } from "vitest";

import { applyCellPatch, createGrid, WallFlag } from "@/core/grid";
import { analyzeMazeGraph } from "@/core/analysis/graphMetrics";

function carveConnection(
  grid: ReturnType<typeof createGrid>,
  from: number,
  to: number,
): void {
  if (to === from + 1) {
    applyCellPatch(grid, { index: from, wallClear: WallFlag.East });
    applyCellPatch(grid, { index: to, wallClear: WallFlag.West });
    return;
  }

  if (to === from - 1) {
    applyCellPatch(grid, { index: from, wallClear: WallFlag.West });
    applyCellPatch(grid, { index: to, wallClear: WallFlag.East });
    return;
  }

  if (to === from + grid.width) {
    applyCellPatch(grid, { index: from, wallClear: WallFlag.South });
    applyCellPatch(grid, { index: to, wallClear: WallFlag.North });
    return;
  }

  if (to === from - grid.width) {
    applyCellPatch(grid, { index: from, wallClear: WallFlag.North });
    applyCellPatch(grid, { index: to, wallClear: WallFlag.South });
    return;
  }

  throw new Error("Cells must be adjacent.");
}

describe("analyzeMazeGraph", () => {
  it("reports tree stats for a perfect maze graph", () => {
    const grid = createGrid(2, 2);
    carveConnection(grid, 0, 1);
    carveConnection(grid, 1, 3);
    carveConnection(grid, 3, 2);

    const stats = analyzeMazeGraph(grid, 0, 3);

    expect(stats.edgeCount).toBe(3);
    expect(stats.cycleCount).toBe(0);
    expect(stats.shortestPathCount).toBe(1);
    expect(stats.shortestPathCountCapped).toBe(false);
  });

  it("reports non-zero cycles and multiple shortest paths for a ring", () => {
    const grid = createGrid(2, 2);
    carveConnection(grid, 0, 1);
    carveConnection(grid, 1, 3);
    carveConnection(grid, 3, 2);
    carveConnection(grid, 2, 0);

    const stats = analyzeMazeGraph(grid, 0, 3);

    expect(stats.edgeCount).toBe(4);
    expect(stats.cycleCount).toBe(1);
    expect(stats.shortestPathCount).toBeGreaterThanOrEqual(2);
  });

  it("counts tunnel edges via traversable neighbors", () => {
    const grid = createGrid(3, 1);
    carveConnection(grid, 0, 1);
    applyCellPatch(grid, { index: 0, tunnelToSet: 2 });
    applyCellPatch(grid, { index: 2, tunnelToSet: 0 });

    const stats = analyzeMazeGraph(grid, 0, 2);

    expect(stats.edgeCount).toBe(2);
    expect(stats.shortestPathCount).toBe(1);
    expect(stats.cycleCount).toBe(0);
  });
});
