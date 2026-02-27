import { describe, expect, it } from "vitest";

import { createGrid } from "@/core/grid";
import {
  createGridSnapshot,
  deserializeGridSnapshot,
} from "@/engine/mazeWorkerProtocol";

describe("maze worker protocol", () => {
  it("round-trips grid snapshots", () => {
    const grid = createGrid(6, 4);

    for (let i = 0; i < grid.cellCount; i += 1) {
      grid.walls[i] = i % 16;
      grid.overlays[i] = i % 255;
      grid.crossings[i] = i % 3;
      grid.tunnels[i] = i % 5 === 0 ? (i + 2) % grid.cellCount : -1;
    }

    const { snapshot } = createGridSnapshot(grid);
    const restored = deserializeGridSnapshot(snapshot);

    expect(restored.width).toBe(grid.width);
    expect(restored.height).toBe(grid.height);
    expect(restored.cellCount).toBe(grid.cellCount);
    expect(Array.from(restored.walls)).toEqual(Array.from(grid.walls));
    expect(Array.from(restored.overlays)).toEqual(Array.from(grid.overlays));
    expect(Array.from(restored.crossings)).toEqual(Array.from(grid.crossings));
    expect(Array.from(restored.tunnels)).toEqual(Array.from(grid.tunnels));
  });
});
