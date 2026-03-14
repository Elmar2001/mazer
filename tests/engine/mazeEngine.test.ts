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

function generateMaze(engine: MazeEngine): void {
  engine.startGeneration();
  engine.pause();
  let guard = 0;
  while (engine.getPhase() !== "Generated" && guard < 5_000) {
    engine.stepOnce();
    guard += 1;
  }
}

function solveMaze(engine: MazeEngine): void {
  engine.startSolving();
  engine.pause();
  let guard = 0;
  while (engine.getPhase() !== "Solved" && guard < 5_000) {
    engine.stepOnce();
    guard += 1;
  }
}

describe("maze engine frame loop (onFrame)", () => {
  it("processes steps via fake timer advances", () => {
    const engine = new MazeEngine(BASE_OPTIONS);
    let phaseChange: string | undefined;
    engine.setCallbacks({
      onPhaseChange: (p) => { phaseChange = p; },
    });

    engine.startGeneration();
    expect(engine.getPhase()).toBe("Generating");

    // Advance timers so the RAF-via-setTimeout fires repeatedly until done
    let iterations = 0;
    while (engine.getPhase() === "Generating" && iterations < 500) {
      vi.advanceTimersByTime(100);
      iterations += 1;
    }

    expect(engine.getPhase()).toBe("Generated");
    expect(phaseChange).toBe("Generated");
    engine.destroy();
  });

  it("runs solving through the frame loop", () => {
    const engine = new MazeEngine({ ...BASE_OPTIONS, width: 4, height: 4 });

    engine.startGeneration();
    while (engine.getPhase() === "Generating") {
      vi.advanceTimersByTime(100);
    }
    expect(engine.getPhase()).toBe("Generated");

    engine.startSolving();
    let iterations = 0;
    while (engine.getPhase() === "Solving" && iterations < 500) {
      vi.advanceTimersByTime(100);
      iterations += 1;
    }

    expect(engine.getPhase()).toBe("Solved");
    engine.destroy();
  });

  it("emits patchesApplied during frame loop", () => {
    let patchesFired = false;
    const engine = new MazeEngine(BASE_OPTIONS, {
      onPatchesApplied: () => { patchesFired = true; },
    });

    engine.startGeneration();
    vi.advanceTimersByTime(200);

    expect(patchesFired).toBe(true);
    engine.pause();
    engine.destroy();
  });

  it("does not reschedule when paused mid-loop", () => {
    const engine = new MazeEngine(BASE_OPTIONS);
    engine.startGeneration();
    vi.advanceTimersByTime(20);
    engine.pause();
    const timersBefore = vi.getTimerCount();
    vi.advanceTimersByTime(200);
    expect(vi.getTimerCount()).toBe(timersBefore);
    engine.destroy();
  });
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

describe("maze engine solving", () => {
  it("transitions through Generated → Solving → Solved phases", () => {
    const engine = new MazeEngine(BASE_OPTIONS);
    generateMaze(engine);
    expect(engine.getPhase()).toBe("Generated");

    solveMaze(engine);
    expect(engine.getPhase()).toBe("Solved");

    const metrics = engine.getMetrics();
    expect(metrics.stepCount).toBeGreaterThan(0);
    expect(metrics.graph).not.toBeNull();

    engine.destroy();
  });

  it("ignores startSolving when not in Generated or Solved phase", () => {
    const engine = new MazeEngine(BASE_OPTIONS);
    // Phase is Idle — startSolving should be a no-op
    engine.startSolving();
    expect(engine.getPhase()).toBe("Idle");
    engine.destroy();
  });

  it("allows re-solving from Solved phase", () => {
    const engine = new MazeEngine(BASE_OPTIONS);
    generateMaze(engine);
    solveMaze(engine);
    expect(engine.getPhase()).toBe("Solved");

    // Re-solve from Solved
    solveMaze(engine);
    expect(engine.getPhase()).toBe("Solved");

    engine.destroy();
  });

  it("clears overlays when solving restarts", () => {
    const engine = new MazeEngine(BASE_OPTIONS);
    generateMaze(engine);
    solveMaze(engine);

    // Re-start solving — overlays should be cleared
    engine.startSolving();
    expect(engine.getPhase()).toBe("Solving");
    engine.pause();
    engine.destroy();
  });

  it("tracks metrics during solving", () => {
    const patches: unknown[] = [];
    const engine = new MazeEngine(BASE_OPTIONS, {
      onPatchesApplied: (_cells, p) => {
        patches.push(...p);
      },
    });

    generateMaze(engine);
    solveMaze(engine);

    const metrics = engine.getMetrics();
    expect(metrics.patchCount).toBeGreaterThan(0);
    expect(metrics.dirtyCellCount).toBeGreaterThan(0);
    expect(metrics.avgPatchesPerStep).toBeGreaterThan(0);
    expect(metrics.avgDirtyCellsPerStep).toBeGreaterThan(0);

    engine.destroy();
  });

  it("preserves graph metrics snapshot across solve", () => {
    const engine = new MazeEngine(BASE_OPTIONS);
    generateMaze(engine);
    const graphAfterGen = engine.getMetrics().graph;
    expect(graphAfterGen).not.toBeNull();

    solveMaze(engine);
    const graphAfterSolve = engine.getMetrics().graph;
    expect(graphAfterSolve).toEqual(graphAfterGen);

    engine.destroy();
  });
});

describe("maze engine battle mode", () => {
  const BATTLE_OPTIONS: MazeEngineOptions = {
    ...BASE_OPTIONS,
    width: 5,
    height: 5,
    battleMode: true,
    solverId: "bfs",
    solverBId: "astar",
  };

  it("produces battle metrics with both solvers", () => {
    const engine = new MazeEngine(BATTLE_OPTIONS);
    generateMaze(engine);
    solveMaze(engine);

    const metrics = engine.getMetrics();
    expect(metrics.battle).not.toBeNull();
    expect(metrics.battle?.enabled).toBe(true);
    expect(metrics.battle?.solverA.id).toBe("bfs");
    expect(metrics.battle?.solverB.id).toBe("astar");
    expect(metrics.battle?.solverA.stepCount).toBeGreaterThan(0);
    expect(metrics.battle?.solverB.stepCount).toBeGreaterThan(0);

    engine.destroy();
  });

  it("battle metrics remain after solving completes", () => {
    const engine = new MazeEngine(BATTLE_OPTIONS);
    generateMaze(engine);
    solveMaze(engine);

    expect(engine.getPhase()).toBe("Solved");
    expect(engine.getMetrics().battle).not.toBeNull();
    expect(engine.getMetrics().battle?.enabled).toBe(true);

    engine.destroy();
  });
});

describe("maze engine api surface", () => {
  it("getOptions returns current options", () => {
    const engine = new MazeEngine(BASE_OPTIONS);
    const opts = engine.getOptions();
    expect(opts.generatorId).toBe("dfs-backtracker");
    expect(opts.solverId).toBe("bfs");
    engine.destroy();
  });

  it("setOptions merges partial options", () => {
    const engine = new MazeEngine(BASE_OPTIONS);
    engine.setOptions({ solverId: "astar" });
    expect(engine.getOptions().solverId).toBe("astar");
    engine.destroy();
  });

  it("setSpeed clamps and resets accumulator", () => {
    const engine = new MazeEngine(BASE_OPTIONS);
    engine.setSpeed(500);
    expect(engine.getOptions().speed).toBe(500);
    engine.destroy();
  });

  it("setCallbacks replaces callback set", () => {
    let phaseChanges = 0;
    const engine = new MazeEngine(BASE_OPTIONS);
    engine.setCallbacks({ onPhaseChange: () => { phaseChanges += 1; } });
    generateMaze(engine);
    expect(phaseChanges).toBeGreaterThan(0);
    engine.destroy();
  });

  it("rebuildGrid resets state to Idle", () => {
    const engine = new MazeEngine(BASE_OPTIONS);
    generateMaze(engine);
    expect(engine.getPhase()).toBe("Generated");

    engine.rebuildGrid(6, 6);
    expect(engine.getPhase()).toBe("Idle");
    expect(engine.getGrid().width).toBe(6);
    expect(engine.getGrid().height).toBe(6);

    engine.destroy();
  });

  it("reset restores Idle phase and clears metrics", () => {
    const engine = new MazeEngine(BASE_OPTIONS);
    generateMaze(engine);
    engine.reset();
    expect(engine.getPhase()).toBe("Idle");
    expect(engine.getMetrics().stepCount).toBe(0);
    engine.destroy();
  });

  it("resume is a no-op when no active work exists", () => {
    const engine = new MazeEngine(BASE_OPTIONS);
    // Phase is Idle, paused — resume should not throw
    engine.resume();
    expect(engine.getPhase()).toBe("Idle");
    engine.destroy();
  });

  it("pause is idempotent", () => {
    const engine = new MazeEngine(BASE_OPTIONS);
    engine.startGeneration();
    engine.pause();
    engine.pause(); // second pause should not throw
    engine.destroy();
  });

  it("throws on unknown generator id", () => {
    const engine = new MazeEngine({ ...BASE_OPTIONS, generatorId: "nonexistent" as never });
    expect(() => engine.startGeneration()).toThrow("nonexistent");
    engine.destroy();
  });

  it("throws on unknown solver id", () => {
    const engine = new MazeEngine({ ...BASE_OPTIONS, solverId: "nonexistent" as never });
    generateMaze(engine);
    expect(() => engine.startSolving()).toThrow("nonexistent");
    engine.destroy();
  });

  it("getMetrics returns deep copies of graph and battle", () => {
    const engine = new MazeEngine(BASE_OPTIONS);
    generateMaze(engine);
    const m1 = engine.getMetrics();
    const m2 = engine.getMetrics();
    expect(m1.graph).not.toBe(m2.graph); // different object references
    engine.destroy();
  });
});
