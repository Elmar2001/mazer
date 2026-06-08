import { beforeEach, describe, expect, it } from "vitest";

import {
  CELL_MIN,
  GRID_MIN,
  SPEED_MAX,
  SPEED_MIN,
  getCellSizeMax,
  getGridHeightMax,
  getGridWidthMax,
} from "@/config/limits";
import { useMazeStore } from "@/ui/store/mazeStore";

const INITIAL_STATE = useMazeStore.getState();
const INITIAL_SETTINGS = { ...INITIAL_STATE.settings };
const INITIAL_RUNTIME = { ...INITIAL_STATE.runtime };

beforeEach(() => {
  useMazeStore.setState({
    settings: { ...INITIAL_SETTINGS },
    runtime: { ...INITIAL_RUNTIME },
  });
});

describe("mazeStore defaults", () => {
  it("matches the documented default settings", () => {
    const { settings } = useMazeStore.getState();
    expect(settings.generatorId).toBe("dfs-backtracker");
    expect(settings.solverId).toBe("bfs");
    expect(settings.speed).toBe(60);
    expect(settings.gridWidth).toBe(40);
    expect(settings.gridHeight).toBe(25);
    expect(settings.cellSize).toBe(16);
    expect(settings.seed).toBe("mazer");
  });
});

describe("mazeStore clamp logic", () => {
  it("clamps speed above SPEED_MAX to SPEED_MAX", () => {
    useMazeStore.getState().setSpeed(SPEED_MAX + 5_000);
    expect(useMazeStore.getState().settings.speed).toBe(SPEED_MAX);
  });

  it("clamps speed below SPEED_MIN to SPEED_MIN", () => {
    useMazeStore.getState().setSpeed(-10);
    expect(useMazeStore.getState().settings.speed).toBe(SPEED_MIN);
  });

  it("clamps grid width above the allowed maximum", () => {
    const { gridHeight, cellSize } = useMazeStore.getState().settings;
    const max = getGridWidthMax(gridHeight, cellSize);
    useMazeStore.getState().setGridWidth(99_999);
    expect(useMazeStore.getState().settings.gridWidth).toBe(max);
  });

  it("clamps grid width below GRID_MIN", () => {
    useMazeStore.getState().setGridWidth(0);
    expect(useMazeStore.getState().settings.gridWidth).toBe(GRID_MIN);
  });

  it("clamps grid height above the allowed maximum", () => {
    const { gridWidth, cellSize } = useMazeStore.getState().settings;
    const max = getGridHeightMax(gridWidth, cellSize);
    useMazeStore.getState().setGridHeight(99_999);
    expect(useMazeStore.getState().settings.gridHeight).toBe(max);
  });

  it("clamps cell size below CELL_MIN to CELL_MIN", () => {
    useMazeStore.getState().setCellSize(0);
    expect(useMazeStore.getState().settings.cellSize).toBe(CELL_MIN);
  });

  it("clamps cell size above the allowed maximum", () => {
    const { gridWidth, gridHeight } = useMazeStore.getState().settings;
    const max = getCellSizeMax(gridWidth, gridHeight);
    useMazeStore.getState().setCellSize(9_999);
    expect(useMazeStore.getState().settings.cellSize).toBe(max);
  });
});

describe("mazeStore error actions", () => {
  it("setError stores the message on runtime.error", () => {
    useMazeStore.getState().setError("plugin crashed");
    expect(useMazeStore.getState().runtime.error).toBe("plugin crashed");
  });

  it("clearError resets runtime.error to null", () => {
    useMazeStore.getState().setError("boom");
    useMazeStore.getState().clearError();
    expect(useMazeStore.getState().runtime.error).toBeNull();
  });

  it("resetRuntime clears runtime.error", () => {
    useMazeStore.getState().setError("boom");
    useMazeStore.getState().resetRuntime();
    expect(useMazeStore.getState().runtime.error).toBeNull();
  });
});
