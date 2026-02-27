export type PluginImplementationKind = "native" | "alias" | "hybrid";

export type PluginTier = "research-core" | "advanced" | "alias";

export type MazeTopology = "perfect-planar" | "loopy-planar" | "weave";

export type SolverGuarantee = "guaranteed" | "heuristic" | "incomplete";

export interface SolverCompatibility {
  topologies: MazeTopology[];
  guarantee: SolverGuarantee;
}

export interface PluginMetadata {
  implementationKind?: PluginImplementationKind;
  aliasOf?: string;
  tier?: PluginTier;
  topologyOut?: MazeTopology;
  solverCompatibility?: SolverCompatibility;
}
