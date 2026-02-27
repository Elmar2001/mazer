export type PluginImplementationKind = "native" | "alias" | "hybrid";

export type PluginTier = "research-core" | "advanced" | "alias";

export type MazeTopology = "perfect-planar" | "loopy-planar" | "weave";

export type SolverGuarantee = "guaranteed" | "heuristic" | "incomplete";

export interface NumberGeneratorParamSchema {
  type: "number";
  key: string;
  label: string;
  description?: string;
  min: number;
  max: number;
  step?: number;
  defaultValue: number;
}

export interface BooleanGeneratorParamSchema {
  type: "boolean";
  key: string;
  label: string;
  description?: string;
  defaultValue: boolean;
}

export interface SelectGeneratorParamSchema {
  type: "select";
  key: string;
  label: string;
  description?: string;
  options: Array<{
    label: string;
    value: string;
  }>;
  defaultValue: string;
}

export type GeneratorParamSchema =
  | NumberGeneratorParamSchema
  | BooleanGeneratorParamSchema
  | SelectGeneratorParamSchema;

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
  generatorParamsSchema?: GeneratorParamSchema[];
}
