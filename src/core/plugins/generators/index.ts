import { aldousBroderGenerator } from "@/core/plugins/generators/aldousBroder";
import { bfsTreeGenerator } from "@/core/plugins/generators/bfsTree";
import { binaryTreeGenerator } from "@/core/plugins/generators/binaryTree";
import { blobbyRecursiveSubdivisionGenerator } from "@/core/plugins/generators/blobbyRecursiveSubdivision";
import { boruvkaGenerator } from "@/core/plugins/generators/boruvka";
import { bspGenerator } from "@/core/plugins/generators/bsp";
import { cellularAutomataGenerator } from "@/core/plugins/generators/cellularAutomata";
import { dfsBacktrackerGenerator } from "@/core/plugins/generators/dfsBacktracker";
import { ellerGenerator } from "@/core/plugins/generators/eller";
import { fractalTessellationGenerator } from "@/core/plugins/generators/fractalTessellation";
import { growingForestGenerator } from "@/core/plugins/generators/growingForest";
import { growingTreeGenerator } from "@/core/plugins/generators/growingTree";
import { houstonGenerator } from "@/core/plugins/generators/houston";
import { huntAndKillGenerator } from "@/core/plugins/generators/huntAndKill";
import { kruskalGenerator } from "@/core/plugins/generators/kruskal";
import { originShiftGenerator } from "@/core/plugins/generators/originShift";
import { primGenerator } from "@/core/plugins/generators/prim";
import { primFrontierEdgesGenerator } from "@/core/plugins/generators/primFrontierEdges";
import { primModifiedGenerator } from "@/core/plugins/generators/primModified";
import { primSimplifiedGenerator } from "@/core/plugins/generators/primSimplified";
import { primTrueGenerator } from "@/core/plugins/generators/primTrue";
import { recursiveDivisionGenerator } from "@/core/plugins/generators/recursiveDivision";
import { reverseDeleteGenerator } from "@/core/plugins/generators/reverseDelete";
import { sidewinderGenerator } from "@/core/plugins/generators/sidewinder";
import { unicursalGenerator } from "@/core/plugins/generators/unicursal";
import { vortexGenerator } from "@/core/plugins/generators/vortex";
import { wilsonGenerator } from "@/core/plugins/generators/wilson";

export const generatorPlugins = [
  dfsBacktrackerGenerator,
  recursiveDivisionGenerator,
  primGenerator,
  primFrontierEdgesGenerator,
  primTrueGenerator,
  primSimplifiedGenerator,
  primModifiedGenerator,
  kruskalGenerator,
  binaryTreeGenerator,
  sidewinderGenerator,
  aldousBroderGenerator,
  huntAndKillGenerator,
  growingTreeGenerator,
  growingForestGenerator,
  bfsTreeGenerator,
  ellerGenerator,
  houstonGenerator,
  wilsonGenerator,
  unicursalGenerator,
  fractalTessellationGenerator,
  cellularAutomataGenerator,
  bspGenerator,
  blobbyRecursiveSubdivisionGenerator,
  vortexGenerator,
  originShiftGenerator,
  reverseDeleteGenerator,
  boruvkaGenerator,
] as const;

export type GeneratorPluginId = (typeof generatorPlugins)[number]["id"];
