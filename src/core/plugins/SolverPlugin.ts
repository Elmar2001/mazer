import type { Grid } from "@/core/grid";
import type { StepMeta, StepResult } from "@/core/patches";
import type { PluginMetadata } from "@/core/plugins/pluginMetadata";
import type { RandomSource } from "@/core/rng";

export interface SolverCreateParams<TOptions extends object> {
  grid: Grid;
  rng: RandomSource;
  options: TOptions;
}

export interface SolverStepper<TMeta extends StepMeta = StepMeta> {
  step(): StepResult<TMeta>;
}

export interface SolverPlugin<
  TOptions extends object = Record<string, never>,
  TMeta extends StepMeta = StepMeta,
> extends PluginMetadata {
  id: string;
  label: string;
  create(params: SolverCreateParams<TOptions>): SolverStepper<TMeta>;
}
