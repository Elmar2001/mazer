import { describe, expect, it } from "vitest";

import { generatorPlugins } from "@/core/plugins/generators";
import { solverPlugins } from "@/core/plugins/solvers";
import { ALGORITHM_DOCS } from "@/ui/docs/algorithmDocs";
import { GENERATOR_PSEUDOCODE } from "@/ui/docs/generatorPseudocode";
import { SOLVER_PSEUDOCODE } from "@/ui/docs/solverPseudocode";

describe("algorithm catalog coverage", () => {
  it("documents every registered generator and solver plugin", () => {
    const docsById = new Set(ALGORITHM_DOCS.map((doc) => doc.id));

    for (const plugin of generatorPlugins) {
      expect(docsById.has(plugin.id)).toBe(true);
    }

    for (const plugin of solverPlugins) {
      expect(docsById.has(plugin.id)).toBe(true);
    }
  });

  it("does not contain stale algorithm docs ids", () => {
    const pluginIds = new Set([
      ...generatorPlugins.map((plugin) => plugin.id),
      ...solverPlugins.map((plugin) => plugin.id),
    ]);

    for (const doc of ALGORITHM_DOCS) {
      expect(pluginIds.has(doc.id)).toBe(true);
    }
  });

  it("has pseudocode entries for every plugin", () => {
    const generatorPseudoIds = new Set(Object.keys(GENERATOR_PSEUDOCODE));
    const solverPseudoIds = new Set(Object.keys(SOLVER_PSEUDOCODE));

    for (const plugin of generatorPlugins) {
      expect(generatorPseudoIds.has(plugin.id)).toBe(true);
    }

    for (const plugin of solverPlugins) {
      expect(solverPseudoIds.has(plugin.id)).toBe(true);
    }
  });
});
