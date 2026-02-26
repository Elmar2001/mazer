import type { SolverPlugin } from "@/core/plugins/SolverPlugin";
import { bfsSolver } from "@/core/plugins/solvers/bfs";
import type { AlgorithmStepMeta, SolverRunOptions } from "@/core/plugins/types";

export const shortestPathFinderSolver: SolverPlugin<
  SolverRunOptions,
  AlgorithmStepMeta
> = {
  id: "shortest-path-finder",
  label: "Shortest Path Finder",
  implementationKind: "alias",
  aliasOf: "bfs",
  create(params) {
    return bfsSolver.create(params);
  },
};
