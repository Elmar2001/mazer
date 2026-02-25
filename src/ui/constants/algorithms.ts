import { generatorPlugins } from "@/core/plugins/generators";
import { solverPlugins } from "@/core/plugins/solvers";

export const GENERATOR_OPTIONS = generatorPlugins.map((plugin) => ({
  id: plugin.id,
  label: plugin.label,
}));

export const SOLVER_OPTIONS = solverPlugins.map((plugin) => ({
  id: plugin.id,
  label: plugin.label,
}));
