import type { GeneratorParamSchema } from "@/core/plugins/pluginMetadata";
import type { GeneratorRunOptions } from "@/core/plugins/types";

export const DEFAULT_LOOP_DENSITY = 35;
export const LOOP_DENSITY_MIN = 0;
export const LOOP_DENSITY_MAX = 100;

export const LOOP_DENSITY_PARAM_SCHEMA: GeneratorParamSchema = {
  type: "number",
  key: "loopDensity",
  label: "Loop Density",
  description: "Higher values open more extra links and create more cycles.",
  min: LOOP_DENSITY_MIN,
  max: LOOP_DENSITY_MAX,
  step: 5,
  defaultValue: DEFAULT_LOOP_DENSITY,
};

export function parseLoopDensity(options: GeneratorRunOptions): number {
  const raw = options.loopDensity;
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return DEFAULT_LOOP_DENSITY;
  }

  return Math.max(LOOP_DENSITY_MIN, Math.min(LOOP_DENSITY_MAX, Math.round(raw)));
}
