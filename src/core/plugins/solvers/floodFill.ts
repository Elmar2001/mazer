import type { SolverPlugin } from "@/core/plugins/SolverPlugin";
import { leeWavefrontSolver } from "@/core/plugins/solvers/leeWavefront";
import type { AlgorithmStepMeta, SolverRunOptions } from "@/core/plugins/types";

export const floodFillSolver: SolverPlugin<SolverRunOptions, AlgorithmStepMeta> = {
  id: "flood-fill",
  label: "Flood Fill",
  create(params) {
    return leeWavefrontSolver.create(params);
  },
};
