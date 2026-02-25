import type { SolverPlugin } from "@/core/plugins/SolverPlugin";
import { bidirectionalBfsSolver } from "@/core/plugins/solvers/bidirectionalBfs";
import type { AlgorithmStepMeta, SolverRunOptions } from "@/core/plugins/types";

export const collisionSolver: SolverPlugin<SolverRunOptions, AlgorithmStepMeta> = {
  id: "collision-solver",
  label: "Collision Solver",
  create(params) {
    return bidirectionalBfsSolver.create(params);
  },
};
