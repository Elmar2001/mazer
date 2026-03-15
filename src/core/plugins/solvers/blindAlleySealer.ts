import type { SolverPlugin } from "@/core/plugins/SolverPlugin";
import { deadEndFillingSolver } from "@/core/plugins/solvers/deadEndFilling";
import type { AlgorithmStepMeta, SolverRunOptions } from "@/core/plugins/types";

export const blindAlleySealerSolver: SolverPlugin<
  SolverRunOptions,
  AlgorithmStepMeta
> = {
  id: "blind-alley-sealer",
  label: "Blind Alley Sealer (Dead-End Filling)",
  implementationKind: "alias",
  aliasOf: "dead-end-filling",
  create(params) {
    return deadEndFillingSolver.create(params);
  },
};
