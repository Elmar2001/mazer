import { describe, expect, it } from "vitest";

import {
  applyCellPatch,
  clearOverlays,
  connectedNeighbors,
  createGrid,
  OverlayFlag,
  WallFlag,
} from "@/core/grid";
import { dfsBacktrackerGenerator } from "@/core/plugins/generators/dfsBacktracker";
import { generatorPlugins } from "@/core/plugins/generators";
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

function buildMazeWithGenerator(
  generatorId: string,
  width = 24,
  height = 16,
  seed = "solver-maze",
) {
  const plugin = generatorPlugins.find((generator) => generator.id === generatorId);
  if (!plugin) {
    throw new Error(`Generator plugin not found: ${generatorId}`);
  }

  const grid = createGrid(width, height);
  const stepper = plugin.create({
    grid,
    rng: createSeededRandom(seed),
    options: {},
  });

  for (let i = 0; i < width * height * 40; i += 1) {
    const result = stepper.step();
    for (const patch of result.patches) {
      applyCellPatch(grid, patch);
    }

    if (result.done) {
      return grid;
    }
  }

  throw new Error(`Generator ${generatorId} did not finish in budget`);
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

function countOverlayCells(
  grid: ReturnType<typeof createGrid>,
  flag: OverlayFlag,
): number {
  let count = 0;
  for (let i = 0; i < grid.cellCount; i += 1) {
    if ((grid.overlays[i] & flag) !== 0) {
      count += 1;
    }
  }
  return count;
}

/** IDs of solvers that need a higher deterministic test budget. */
const HEURISTIC_SOLVER_IDS = new Set([
  "q-learning",
  "ant-colony",
  "random-mouse",
  "genetic",
  "rrt-star",
]);

function runSolver(
  plugin: SolverPlugin<SolverRunOptions, AlgorithmStepMeta>,
  grid: ReturnType<typeof createGrid>,
  options: { startIndex?: number; goalIndex?: number } = {},
) {
  clearOverlays(grid);
  const startIndex = options.startIndex ?? 0;
  const goalIndex = options.goalIndex ?? grid.cellCount - 1;

  const stepper = plugin.create({
    grid,
    rng: createSeededRandom("solver-seed"),
    options: {
      startIndex,
      goalIndex,
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

  throw new Error("Cells must be adjacent to carve a connection.");
}

function buildDisconnectedLoopMaze() {
  const grid = createGrid(3, 3);

  carveConnection(grid, 0, 1);
  carveConnection(grid, 1, 4);
  carveConnection(grid, 4, 3);
  carveConnection(grid, 3, 0);

  return grid;
}

function buildOpenGrid(width: number, height: number) {
  const grid = createGrid(width, height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (x + 1 < width) {
        carveConnection(grid, index, index + 1);
      }
      if (y + 1 < height) {
        carveConnection(grid, index, index + width);
      }
    }
  }

  return grid;
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

  it("genetic progresses over multiple steps for visualization", () => {
    const genetic = solverPlugins.find((plugin) => plugin.id === "genetic");
    if (!genetic) {
      throw new Error("Genetic plugin not found");
    }

    const grid = createGrid(baseGrid.width, baseGrid.height);
    grid.walls.set(baseGrid.walls);

    clearOverlays(grid);

    const stepper = genetic.create({
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

  it("ida-star finds an optimal shortest path", () => {
    const idaStar = solverPlugins.find((plugin) => plugin.id === "ida-star");
    if (!idaStar) {
      throw new Error("IDA* plugin not found");
    }

    const grid = createGrid(baseGrid.width, baseGrid.height);
    grid.walls.set(baseGrid.walls);

    const result = runSolver(idaStar, grid);

    expect(result.lastMeta?.pathLength).toBe(optimalLength);
  });

  it("fringe-search finds an optimal shortest path", () => {
    const fringe = solverPlugins.find((plugin) => plugin.id === "fringe-search");
    if (!fringe) {
      throw new Error("Fringe Search plugin not found");
    }

    const grid = createGrid(baseGrid.width, baseGrid.height);
    grid.walls.set(baseGrid.walls);

    const result = runSolver(fringe, grid);

    expect(result.lastMeta?.pathLength).toBe(optimalLength);
  });

  it("bellman-ford progresses over multiple steps for visualization", () => {
    const bellmanFord = solverPlugins.find(
      (plugin) => plugin.id === "bellman-ford",
    );
    if (!bellmanFord) {
      throw new Error("Bellman-Ford plugin not found");
    }

    const grid = createGrid(baseGrid.width, baseGrid.height);
    grid.walls.set(baseGrid.walls);

    clearOverlays(grid);

    const stepper = bellmanFord.create({
      grid,
      rng: createSeededRandom("solver-seed"),
      options: {
        startIndex: 0,
        goalIndex: grid.cellCount - 1,
      },
    });

    let finishedEarly = false;

    for (let i = 0; i < 10; i += 1) {
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

  it("physarum progresses over multiple steps for visualization", () => {
    const physarum = solverPlugins.find((plugin) => plugin.id === "physarum");
    if (!physarum) {
      throw new Error("Physarum plugin not found");
    }

    const grid = createGrid(baseGrid.width, baseGrid.height);
    grid.walls.set(baseGrid.walls);

    clearOverlays(grid);

    const stepper = physarum.create({
      grid,
      rng: createSeededRandom("solver-seed"),
      options: {
        startIndex: 0,
        goalIndex: grid.cellCount - 1,
      },
    });

    let finishedEarly = false;

    for (let i = 0; i < 120; i += 1) {
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

  it("physarum reveals coverage progressively instead of all-at-once", () => {
    const physarum = solverPlugins.find((plugin) => plugin.id === "physarum");
    if (!physarum) {
      throw new Error("Physarum plugin not found");
    }

    const grid = createGrid(baseGrid.width, baseGrid.height);
    grid.walls.set(baseGrid.walls);
    clearOverlays(grid);

    const stepper = physarum.create({
      grid,
      rng: createSeededRandom("solver-seed"),
      options: {
        startIndex: 0,
        goalIndex: grid.cellCount - 1,
      },
    });

    let firstStepVisited = -1;
    let lastVisited = -1;

    for (let i = 0; i < 20; i += 1) {
      const result = stepper.step();
      for (const patch of result.patches) {
        applyCellPatch(grid, patch);
      }

      const visited = countOverlayCells(grid, OverlayFlag.Visited);
      if (i === 0) {
        firstStepVisited = visited;
      }
      lastVisited = visited;

      if (result.done) {
        break;
      }
    }

    expect(firstStepVisited).toBeGreaterThan(0);
    expect(firstStepVisited).toBeLessThan(Math.floor(grid.cellCount * 0.5));
    expect(lastVisited).toBeGreaterThan(firstStepVisited);
  });

  it("electric-circuit progresses over multiple steps for visualization", () => {
    const electricCircuit = solverPlugins.find(
      (plugin) => plugin.id === "electric-circuit",
    );
    if (!electricCircuit) {
      throw new Error("Electric Circuit plugin not found");
    }

    const grid = createGrid(baseGrid.width, baseGrid.height);
    grid.walls.set(baseGrid.walls);

    clearOverlays(grid);

    const stepper = electricCircuit.create({
      grid,
      rng: createSeededRandom("solver-seed"),
      options: {
        startIndex: 0,
        goalIndex: grid.cellCount - 1,
      },
    });

    let finishedEarly = false;

    for (let i = 0; i < 120; i += 1) {
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

  it("electric-circuit reveals coverage progressively instead of all-at-once", () => {
    const electricCircuit = solverPlugins.find(
      (plugin) => plugin.id === "electric-circuit",
    );
    if (!electricCircuit) {
      throw new Error("Electric Circuit plugin not found");
    }

    const grid = createGrid(baseGrid.width, baseGrid.height);
    grid.walls.set(baseGrid.walls);
    clearOverlays(grid);

    const stepper = electricCircuit.create({
      grid,
      rng: createSeededRandom("solver-seed"),
      options: {
        startIndex: 0,
        goalIndex: grid.cellCount - 1,
      },
    });

    let firstStepVisited = -1;
    let lastVisited = -1;

    for (let i = 0; i < 20; i += 1) {
      const result = stepper.step();
      for (const patch of result.patches) {
        applyCellPatch(grid, patch);
      }

      const visited = countOverlayCells(grid, OverlayFlag.Visited);
      if (i === 0) {
        firstStepVisited = visited;
      }
      lastVisited = visited;

      if (result.done) {
        break;
      }
    }

    expect(firstStepVisited).toBeGreaterThan(0);
    expect(firstStepVisited).toBeLessThan(Math.floor(grid.cellCount * 0.5));
    expect(lastVisited).toBeGreaterThan(firstStepVisited);
  });

  it("bellman-ford progresses over multiple steps on loopy topology", () => {
    const bellmanFord = solverPlugins.find(
      (plugin) => plugin.id === "bellman-ford",
    );
    if (!bellmanFord) {
      throw new Error("Bellman-Ford plugin not found");
    }

    const grid = buildMazeWithGenerator(
      "prim-loopy",
      30,
      20,
      "bellman-ford-loopy",
    );

    clearOverlays(grid);

    const stepper = bellmanFord.create({
      grid,
      rng: createSeededRandom("solver-seed"),
      options: {
        startIndex: 0,
        goalIndex: grid.cellCount - 1,
      },
    });

    let finishedEarly = false;

    for (let i = 0; i < 12; i += 1) {
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

  it("bellman-ford does not collapse an open grid in just a few steps", () => {
    const bellmanFord = solverPlugins.find(
      (plugin) => plugin.id === "bellman-ford",
    );
    if (!bellmanFord) {
      throw new Error("Bellman-Ford plugin not found");
    }

    const grid = buildOpenGrid(12, 8);

    clearOverlays(grid);

    const stepper = bellmanFord.create({
      grid,
      rng: createSeededRandom("solver-seed"),
      options: {
        startIndex: 0,
        goalIndex: grid.cellCount - 1,
      },
    });

    let finishedEarly = false;

    for (let i = 0; i < 8; i += 1) {
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

  it("dead-end-filling reports unsolved for disconnected start and goal", () => {
    const deadEnd = solverPlugins.find(
      (plugin) => plugin.id === "dead-end-filling",
    );
    if (!deadEnd) {
      throw new Error("Dead-End Filling plugin not found");
    }

    const grid = buildDisconnectedLoopMaze();
    const result = runSolver(deadEnd, grid, {
      startIndex: 0,
      goalIndex: 8,
    });

    expect(result.done).toBe(true);
    expect(result.lastMeta?.solved).toBe(false);
    expect(result.lastMeta?.pathLength ?? 0).toBe(0);
    expect((grid.overlays[0] & OverlayFlag.Path) !== 0).toBe(false);
    expect((grid.overlays[8] & OverlayFlag.Path) !== 0).toBe(false);
  });

  it("dead-end-filling visualizes final path over multiple steps when no dead ends exist", () => {
    const deadEnd = solverPlugins.find(
      (plugin) => plugin.id === "dead-end-filling",
    );
    if (!deadEnd) {
      throw new Error("Dead-End Filling plugin not found");
    }

    const grid = buildOpenGrid(12, 8);
    clearOverlays(grid);

    const stepper = deadEnd.create({
      grid,
      rng: createSeededRandom("solver-seed"),
      options: {
        startIndex: 0,
        goalIndex: grid.cellCount - 1,
      },
    });

    let finishedEarly = false;

    for (let i = 0; i < 4; i += 1) {
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

  it.each(["wall-follower", "left-wall-follower"] as const)(
    "%s terminates when no path exists",
    (solverId) => {
      const solver = solverPlugins.find((plugin) => plugin.id === solverId);
      if (!solver) {
        throw new Error(`Solver plugin not found: ${solverId}`);
      }

      const grid = buildDisconnectedLoopMaze();
      const result = runSolver(solver, grid, {
        startIndex: 0,
        goalIndex: 8,
      });

      expect(result.done).toBe(true);
      expect(result.lastMeta?.solved).toBe(false);
      expect(result.lastMeta?.pathLength ?? 0).toBe(0);
      expect((grid.overlays[8] & OverlayFlag.Path) !== 0).toBe(false);
    },
  );

  it("iterative-deepening-dfs solves loopy topology without hanging", () => {
    const iddfs = solverPlugins.find(
      (plugin) => plugin.id === "iterative-deepening-dfs",
    );
    if (!iddfs) {
      throw new Error("IDDFS plugin not found");
    }

    const grid = buildMazeWithGenerator("prim-loopy", 20, 14, "iddfs-loopy");
    const result = runSolver(iddfs, grid);

    expect(result.done).toBe(true);
    expect(result.lastMeta?.solved).toBe(true);
    expect((grid.overlays[0] & OverlayFlag.Path) !== 0).toBe(true);
    expect(
      (grid.overlays[grid.cellCount - 1] & OverlayFlag.Path) !== 0,
    ).toBe(true);
  });

  it("iterative-deepening-dfs solves open grid without hanging", () => {
    const iddfs = solverPlugins.find(
      (plugin) => plugin.id === "iterative-deepening-dfs",
    );
    if (!iddfs) {
      throw new Error("IDDFS plugin not found");
    }

    const grid = buildOpenGrid(12, 8);
    const result = runSolver(iddfs, grid);

    expect(result.done).toBe(true);
    expect(result.lastMeta?.solved).toBe(true);
    expect((grid.overlays[0] & OverlayFlag.Path) !== 0).toBe(true);
    expect(
      (grid.overlays[grid.cellCount - 1] & OverlayFlag.Path) !== 0,
    ).toBe(true);
  });

  it.each(["bfs", "dijkstra", "bellman-ford"] as const)(
    "%s solves braid topology",
    (solverId) => {
      const solver = solverPlugins.find((plugin) => plugin.id === solverId);
      if (!solver) {
        throw new Error(`Solver plugin not found: ${solverId}`);
      }

      const grid = buildMazeWithGenerator("braid", 28, 18, "braid-solver");
      const result = runSolver(solver, grid);

      expect(result.done).toBe(true);
      expect(result.lastMeta?.solved).toBe(true);
      expect((grid.overlays[0] & OverlayFlag.Path) !== 0).toBe(true);
      expect((grid.overlays[grid.cellCount - 1] & OverlayFlag.Path) !== 0).toBe(true);
    },
  );

  it.each(["bfs", "astar", "dijkstra"] as const)(
    "%s solves weave topology",
    (solverId) => {
      const solver = solverPlugins.find((plugin) => plugin.id === solverId);
      if (!solver) {
        throw new Error(`Solver plugin not found: ${solverId}`);
      }

      const grid = buildMazeWithGenerator(
        "weave-growing-tree",
        30,
        20,
        "weave-solver",
      );
      const result = runSolver(solver, grid);

      expect(result.done).toBe(true);
      expect(result.lastMeta?.solved).toBe(true);
      expect((grid.overlays[0] & OverlayFlag.Path) !== 0).toBe(true);
      expect((grid.overlays[grid.cellCount - 1] & OverlayFlag.Path) !== 0).toBe(true);
    },
  );
});
