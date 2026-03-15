import type { SolverPlugin } from "@/core/plugins/SolverPlugin";
import { leeWavefrontSolver } from "@/core/plugins/solvers/leeWavefront";
import type { AlgorithmStepMeta, SolverRunOptions } from "@/core/plugins/types";

export const floodFillSolver: SolverPlugin<SolverRunOptions, AlgorithmStepMeta> = {
  id: "flood-fill",
  label: "Flood Fill (Lee Wavefront)",
  implementationKind: "alias",
  aliasOf: "lee-wavefront",
  create(params) {
    return leeWavefrontSolver.create(params);
  },
};
