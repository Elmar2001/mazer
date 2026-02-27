import { create } from "zustand";

import type { GeneratorPluginId } from "@/core/plugins/generators";
import type { SolverPluginId } from "@/core/plugins/solvers";
import type { MazeMetrics, MazePhase } from "@/engine/types";
import {
  clampCellSize,
  clampGridHeight,
  clampGridWidth,
  clampSpeed,
} from "@/config/limits";
import { DEFAULT_COLOR_THEME, type ColorTheme } from "@/render/colorPresets";

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
  colorTheme: ColorTheme;
  wallThickness: number;
  showWallShadow: boolean;
  showCellInset: boolean;
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
  setColorTheme: (theme: ColorTheme) => void;
  setColorProperty: (key: keyof ColorTheme, value: string) => void;
  setWallThickness: (value: number) => void;
  setShowWallShadow: (value: boolean) => void;
  setShowCellInset: (value: boolean) => void;
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
  colorTheme: { ...DEFAULT_COLOR_THEME },
  wallThickness: 0.1,
  showWallShadow: true,
  showCellInset: true,
};

const DEFAULT_RUNTIME: MazeRuntime = {
  phase: "Idle",
  paused: true,
  metrics: { ...DEFAULT_METRICS },
  generatorActiveLine: null,
  solverActiveLine: null,
  solverBActiveLine: null,
};

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
        speed: clampSpeed(value),
      },
    })),
  setGridWidth: (value) =>
    set((state) => ({
      settings: {
        ...state.settings,
        gridWidth: clampGridWidth(
          value,
          state.settings.gridHeight,
          state.settings.cellSize,
        ),
      },
    })),
  setGridHeight: (value) =>
    set((state) => ({
      settings: {
        ...state.settings,
        gridHeight: clampGridHeight(
          value,
          state.settings.gridWidth,
          state.settings.cellSize,
        ),
      },
    })),
  setCellSize: (value) =>
    set((state) => ({
      settings: {
        ...state.settings,
        cellSize: clampCellSize(
          value,
          state.settings.gridWidth,
          state.settings.gridHeight,
        ),
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
  setColorTheme: (theme) =>
    set((state) => ({
      settings: {
        ...state.settings,
        colorTheme: theme,
      },
    })),
  setColorProperty: (key, value) =>
    set((state) => ({
      settings: {
        ...state.settings,
        colorTheme: {
          ...state.settings.colorTheme,
          [key]: value,
        },
      },
    })),
  setWallThickness: (value) =>
    set((state) => ({
      settings: {
        ...state.settings,
        wallThickness: Math.max(0.02, Math.min(0.3, value)),
      },
    })),
  setShowWallShadow: (value) =>
    set((state) => ({
      settings: {
        ...state.settings,
        showWallShadow: value,
      },
    })),
  setShowCellInset: (value) =>
    set((state) => ({
      settings: {
        ...state.settings,
        showCellInset: value,
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
