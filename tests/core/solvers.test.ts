import { describe, expect, it } from "vitest";

import {
  applyCellPatch,
  clearOverlays,
  connectedNeighbors,
  createGrid,
  OverlayFlag,
} from "@/core/grid";
import { dfsBacktrackerGenerator } from "@/core/plugins/generators/dfsBacktracker";
import { solverPlugins } from "@/core/plugins/solvers";
import type { SolverPlugin } from "@/core/plugins/SolverPlugin";
import type { AlgorithmStepMeta, SolverRunOptions } from "@/core/plugins/types";
import { createSeededRandom } from "@/core/rng";

function buildMaze(width = 24, height = 16) {
  const grid = createGrid(width, height);
  const generator = dfsBacktrackerGenerator.create({
    grid,
    rng: createSeededRandom("solver-maze"),
    options: {},
  });

  for (let i = 0; i < width * height * 20; i += 1) {
    const result = generator.step();
    for (const patch of result.patches) {
      applyCellPatch(grid, patch);
    }

    if (result.done) {
      break;
    }
  }

  return grid;
}

function shortestPathLength(grid: ReturnType<typeof createGrid>): number {
  const start = 0;
  const goal = grid.cellCount - 1;
  const dist = new Int32Array(grid.cellCount);
  dist.fill(-1);

  const queue = [start];
  dist[start] = 0;
  let head = 0;

  while (head < queue.length) {
    const current = queue[head] as number;
    head += 1;

    if (current === goal) {
      return dist[current] + 1;
    }

    for (const neighbor of connectedNeighbors(grid, current)) {
      if (dist[neighbor] !== -1) {
        continue;
      }

      dist[neighbor] = dist[current] + 1;
      queue.push(neighbor);
    }
  }

  return 0;
}

/** IDs of solvers that train over many episodes and need a higher step budget. */
const HEURISTIC_SOLVER_IDS = new Set(["q-learning", "ant-colony"]);

function runSolver(
  plugin: SolverPlugin<SolverRunOptions, AlgorithmStepMeta>,
  grid: ReturnType<typeof createGrid>,
) {
  clearOverlays(grid);

  const stepper = plugin.create({
    grid,
    rng: createSeededRandom("solver-seed"),
    options: {
      startIndex: 0,
      goalIndex: grid.cellCount - 1,
    },
  });

  const isHeuristic = HEURISTIC_SOLVER_IDS.has(plugin.id);
  const maxSteps = isHeuristic ? grid.cellCount * 5000 : grid.cellCount * 20;

  let done = false;
  let lastMeta: AlgorithmStepMeta | undefined;

  for (let i = 0; i < maxSteps; i += 1) {
    const result = stepper.step();
    for (const patch of result.patches) {
      applyCellPatch(grid, patch);
    }

    lastMeta = result.meta;

    if (result.done) {
      done = true;
      break;
    }
  }

  return {
    done,
    lastMeta,
  };
}

describe("solver plugins", () => {
  const baseGrid = buildMaze();
  const optimalLength = shortestPathLength(baseGrid);

  it.each(solverPlugins)("%s reaches the goal", (plugin) => {
    const grid = createGrid(baseGrid.width, baseGrid.height);
    grid.walls.set(baseGrid.walls);

    const result = runSolver(plugin, grid);

    expect(result.done).toBe(true);
    expect(result.lastMeta?.solved).toBe(true);
    expect((grid.overlays[0] & OverlayFlag.Path) !== 0).toBe(true);
    expect((grid.overlays[grid.cellCount - 1] & OverlayFlag.Path) !== 0).toBe(true);
  });

  it("ant-colony progresses over multiple steps for visualization", () => {
    const antColony = solverPlugins.find((plugin) => plugin.id === "ant-colony");
    if (!antColony) {
      throw new Error("Ant Colony plugin not found");
    }

    const grid = createGrid(baseGrid.width, baseGrid.height);
    grid.walls.set(baseGrid.walls);

    clearOverlays(grid);

    const stepper = antColony.create({
      grid,
      rng: createSeededRandom("solver-seed"),
      options: {
        startIndex: 0,
        goalIndex: grid.cellCount - 1,
      },
    });

    let finishedEarly = false;

    for (let i = 0; i < 25; i += 1) {
      const result = stepper.step();
      for (const patch of result.patches) {
        applyCellPatch(grid, patch);
      }

      if (result.done) {
        finishedEarly = true;
        break;
      }
    }

    expect(finishedEarly).toBe(false);
  });

  it("q-learning progresses over multiple steps for visualization", () => {
    const qLearning = solverPlugins.find((plugin) => plugin.id === "q-learning");
    if (!qLearning) {
      throw new Error("Q-Learning plugin not found");
    }

    const grid = createGrid(baseGrid.width, baseGrid.height);
    grid.walls.set(baseGrid.walls);

    clearOverlays(grid);

    const stepper = qLearning.create({
      grid,
      rng: createSeededRandom("solver-seed"),
      options: {
        startIndex: 0,
        goalIndex: grid.cellCount - 1,
      },
    });

    let finishedEarly = false;

    for (let i = 0; i < 25; i += 1) {
      const result = stepper.step();
      for (const patch of result.patches) {
        applyCellPatch(grid, patch);
      }

      if (result.done) {
        finishedEarly = true;
        break;
      }
    }

    expect(finishedEarly).toBe(false);
  });

  it("bfs finds an optimal shortest path", () => {
    const bfs = solverPlugins.find((plugin) => plugin.id === "bfs");
    if (!bfs) {
      throw new Error("BFS plugin not found");
    }

    const grid = createGrid(baseGrid.width, baseGrid.height);
    grid.walls.set(baseGrid.walls);

    const result = runSolver(bfs, grid);

    expect(result.lastMeta?.pathLength).toBe(optimalLength);
  });

  it("dijkstra finds an optimal shortest path", () => {
    const dijkstra = solverPlugins.find((plugin) => plugin.id === "dijkstra");
    if (!dijkstra) {
      throw new Error("Dijkstra plugin not found");
    }

    const grid = createGrid(baseGrid.width, baseGrid.height);
    grid.walls.set(baseGrid.walls);

    const result = runSolver(dijkstra, grid);

    expect(result.lastMeta?.pathLength).toBe(optimalLength);
  });

  it("bellman-ford finds an optimal shortest path", () => {
    const bellmanFord = solverPlugins.find(
      (plugin) => plugin.id === "bellman-ford",
    );
    if (!bellmanFord) {
      throw new Error("Bellman-Ford plugin not found");
    }

    const grid = createGrid(baseGrid.width, baseGrid.height);
    grid.walls.set(baseGrid.walls);

    const result = runSolver(bellmanFord, grid);

    expect(result.lastMeta?.pathLength).toBe(optimalLength);
  });
});
