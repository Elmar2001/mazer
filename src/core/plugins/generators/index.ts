import { aldousBroderGenerator } from "@/core/plugins/generators/aldousBroder";
import { bfsTreeGenerator } from "@/core/plugins/generators/bfsTree";
import { binaryTreeGenerator } from "@/core/plugins/generators/binaryTree";
import { dfsBacktrackerGenerator } from "@/core/plugins/generators/dfsBacktracker";
import { ellerGenerator } from "@/core/plugins/generators/eller";
import { growingTreeGenerator } from "@/core/plugins/generators/growingTree";
import { huntAndKillGenerator } from "@/core/plugins/generators/huntAndKill";
import { kruskalGenerator } from "@/core/plugins/generators/kruskal";
import { primGenerator } from "@/core/plugins/generators/prim";
import { sidewinderGenerator } from "@/core/plugins/generators/sidewinder";
import { wilsonGenerator } from "@/core/plugins/generators/wilson";

export const generatorPlugins = [
  dfsBacktrackerGenerator,
  primGenerator,
  kruskalGenerator,
  binaryTreeGenerator,
  sidewinderGenerator,
  aldousBroderGenerator,
  huntAndKillGenerator,
  growingTreeGenerator,
  bfsTreeGenerator,
  ellerGenerator,
  wilsonGenerator,
] as const;

export type GeneratorPluginId = (typeof generatorPlugins)[number]["id"];
