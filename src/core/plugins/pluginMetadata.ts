export type PluginImplementationKind = "native" | "alias" | "hybrid";

export interface PluginMetadata {
  implementationKind?: PluginImplementationKind;
  aliasOf?: string;
}
