import type { SolverPlugin } from "@/core/plugins/SolverPlugin";
import { dfsSolver } from "@/core/plugins/solvers/dfs";
import type { AlgorithmStepMeta, SolverRunOptions } from "@/core/plugins/types";

export const tremauxSolver: SolverPlugin<SolverRunOptions, AlgorithmStepMeta> = {
  id: "tremaux",
  label: "Tremaux",
  create(params) {
    return dfsSolver.create(params);
  },
};
