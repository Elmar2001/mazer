import { describe, expect, it } from "vitest";

import {
  getCompatibleSolverOptions,
  getGeneratorTopology,
} from "@/ui/constants/algorithms";

describe("solver compatibility filtering", () => {
  it("maps known topology-changing generators", () => {
    expect(getGeneratorTopology("braid")).toBe("loopy-planar");
    expect(getGeneratorTopology("prim-loopy")).toBe("loopy-planar");
    expect(getGeneratorTopology("kruskal-loopy")).toBe("loopy-planar");
    expect(getGeneratorTopology("recursive-division-loopy")).toBe(
      "loopy-planar",
    );
    expect(getGeneratorTopology("weave-growing-tree")).toBe("weave");
  });

  it("filters out wall-following solvers for loopy topology", () => {
    const options = getCompatibleSolverOptions("loopy-planar");
    const ids = new Set(options.map((option) => option.id));

    expect(ids.has("wall-follower")).toBe(false);
    expect(ids.has("left-wall-follower")).toBe(false);
    expect(ids.has("bfs")).toBe(true);
    expect(ids.has("dijkstra")).toBe(true);
    expect(ids.has("bellman-ford")).toBe(true);
  });

  it("filters out geometry-locked wall solvers for weave topology", () => {
    const options = getCompatibleSolverOptions("weave");
    const ids = new Set(options.map((option) => option.id));

    expect(ids.has("wall-follower")).toBe(false);
    expect(ids.has("left-wall-follower")).toBe(false);
    expect(ids.has("pledge")).toBe(false);
    expect(ids.has("bfs")).toBe(true);
    expect(ids.has("astar")).toBe(true);
  });
});
