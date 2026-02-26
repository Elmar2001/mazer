import { generatorPlugins } from "@/core/plugins/generators";
import { solverPlugins } from "@/core/plugins/solvers";

function buildAlgorithmOptions<
  T extends {
    id: string;
    label: string;
    implementationKind?: "native" | "alias" | "hybrid";
    aliasOf?: string;
  },
>(plugins: readonly T[]) {
  const labelsById = new Map(plugins.map((plugin) => [plugin.id, plugin.label]));

  return plugins.map((plugin) => {
    if (plugin.implementationKind === "alias" && plugin.aliasOf) {
      const aliasLabel = labelsById.get(plugin.aliasOf) ?? plugin.aliasOf;
      return {
        id: plugin.id,
        label: `${plugin.label} (alias of ${aliasLabel})`,
      };
    }

    if (plugin.implementationKind === "hybrid") {
      return {
        id: plugin.id,
        label: `${plugin.label} (hybrid)`,
      };
    }

    return {
      id: plugin.id,
      label: plugin.label,
    };
  });
}

export const GENERATOR_OPTIONS = buildAlgorithmOptions(generatorPlugins);

export const SOLVER_OPTIONS = buildAlgorithmOptions(solverPlugins);
