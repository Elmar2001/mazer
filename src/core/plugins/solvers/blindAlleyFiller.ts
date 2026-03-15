import type { SolverPlugin } from "@/core/plugins/SolverPlugin";
import { deadEndFillingSolver } from "@/core/plugins/solvers/deadEndFilling";
import type { AlgorithmStepMeta, SolverRunOptions } from "@/core/plugins/types";

export const blindAlleyFillerSolver: SolverPlugin<
  SolverRunOptions,
  AlgorithmStepMeta
> = {
  id: "blind-alley-filler",
  label: "Blind Alley Filler (Dead-End Filling)",
  implementationKind: "alias",
  aliasOf: "dead-end-filling",
  create(params) {
    return deadEndFillingSolver.create(params);
  },
};
