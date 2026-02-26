import { create } from "zustand";

import type { GeneratorPluginId } from "@/core/plugins/generators";
import type { SolverPluginId } from "@/core/plugins/solvers";
import type { MazeMetrics, MazePhase } from "@/engine/types";
import { SPEED_MAX, SPEED_MIN } from "@/config/limits";

export interface MazeSettings {
  generatorId: GeneratorPluginId;
  solverId: SolverPluginId;
  solverBId: SolverPluginId;
  battleMode: boolean;
  speed: number;
  gridWidth: number;
  gridHeight: number;
  cellSize: number;
  seed: string;
  showVisited: boolean;
  showFrontier: boolean;
  showPath: boolean;
}

export interface MazeUI {
  sidebarCollapsed: boolean;
  showMetricsHud: boolean;
  showTraceHud: boolean;
  metricsExpanded: boolean;
}

export interface MazeRuntime {
  phase: MazePhase;
  paused: boolean;
  metrics: MazeMetrics;
  generatorActiveLine: number | null;
  solverActiveLine: number | null;
  solverBActiveLine: number | null;
}

interface MazeStore {
  settings: MazeSettings;
  runtime: MazeRuntime;
  ui: MazeUI;
  setGeneratorId: (id: GeneratorPluginId) => void;
  setSolverId: (id: SolverPluginId) => void;
  setSolverBId: (id: SolverPluginId) => void;
  setBattleMode: (value: boolean) => void;
  setSpeed: (value: number) => void;
  setGridWidth: (value: number) => void;
  setGridHeight: (value: number) => void;
  setCellSize: (value: number) => void;
  setSeed: (seed: string) => void;
  setShowVisited: (value: boolean) => void;
  setShowFrontier: (value: boolean) => void;
  setShowPath: (value: boolean) => void;
  setRuntimeSnapshot: (snapshot: Partial<MazeRuntime>) => void;
  resetRuntime: () => void;
  toggleSidebar: () => void;
  toggleMetricsHud: () => void;
  toggleTraceHud: () => void;
  toggleMetricsExpanded: () => void;
}

export const DEFAULT_METRICS: MazeMetrics = {
  stepCount: 0,
  visitedCount: 0,
  frontierSize: 0,
  pathLength: 0,
  elapsedMs: 0,
  computeMs: 0,
  engineUtilizationPct: 0,
  actualStepsPerSec: 0,
  patchCount: 0,
  dirtyCellCount: 0,
  avgPatchesPerStep: 0,
  avgDirtyCellsPerStep: 0,
  battle: null,
};

const DEFAULT_SETTINGS: MazeSettings = {
  generatorId: "dfs-backtracker",
  solverId: "bfs",
  solverBId: "astar",
  battleMode: false,
  speed: 60,
  gridWidth: 40,
  gridHeight: 25,
  cellSize: 16,
  seed: "mazer",
  showVisited: true,
  showFrontier: true,
  showPath: true,
};

const DEFAULT_RUNTIME: MazeRuntime = {
  phase: "Idle",
  paused: true,
  metrics: { ...DEFAULT_METRICS },
  generatorActiveLine: null,
  solverActiveLine: null,
  solverBActiveLine: null,
};

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) {
    return min;
  }

  return Math.max(min, Math.min(max, value));
}

const DEFAULT_UI: MazeUI = {
  sidebarCollapsed: false,
  showMetricsHud: true,
  showTraceHud: true,
  metricsExpanded: false,
};

export const useMazeStore = create<MazeStore>((set) => ({
  settings: { ...DEFAULT_SETTINGS },
  runtime: { ...DEFAULT_RUNTIME },
  ui: { ...DEFAULT_UI },
  setGeneratorId: (id) =>
    set((state) => ({
      settings: {
        ...state.settings,
        generatorId: id,
      },
    })),
  setSolverId: (id) =>
    set((state) => ({
      settings: {
        ...state.settings,
        solverId: id,
      },
    })),
  setSolverBId: (id) =>
    set((state) => ({
      settings: {
        ...state.settings,
        solverBId: id,
      },
    })),
  setBattleMode: (value) =>
    set((state) => ({
      settings: {
        ...state.settings,
        battleMode: value,
      },
    })),
  setSpeed: (value) =>
    set((state) => ({
      settings: {
        ...state.settings,
        speed: clamp(Math.floor(value), SPEED_MIN, SPEED_MAX),
      },
    })),
  setGridWidth: (value) =>
    set((state) => ({
      settings: {
        ...state.settings,
        gridWidth: clamp(Math.floor(value), 2, 120),
      },
    })),
  setGridHeight: (value) =>
    set((state) => ({
      settings: {
        ...state.settings,
        gridHeight: clamp(Math.floor(value), 2, 120),
      },
    })),
  setCellSize: (value) =>
    set((state) => ({
      settings: {
        ...state.settings,
        cellSize: clamp(Math.floor(value), 6, 32),
      },
    })),
  setSeed: (seed) =>
    set((state) => ({
      settings: {
        ...state.settings,
        seed,
      },
    })),
  setShowVisited: (value) =>
    set((state) => ({
      settings: {
        ...state.settings,
        showVisited: value,
      },
    })),
  setShowFrontier: (value) =>
    set((state) => ({
      settings: {
        ...state.settings,
        showFrontier: value,
      },
    })),
  setShowPath: (value) =>
    set((state) => ({
      settings: {
        ...state.settings,
        showPath: value,
      },
    })),
  setRuntimeSnapshot: (snapshot) =>
    set((state) => ({
      runtime: {
        ...state.runtime,
        ...snapshot,
      },
    })),
  resetRuntime: () =>
    set(() => ({
      runtime: {
        phase: "Idle",
        paused: true,
        metrics: { ...DEFAULT_METRICS },
        generatorActiveLine: null,
        solverActiveLine: null,
        solverBActiveLine: null,
      },
    })),
  toggleSidebar: () =>
    set((state) => ({
      ui: { ...state.ui, sidebarCollapsed: !state.ui.sidebarCollapsed },
    })),
  toggleMetricsHud: () =>
    set((state) => ({
      ui: { ...state.ui, showMetricsHud: !state.ui.showMetricsHud },
    })),
  toggleTraceHud: () =>
    set((state) => ({
      ui: { ...state.ui, showTraceHud: !state.ui.showTraceHud },
    })),
  toggleMetricsExpanded: () =>
    set((state) => ({
      ui: { ...state.ui, metricsExpanded: !state.ui.metricsExpanded },
    })),
}));
