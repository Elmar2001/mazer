import type { SolverPlugin } from "@/core/plugins/SolverPlugin";
import { deadEndFillingSolver } from "@/core/plugins/solvers/deadEndFilling";
import type { AlgorithmStepMeta, SolverRunOptions } from "@/core/plugins/types";

export const culDeSacFillerSolver: SolverPlugin<
  SolverRunOptions,
  AlgorithmStepMeta
> = {
  id: "cul-de-sac-filler",
  label: "Cul-de-sac Filler",
  create(params) {
    return deadEndFillingSolver.create(params);
  },
};
