import type { GeneratorPlugin } from "@/core/plugins/GeneratorPlugin";
import { primFrontierEdgesGenerator } from "@/core/plugins/generators/primFrontierEdges";
import type {
  AlgorithmStepMeta,
  GeneratorRunOptions,
} from "@/core/plugins/types";

export const primTrueGenerator: GeneratorPlugin<
  GeneratorRunOptions,
  AlgorithmStepMeta
> = {
  id: "prim-true",
  label: "Prim (True Frontier Edges)",
  create(params) {
    return primFrontierEdgesGenerator.create(params);
  },
};
