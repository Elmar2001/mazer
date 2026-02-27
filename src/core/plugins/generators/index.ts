import type { GeneratorPlugin } from "@/core/plugins/GeneratorPlugin";
import type { StepMeta } from "@/core/patches";
import {
  type MazeTopology,
  type PluginTier,
} from "@/core/plugins/pluginMetadata";

import { aldousBroderGenerator } from "@/core/plugins/generators/aldousBroder";
import { bfsTreeGenerator } from "@/core/plugins/generators/bfsTree";
import { binaryTreeGenerator } from "@/core/plugins/generators/binaryTree";
import { blobbyRecursiveSubdivisionGenerator } from "@/core/plugins/generators/blobbyRecursiveSubdivision";
import { boruvkaGenerator } from "@/core/plugins/generators/boruvka";
import { braidGenerator } from "@/core/plugins/generators/braid";
import { bspGenerator } from "@/core/plugins/generators/bsp";
import { cellularAutomataGenerator } from "@/core/plugins/generators/cellularAutomata";
import { dfsBacktrackerGenerator } from "@/core/plugins/generators/dfsBacktracker";
import { ellerGenerator } from "@/core/plugins/generators/eller";
import { erosionGenerator } from "@/core/plugins/generators/erosion";
import { fractalTessellationGenerator } from "@/core/plugins/generators/fractalTessellation";
import { growingForestGenerator } from "@/core/plugins/generators/growingForest";
import { growingTreeGenerator } from "@/core/plugins/generators/growingTree";
import { houstonGenerator } from "@/core/plugins/generators/houston";
import { huntAndKillGenerator } from "@/core/plugins/generators/huntAndKill";
import { kruskalGenerator } from "@/core/plugins/generators/kruskal";
import { mazeCaGenerator } from "@/core/plugins/generators/mazeCa";
import { mazectricCaGenerator } from "@/core/plugins/generators/mazectricCa";
import { originShiftGenerator } from "@/core/plugins/generators/originShift";
import { primGenerator } from "@/core/plugins/generators/prim";
import { primFrontierEdgesGenerator } from "@/core/plugins/generators/primFrontierEdges";
import { primModifiedGenerator } from "@/core/plugins/generators/primModified";
import { primSimplifiedGenerator } from "@/core/plugins/generators/primSimplified";
import { primTrueGenerator } from "@/core/plugins/generators/primTrue";
import { resonantPhaseLockGenerator } from "@/core/plugins/generators/resonantPhaseLock";
import { recursiveDivisionGenerator } from "@/core/plugins/generators/recursiveDivision";
import { reverseDeleteGenerator } from "@/core/plugins/generators/reverseDelete";
import { sidewinderGenerator } from "@/core/plugins/generators/sidewinder";
import { unicursalGenerator } from "@/core/plugins/generators/unicursal";
import { vortexGenerator } from "@/core/plugins/generators/vortex";
import { weaveGrowingTreeGenerator } from "@/core/plugins/generators/weaveGrowingTree";
import { wilsonGenerator } from "@/core/plugins/generators/wilson";

const RESEARCH_CORE_GENERATORS = new Set<string>([
  "dfs-backtracker",
  "recursive-division",
  "prim",
  "prim-frontier-edges",
  "kruskal",
  "binary-tree",
  "sidewinder",
  "aldous-broder",
  "hunt-and-kill",
  "growing-tree",
  "eller",
  "houston",
  "wilson",
  "bsp",
  "blobby-recursive-subdivision",
  "fractal-tessellation",
  "maze-ca",
  "mazectric-ca",
  "braid",
  "weave-growing-tree",
  "erosion",
]);

const GENERATOR_TOPOLOGY: Record<string, MazeTopology> = {
  braid: "loopy-planar",
  "weave-growing-tree": "weave",
};

type AnyGeneratorPlugin = GeneratorPlugin<Record<string, unknown>, StepMeta>;

function withGeneratorMetadata<T extends AnyGeneratorPlugin>(plugin: T): T {
  const tier: PluginTier =
    plugin.implementationKind === "alias"
      ? "alias"
      : RESEARCH_CORE_GENERATORS.has(plugin.id)
        ? "research-core"
        : "advanced";

  const topologyOut = GENERATOR_TOPOLOGY[plugin.id] ?? "perfect-planar";

  return {
    ...plugin,
    tier,
    topologyOut,
  } as T;
}

export const generatorPlugins = [
  withGeneratorMetadata(dfsBacktrackerGenerator),
  withGeneratorMetadata(recursiveDivisionGenerator),
  withGeneratorMetadata(primGenerator),
  withGeneratorMetadata(primFrontierEdgesGenerator),
  withGeneratorMetadata(primTrueGenerator),
  withGeneratorMetadata(primSimplifiedGenerator),
  withGeneratorMetadata(primModifiedGenerator),
  withGeneratorMetadata(kruskalGenerator),
  withGeneratorMetadata(binaryTreeGenerator),
  withGeneratorMetadata(sidewinderGenerator),
  withGeneratorMetadata(aldousBroderGenerator),
  withGeneratorMetadata(huntAndKillGenerator),
  withGeneratorMetadata(growingTreeGenerator),
  withGeneratorMetadata(growingForestGenerator),
  withGeneratorMetadata(bfsTreeGenerator),
  withGeneratorMetadata(ellerGenerator),
  withGeneratorMetadata(houstonGenerator),
  withGeneratorMetadata(wilsonGenerator),
  withGeneratorMetadata(unicursalGenerator),
  withGeneratorMetadata(fractalTessellationGenerator),
  withGeneratorMetadata(cellularAutomataGenerator),
  withGeneratorMetadata(mazeCaGenerator),
  withGeneratorMetadata(mazectricCaGenerator),
  withGeneratorMetadata(bspGenerator),
  withGeneratorMetadata(blobbyRecursiveSubdivisionGenerator),
  withGeneratorMetadata(vortexGenerator),
  withGeneratorMetadata(originShiftGenerator),
  withGeneratorMetadata(reverseDeleteGenerator),
  withGeneratorMetadata(boruvkaGenerator),
  withGeneratorMetadata(resonantPhaseLockGenerator),
  withGeneratorMetadata(braidGenerator),
  withGeneratorMetadata(weaveGrowingTreeGenerator),
  withGeneratorMetadata(erosionGenerator),
] as const;

export type GeneratorPluginId = (typeof generatorPlugins)[number]["id"];
