import { createCaRuleHybridGenerator } from "@/core/plugins/generators/caRuleHybrid";

export const mazectricCaGenerator = createCaRuleHybridGenerator({
  id: "mazectric-ca",
  label: "Mazectric CA (B3/S1234)",
  surviveMax: 4,
});
