import type { Grid } from "@/core/grid";
import type { CellPatch, StepMeta } from "@/core/patches";
import type { GeneratorPluginId } from "@/core/plugins/generators";
import type { SolverPluginId } from "@/core/plugins/solvers";

export type MazePhase =
  | "Idle"
  | "Generating"
  | "Generated"
  | "Solving"
  | "Solved";

export interface MazeMetrics {
  stepCount: number;
  visitedCount: number;
  frontierSize: number;
  pathLength: number;
  elapsedMs: number;
  computeMs: number;
  engineUtilizationPct: number;
  actualStepsPerSec: number;
  patchCount: number;
  dirtyCellCount: number;
  avgPatchesPerStep: number;
  avgDirtyCellsPerStep: number;
  battle: SolverBattleMetrics | null;
}

export interface SolverRunMetrics {
  id: SolverPluginId;
  label: string;
  activeLine: number | null;
  stepCount: number;
  visitedCount: number;
  frontierSize: number;
  pathLength: number;
  elapsedMs: number;
  computeMs: number;
  actualStepsPerSec: number;
  patchCount: number;
  dirtyCellCount: number;
  avgPatchesPerStep: number;
  avgDirtyCellsPerStep: number;
  solved: boolean;
  done: boolean;
}

export interface SolverBattleMetrics {
  enabled: boolean;
  solverA: SolverRunMetrics;
  solverB: SolverRunMetrics;
}

export interface MazeEngineOptions {
  width: number;
  height: number;
  speed: number;
  seed: string;
  generatorId: GeneratorPluginId;
  solverId: SolverPluginId;
  battleMode: boolean;
  solverBId: SolverPluginId;
  generatorParams?: Record<string, number | string | boolean>;
  solverParams?: Record<string, number | string | boolean>;
}

export interface MazeEngineCallbacks {
  onPatchesApplied?: (
    dirtyCells: number[],
    patches: CellPatch[],
    meta: StepMeta | undefined,
    metrics: MazeMetrics,
  ) => void;
  onPhaseChange?: (phase: MazePhase) => void;
  onGridRebuilt?: (grid: Grid) => void;
}

export interface MazeEnginePublicApi {
  getGrid(): Grid;
  getPhase(): MazePhase;
  getMetrics(): MazeMetrics;
  getOptions(): MazeEngineOptions;
  startGeneration(): void;
  startSolving(): void;
  pause(): void;
  resume(): void;
  stepOnce(): void;
  reset(): void;
  setSpeed(stepsPerSecond: number): void;
  setOptions(options: Partial<MazeEngineOptions>): void;
  rebuildGrid(width: number, height: number): void;
  setCallbacks(callbacks: MazeEngineCallbacks): void;
  destroy(): void;
}
