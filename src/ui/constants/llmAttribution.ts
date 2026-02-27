export type LlmInventor = "Codex" | "Claude" | "Gemini";

const ALGORITHM_INVENTOR_BY_ID: Readonly<Record<string, LlmInventor>> = {
  "resonant-phase-lock": "Codex",
  erosion: "Claude",
  "quantum-seismogenesis": "Gemini",
  "mycelial-anastomosis": "Gemini",
  "sandpile-avalanche": "Claude",
  "counterfactual-cycle-annealing": "Codex",
};

export function getAlgorithmInventor(id: string): LlmInventor | undefined {
  return ALGORITHM_INVENTOR_BY_ID[id];
}

export function appendInventorLabel(label: string, id: string): string {
  const inventor = getAlgorithmInventor(id);
  if (!inventor) {
    return label;
  }

  return `${label} (${inventor})`;
}
