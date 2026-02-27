import { createCaRuleHybridGenerator } from "@/core/plugins/generators/caRuleHybrid";

export const mazeCaGenerator = createCaRuleHybridGenerator({
  id: "maze-ca",
  label: "Maze CA (B3/S12345)",
  surviveMax: 5,
});
