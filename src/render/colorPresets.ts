export interface ColorTheme {
  background: string;
  cellA: string;
  cellB: string;
  cellInset: string;
  wallShadow: string;
  wall: string;
  visitedA: string;
  visitedB: string;
  frontierA: string;
  frontierB: string;
  pathA: string;
  pathB: string;
  start: string;
  goal: string;
  endpointStroke: string;
  currentRingA: string;
  currentRingB: string;
}

export const DEFAULT_COLOR_THEME: ColorTheme = {
  background: "#060a11",
  cellA: "#121a27",
  cellB: "#172233",
  cellInset: "rgba(255, 255, 255, 0.02)",
  wallShadow: "#02060f",
  wall: "#e2e8f0",
  visitedA: "rgba(56, 189, 248, 0.30)",
  visitedB: "rgba(244, 114, 182, 0.32)",
  frontierA: "rgba(250, 204, 21, 0.42)",
  frontierB: "rgba(251, 113, 133, 0.52)",
  pathA: "rgba(16, 185, 129, 0.76)",
  pathB: "rgba(249, 115, 22, 0.75)",
  start: "#22d3ee",
  goal: "#fb7185",
  endpointStroke: "rgba(241, 245, 249, 0.9)",
  currentRingA: "rgba(186, 230, 253, 0.95)",
  currentRingB: "rgba(253, 186, 116, 0.95)",
};

const OCEAN: ColorTheme = {
  background: "#020c1b",
  cellA: "#0a192f",
  cellB: "#0d1f3c",
  cellInset: "rgba(100, 200, 255, 0.03)",
  wallShadow: "#010812",
  wall: "#64ffda",
  visitedA: "rgba(0, 188, 212, 0.28)",
  visitedB: "rgba(128, 203, 196, 0.30)",
  frontierA: "rgba(0, 150, 199, 0.45)",
  frontierB: "rgba(77, 182, 172, 0.50)",
  pathA: "rgba(0, 230, 118, 0.72)",
  pathB: "rgba(3, 218, 198, 0.70)",
  start: "#00e5ff",
  goal: "#ff6e40",
  endpointStroke: "rgba(200, 230, 255, 0.9)",
  currentRingA: "rgba(128, 222, 234, 0.92)",
  currentRingB: "rgba(255, 171, 145, 0.92)",
};

const FOREST: ColorTheme = {
  background: "#071108",
  cellA: "#0f1f10",
  cellB: "#142816",
  cellInset: "rgba(180, 255, 180, 0.02)",
  wallShadow: "#030805",
  wall: "#a7c4a0",
  visitedA: "rgba(76, 175, 80, 0.30)",
  visitedB: "rgba(174, 213, 129, 0.32)",
  frontierA: "rgba(205, 220, 57, 0.42)",
  frontierB: "rgba(255, 235, 59, 0.48)",
  pathA: "rgba(129, 199, 132, 0.76)",
  pathB: "rgba(255, 183, 77, 0.72)",
  start: "#69f0ae",
  goal: "#ff7043",
  endpointStroke: "rgba(220, 237, 200, 0.9)",
  currentRingA: "rgba(165, 214, 167, 0.92)",
  currentRingB: "rgba(255, 204, 128, 0.92)",
};

const NEON: ColorTheme = {
  background: "#0a0a0a",
  cellA: "#141414",
  cellB: "#1a1a1a",
  cellInset: "rgba(255, 255, 255, 0.02)",
  wallShadow: "#050505",
  wall: "#e040fb",
  visitedA: "rgba(0, 229, 255, 0.35)",
  visitedB: "rgba(255, 61, 0, 0.35)",
  frontierA: "rgba(118, 255, 3, 0.48)",
  frontierB: "rgba(255, 214, 0, 0.50)",
  pathA: "rgba(234, 128, 252, 0.80)",
  pathB: "rgba(255, 145, 0, 0.78)",
  start: "#00e5ff",
  goal: "#ff1744",
  endpointStroke: "rgba(255, 255, 255, 0.95)",
  currentRingA: "rgba(130, 177, 255, 0.95)",
  currentRingB: "rgba(255, 128, 171, 0.95)",
};

const WARM: ColorTheme = {
  background: "#110a06",
  cellA: "#1f1410",
  cellB: "#271a14",
  cellInset: "rgba(255, 200, 150, 0.03)",
  wallShadow: "#0a0503",
  wall: "#ffb74d",
  visitedA: "rgba(255, 138, 101, 0.32)",
  visitedB: "rgba(255, 183, 77, 0.30)",
  frontierA: "rgba(255, 213, 79, 0.45)",
  frontierB: "rgba(255, 167, 38, 0.48)",
  pathA: "rgba(255, 112, 67, 0.78)",
  pathB: "rgba(255, 202, 40, 0.75)",
  start: "#ffab40",
  goal: "#ef5350",
  endpointStroke: "rgba(255, 236, 179, 0.9)",
  currentRingA: "rgba(255, 204, 128, 0.92)",
  currentRingB: "rgba(239, 154, 154, 0.92)",
};

const MONOCHROME: ColorTheme = {
  background: "#080808",
  cellA: "#151515",
  cellB: "#1c1c1c",
  cellInset: "rgba(255, 255, 255, 0.02)",
  wallShadow: "#040404",
  wall: "#e0e0e0",
  visitedA: "rgba(189, 189, 189, 0.25)",
  visitedB: "rgba(158, 158, 158, 0.28)",
  frontierA: "rgba(224, 224, 224, 0.38)",
  frontierB: "rgba(200, 200, 200, 0.42)",
  pathA: "rgba(255, 255, 255, 0.72)",
  pathB: "rgba(200, 200, 200, 0.68)",
  start: "#ffffff",
  goal: "#9e9e9e",
  endpointStroke: "rgba(255, 255, 255, 0.9)",
  currentRingA: "rgba(224, 224, 224, 0.92)",
  currentRingB: "rgba(176, 176, 176, 0.92)",
};

export const COLOR_PRESETS: Record<string, ColorTheme> = {
  Default: DEFAULT_COLOR_THEME,
  Ocean: OCEAN,
  Forest: FOREST,
  Neon: NEON,
  Warm: WARM,
  Monochrome: MONOCHROME,
};

function hslToHex(h: number, s: number, l: number): string {
  const hNorm = ((h % 360) + 360) % 360;
  const sNorm = Math.max(0, Math.min(1, s));
  const lNorm = Math.max(0, Math.min(1, l));

  const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
  const x = c * (1 - Math.abs(((hNorm / 60) % 2) - 1));
  const m = lNorm - c / 2;

  let r = 0, g = 0, b = 0;
  if (hNorm < 60) { r = c; g = x; }
  else if (hNorm < 120) { r = x; g = c; }
  else if (hNorm < 180) { g = c; b = x; }
  else if (hNorm < 240) { g = x; b = c; }
  else if (hNorm < 300) { r = x; b = c; }
  else { r = c; b = x; }

  const toHex = (v: number) => {
    const hex = Math.round((v + m) * 255).toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  };

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hslToRgba(h: number, s: number, l: number, a: number): string {
  const hNorm = ((h % 360) + 360) % 360;
  const sNorm = Math.max(0, Math.min(1, s));
  const lNorm = Math.max(0, Math.min(1, l));

  const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
  const x = c * (1 - Math.abs(((hNorm / 60) % 2) - 1));
  const m = lNorm - c / 2;

  let r = 0, g = 0, b = 0;
  if (hNorm < 60) { r = c; g = x; }
  else if (hNorm < 120) { r = x; g = c; }
  else if (hNorm < 180) { g = c; b = x; }
  else if (hNorm < 240) { g = x; b = c; }
  else if (hNorm < 300) { r = x; b = c; }
  else { r = c; b = x; }

  return `rgba(${Math.round((r + m) * 255)}, ${Math.round((g + m) * 255)}, ${Math.round((b + m) * 255)}, ${a})`;
}

export function randomizeTheme(): ColorTheme {
  const base = Math.random() * 360;

  return {
    background: hslToHex(base, 0.3, 0.04),
    cellA: hslToHex(base, 0.25, 0.09),
    cellB: hslToHex(base, 0.22, 0.12),
    cellInset: hslToRgba(base, 0.15, 0.5, 0.02),
    wallShadow: hslToHex(base, 0.3, 0.02),
    wall: hslToHex(base + 20, 0.15, 0.88),
    visitedA: hslToRgba(base + 180, 0.75, 0.55, 0.30),
    visitedB: hslToRgba(base + 240, 0.65, 0.55, 0.32),
    frontierA: hslToRgba(base + 60, 0.85, 0.55, 0.42),
    frontierB: hslToRgba(base + 120, 0.70, 0.55, 0.48),
    pathA: hslToRgba(base + 150, 0.70, 0.50, 0.76),
    pathB: hslToRgba(base + 30, 0.80, 0.55, 0.75),
    start: hslToHex(base + 180, 0.85, 0.58),
    goal: hslToHex(base + 330, 0.80, 0.62),
    endpointStroke: hslToRgba(base, 0.15, 0.95, 0.9),
    currentRingA: hslToRgba(base + 180, 0.70, 0.85, 0.95),
    currentRingB: hslToRgba(base + 30, 0.75, 0.72, 0.95),
  };
}
