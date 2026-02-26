import type { Grid } from "@/core/grid";
import type { StepMeta, StepResult } from "@/core/patches";
import type { PluginMetadata } from "@/core/plugins/pluginMetadata";
import type { RandomSource } from "@/core/rng";

export interface GeneratorCreateParams<TOptions extends object> {
  grid: Grid;
  rng: RandomSource;
  options: TOptions;
}

export interface GeneratorStepper<TMeta extends StepMeta = StepMeta> {
  step(): StepResult<TMeta>;
}

export interface GeneratorPlugin<
  TOptions extends object = Record<string, never>,
  TMeta extends StepMeta = StepMeta,
> extends PluginMetadata {
  id: string;
  label: string;
  create(params: GeneratorCreateParams<TOptions>): GeneratorStepper<TMeta>;
}
