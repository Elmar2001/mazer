import { generatorPlugins } from "@/core/plugins/generators";
import { solverPlugins } from "@/core/plugins/solvers";
import { appendInventorLabel } from "@/ui/constants/llmAttribution";
import type {
  GeneratorParamSchema,
  MazeTopology,
  PluginTier,
  SolverCompatibility,
} from "@/core/plugins/pluginMetadata";

export interface GeneratorOption {
  id: (typeof generatorPlugins)[number]["id"];
  label: string;
  group: "Research Core" | "Advanced" | "Aliases";
  tier: PluginTier;
  implementationKind?: "native" | "alias" | "hybrid";
  aliasOf?: string;
  topologyOut: MazeTopology;
  generatorParamsSchema: GeneratorParamSchema[];
}

export interface SolverOption {
  id: (typeof solverPlugins)[number]["id"];
  label: string;
  group: "Research Core" | "Advanced" | "Aliases";
  tier: PluginTier;
  implementationKind?: "native" | "alias" | "hybrid";
  aliasOf?: string;
  solverCompatibility: SolverCompatibility;
}

const GENERATOR_BY_ID = new Map(
  generatorPlugins.map((plugin) => [plugin.id, plugin]),
);

const SOLVER_BY_ID = new Map(solverPlugins.map((plugin) => [plugin.id, plugin]));

function tierToGroup(tier: PluginTier): "Research Core" | "Advanced" | "Aliases" {
  if (tier === "alias") {
    return "Aliases";
  }

  if (tier === "advanced") {
    return "Advanced";
  }

  return "Research Core";
}

function annotateGeneratorLabel(
  plugin: (typeof generatorPlugins)[number],
): string {
  let baseLabel = plugin.label;

  if (plugin.implementationKind === "alias" && plugin.aliasOf) {
    const aliasLabel = GENERATOR_BY_ID.get(plugin.aliasOf)?.label ?? plugin.aliasOf;
    baseLabel = `${plugin.label} (alias of ${aliasLabel})`;
  }
  if (plugin.implementationKind === "hybrid") {
    baseLabel = `${plugin.label} (hybrid)`;
  }

  return appendInventorLabel(baseLabel, plugin.id);
}

function annotateSolverLabel(plugin: (typeof solverPlugins)[number]): string {
  let baseLabel = plugin.label;

  if (plugin.implementationKind === "alias" && plugin.aliasOf) {
    const aliasLabel = SOLVER_BY_ID.get(plugin.aliasOf)?.label ?? plugin.aliasOf;
    baseLabel = `${plugin.label} (alias of ${aliasLabel})`;
  }
  if (plugin.implementationKind === "hybrid") {
    baseLabel = `${plugin.label} (hybrid)`;
  }

  return appendInventorLabel(baseLabel, plugin.id);
}

export const GENERATOR_OPTIONS: GeneratorOption[] = generatorPlugins.map((plugin) => ({
  id: plugin.id,
  label: annotateGeneratorLabel(plugin),
  group: tierToGroup(plugin.tier ?? "research-core"),
  tier: plugin.tier ?? "research-core",
  implementationKind: plugin.implementationKind,
  aliasOf: plugin.aliasOf,
  topologyOut: plugin.topologyOut ?? "perfect-planar",
  generatorParamsSchema: plugin.generatorParamsSchema ?? [],
}));

export const SOLVER_OPTIONS: SolverOption[] = solverPlugins.map((plugin) => ({
  id: plugin.id,
  label: annotateSolverLabel(plugin),
  group: tierToGroup(plugin.tier ?? "research-core"),
  tier: plugin.tier ?? "research-core",
  implementationKind: plugin.implementationKind,
  aliasOf: plugin.aliasOf,
  solverCompatibility: plugin.solverCompatibility ?? {
    topologies: ["perfect-planar", "loopy-planar", "weave"],
    guarantee: "heuristic",
  },
}));

export function getGeneratorTopology(generatorId: string): MazeTopology {
  return (
    GENERATOR_OPTIONS.find((option) => option.id === generatorId)?.topologyOut ??
    "perfect-planar"
  );
}

export function getCompatibleSolverOptions(topology: MazeTopology): SolverOption[] {
  return SOLVER_OPTIONS.filter((option) =>
    option.solverCompatibility.topologies.includes(topology),
  );
}
