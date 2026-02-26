import type { GeneratorPlugin } from "@/core/plugins/GeneratorPlugin";
import { primGenerator } from "@/core/plugins/generators/prim";
import type {
  AlgorithmStepMeta,
  GeneratorRunOptions,
} from "@/core/plugins/types";

export const primSimplifiedGenerator: GeneratorPlugin<
  GeneratorRunOptions,
  AlgorithmStepMeta
> = {
  id: "prim-simplified",
  label: "Prim (Simplified)",
  implementationKind: "alias",
  aliasOf: "prim",
  create(params) {
    return primGenerator.create(params);
  },
};
