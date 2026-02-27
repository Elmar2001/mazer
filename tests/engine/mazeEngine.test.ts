import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MazeEngine } from "@/engine/MazeEngine";
import type { MazeEngineOptions } from "@/engine/types";

const BASE_OPTIONS: MazeEngineOptions = {
  width: 8,
  height: 6,
  speed: 120,
  seed: "engine-seed",
  generatorId: "dfs-backtracker",
  solverId: "bfs",
  battleMode: false,
  solverBId: "astar",
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("maze engine scheduler", () => {
  it("stops scheduling frames while paused and restarts on resume", () => {
    const engine = new MazeEngine(BASE_OPTIONS);

    expect(vi.getTimerCount()).toBe(0);

    engine.startGeneration();
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    engine.pause();
    expect(vi.getTimerCount()).toBe(0);

    vi.advanceTimersByTime(200);
    expect(vi.getTimerCount()).toBe(0);

    engine.resume();
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    engine.pause();
    engine.destroy();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("computes graph metrics when generation completes", () => {
    const engine = new MazeEngine(BASE_OPTIONS);
    expect(engine.getMetrics().graph).toBeNull();

    engine.startGeneration();
    engine.pause();

    let guard = 0;
    while (engine.getPhase() !== "Generated" && guard < 2_000) {
      engine.stepOnce();
      guard += 1;
    }

    expect(engine.getPhase()).toBe("Generated");
    const graph = engine.getMetrics().graph;
    expect(graph).not.toBeNull();
    expect(graph?.edgeCount).toBeGreaterThan(0);
    expect(graph?.cycleCount).toBe(0);

    engine.destroy();
  });
});
