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
  implementationKind: "alias",
  aliasOf: "prim-frontier-edges",
  create(params) {
    return primFrontierEdgesGenerator.create(params);
  },
};
