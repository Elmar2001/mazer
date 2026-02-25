import type { SolverPlugin } from "@/core/plugins/SolverPlugin";
import { wallFollowerSolver } from "@/core/plugins/solvers/wallFollower";
import type { AlgorithmStepMeta, SolverRunOptions } from "@/core/plugins/types";

export const pledgeSolver: SolverPlugin<SolverRunOptions, AlgorithmStepMeta> = {
  id: "pledge",
  label: "Pledge Algorithm",
  create(params) {
    return wallFollowerSolver.create(params);
  },
};
