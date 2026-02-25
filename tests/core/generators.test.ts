import { describe, expect, it } from "vitest";

import { applyCellPatch, connectedNeighbors, createGrid, WallFlag } from "@/core/grid";
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

function countCarvedEdges(grid: ReturnType<typeof createGrid>): number {
  let edges = 0;

  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const index = y * grid.width + x;
      const walls = grid.walls[index] as number;

      if (x + 1 < grid.width && (walls & WallFlag.East) === 0) {
        edges += 1;
      }

      if (y + 1 < grid.height && (walls & WallFlag.South) === 0) {
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

    for (const neighbor of connectedNeighbors(grid, current)) {
      if (visited[neighbor] === 1) {
        continue;
      }

      visited[neighbor] = 1;
      queue.push(neighbor);
    }
  }

  return queue.length;
}

describe("generator plugins", () => {
  it.each(generatorPlugins)("%s is deterministic for the same seed", (plugin) => {
    const first = runGenerator(plugin, "same-seed");
    const second = runGenerator(plugin, "same-seed");

    expect(Array.from(first.walls)).toEqual(Array.from(second.walls));
  });

  it.each(generatorPlugins)("%s produces a connected perfect maze", (plugin) => {
    const grid = runGenerator(plugin, "tree-seed");

    expect(reachableCellCount(grid)).toBe(grid.cellCount);
    expect(countCarvedEdges(grid)).toBe(grid.cellCount - 1);
  });
});
