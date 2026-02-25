import type { SolverPlugin } from "@/core/plugins/SolverPlugin";
import { bidirectionalBfsSolver } from "@/core/plugins/solvers/bidirectionalBfs";
import type { AlgorithmStepMeta, SolverRunOptions } from "@/core/plugins/types";

export const chainSolver: SolverPlugin<SolverRunOptions, AlgorithmStepMeta> = {
  id: "chain",
  label: "Chain",
  create(params) {
    return bidirectionalBfsSolver.create(params);
  },
};
