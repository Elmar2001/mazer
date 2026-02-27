import { describe, expect, it } from "vitest";

import {
  CELL_MAX,
  GRID_MAX,
  GRID_MAX_CELLS,
  SPEED_MAX,
  SPEED_MIN,
  clampCellSize,
  clampGridHeight,
  clampGridSizeByCells,
  clampGridWidth,
  clampSpeed,
  getCellSizeMax,
  getGridWidthMax,
} from "@/config/limits";

describe("limits", () => {
  it("keeps speed high but bounded and clamps invalid values", () => {
    expect(clampSpeed(SPEED_MAX + 50_000)).toBe(SPEED_MAX);
    expect(clampSpeed(-42)).toBe(SPEED_MIN);
  });

  it("caps grid size at 200x200 while keeping total cells bounded", () => {
    const size = clampGridSizeByCells(900, 900);
    expect(size.width).toBe(GRID_MAX);
    expect(size.height).toBe(GRID_MAX);
    expect(size.width * size.height).toBeLessThanOrEqual(GRID_MAX_CELLS);
  });

  it("clamps width and height by viewport constraints for large cell sizes", () => {
    expect(clampGridWidth(GRID_MAX, GRID_MAX, CELL_MAX)).toBeLessThan(GRID_MAX);
    expect(clampGridHeight(GRID_MAX, GRID_MAX, CELL_MAX)).toBeLessThan(GRID_MAX);
  });

  it("clamps cell size when grid dimensions are very large", () => {
    const maxCellAtLargeGrid = getCellSizeMax(GRID_MAX, GRID_MAX);
    expect(maxCellAtLargeGrid).toBeLessThan(CELL_MAX);
    expect(clampCellSize(CELL_MAX, GRID_MAX, GRID_MAX)).toBe(maxCellAtLargeGrid);
  });

  it("allows width values much higher than the previous 120 cap", () => {
    expect(getGridWidthMax(120, 16)).toBeGreaterThan(120);
  });
});
