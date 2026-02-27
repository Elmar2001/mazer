import { describe, expect, it } from "vitest";

import { applyCellPatch, createGrid, traversableNeighbors } from "@/core/grid";
import { generatorPlugins } from "@/core/plugins/generators";
import type { GeneratorPlugin } from "@/core/plugins/GeneratorPlugin";
import type {
  AlgorithmStepMeta,
  GeneratorRunOptions,
} from "@/core/plugins/types";
import { createSeededRandom } from "@/core/rng";

function runGenerator(
  plugin: GeneratorPlugin<GeneratorRunOptions, AlgorithmStepMeta>,
  seed: string,
  width = 18,
  height = 12,
) {
  const grid = createGrid(width, height);
  const stepper = plugin.create({
    grid,
    rng: createSeededRandom(seed),
    options: {},
  });

  let done = false;
  const maxSteps = width * height * 20;

  for (let i = 0; i < maxSteps; i += 1) {
    const result = stepper.step();
    for (const patch of result.patches) {
      applyCellPatch(grid, patch);
    }

    if (result.done) {
      done = true;
      break;
    }
  }

  expect(done).toBe(true);
  return grid;
}

function countGraphEdges(grid: ReturnType<typeof createGrid>): number {
  let edges = 0;

  for (let i = 0; i < grid.cellCount; i += 1) {
    for (const neighbor of traversableNeighbors(grid, i)) {
      if (neighbor > i) {
        edges += 1;
      }
    }
  }

  return edges;
}

function reachableCellCount(grid: ReturnType<typeof createGrid>): number {
  const visited = new Uint8Array(grid.cellCount);
  const queue = [0];
  visited[0] = 1;
  let head = 0;

  while (head < queue.length) {
    const current = queue[head] as number;
    head += 1;

    for (const neighbor of traversableNeighbors(grid, current)) {
      if (visited[neighbor] === 1) {
        continue;
      }

      visited[neighbor] = 1;
      queue.push(neighbor);
    }
  }

  return queue.length;
}

function deadEndCount(grid: ReturnType<typeof createGrid>): number {
  let total = 0;

  for (let i = 0; i < grid.cellCount; i += 1) {
    if (traversableNeighbors(grid, i).length <= 1) {
      total += 1;
    }
  }

  return total;
}

describe("generator plugins", () => {
  it.each(generatorPlugins)("%s is deterministic for the same seed", (plugin) => {
    const first = runGenerator(plugin, "same-seed");
    const second = runGenerator(plugin, "same-seed");

    expect(Array.from(first.walls)).toEqual(Array.from(second.walls));
    expect(Array.from(first.crossings)).toEqual(Array.from(second.crossings));
    expect(Array.from(first.tunnels)).toEqual(Array.from(second.tunnels));
  });

  it.each(generatorPlugins)("%s produces a connected maze graph", (plugin) => {
    const grid = runGenerator(plugin, "tree-seed");
    const edges = countGraphEdges(grid);

    expect(reachableCellCount(grid)).toBe(grid.cellCount);
    expect(edges).toBeGreaterThanOrEqual(grid.cellCount - 1);

    if (plugin.topologyOut === "perfect-planar") {
      expect(edges).toBe(grid.cellCount - 1);
    }

    if (plugin.topologyOut === "loopy-planar" || plugin.topologyOut === "weave") {
      expect(edges).toBeGreaterThan(grid.cellCount - 1);
    }
  });

  it("braid reduces dead ends compared to base dfs", () => {
    const braid = generatorPlugins.find((plugin) => plugin.id === "braid");
    const dfs = generatorPlugins.find((plugin) => plugin.id === "dfs-backtracker");
    if (!braid || !dfs) {
      throw new Error("Missing braid/dfs generator plugin");
    }

    const dfsGrid = runGenerator(dfs, "braid-seed", 28, 18);
    const braidGrid = runGenerator(braid, "braid-seed", 28, 18);

    expect(deadEndCount(braidGrid)).toBeLessThan(deadEndCount(dfsGrid));
  });

  it("weave generator produces at least one crossing for deterministic large grid", () => {
    const weave = generatorPlugins.find(
      (plugin) => plugin.id === "weave-growing-tree",
    );
    if (!weave) {
      throw new Error("Missing weave-growing-tree plugin");
    }

    const grid = runGenerator(weave, "weave-seed", 36, 22);
    const crossingCount = Array.from(grid.crossings).filter((value) => value !== 0).length;
    expect(crossingCount).toBeGreaterThan(0);
  });
});
