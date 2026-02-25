"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type RefObject,
} from "react";

import { MazeEngine } from "@/engine/MazeEngine";
import { CanvasRenderer } from "@/render/CanvasRenderer";
import { DEFAULT_METRICS, type MazeRuntime, useMazeStore } from "@/ui/store/mazeStore";

export interface MazeControls {
  generate: () => void;
  solve: () => void;
  pauseResume: () => void;
  stepOnce: () => void;
  reset: () => void;
}

export interface UseMazeEngineResult {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  controls: MazeControls;
}

export function useMazeEngine(): UseMazeEngineResult {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<MazeEngine | null>(null);
  const rendererRef = useRef<CanvasRenderer | null>(null);
  const pendingRuntimeRef = useRef<Partial<MazeRuntime>>({});
  const runtimeRafRef = useRef<number | null>(null);

  const settings = useMazeStore((state) => state.settings);
  const setRuntimeSnapshot = useMazeStore((state) => state.setRuntimeSnapshot);
  const resetRuntime = useMazeStore((state) => state.resetRuntime);

  const queueRuntimeUpdate = useCallback(
    (next: Partial<MazeRuntime>) => {
      pendingRuntimeRef.current = {
        ...pendingRuntimeRef.current,
        ...next,
      };

      if (runtimeRafRef.current !== null) {
        return;
      }

      runtimeRafRef.current = requestAnimationFrame(() => {
        runtimeRafRef.current = null;
        setRuntimeSnapshot(pendingRuntimeRef.current);
        pendingRuntimeRef.current = {};
      });
    },
    [setRuntimeSnapshot],
  );

  useEffect(() => {
    const engine = new MazeEngine(
      {
        width: settings.gridWidth,
        height: settings.gridHeight,
        speed: settings.speed,
        seed: settings.seed,
        generatorId: settings.generatorId,
        solverId: settings.solverId,
        battleMode: settings.battleMode,
        solverBId: settings.solverBId,
      },
      {
        onPatchesApplied: (dirtyCells, _meta, metrics) => {
          rendererRef.current?.renderDirty(dirtyCells);
          queueRuntimeUpdate({ metrics });
        },
        onPhaseChange: (phase) => {
          const paused = phase !== "Generating" && phase !== "Solving";
          queueRuntimeUpdate({ phase, paused });
        },
        onGridRebuilt: (grid) => {
          rendererRef.current?.setGrid(grid);
        },
      },
    );

    engineRef.current = engine;

    if (canvasRef.current) {
      rendererRef.current = new CanvasRenderer(canvasRef.current, engine.getGrid(), {
        cellSize: settings.cellSize,
        showVisited: settings.showVisited,
        showFrontier: settings.showFrontier,
        showPath: settings.showPath,
      });
    }

    queueRuntimeUpdate({
      phase: engine.getPhase(),
      paused: true,
      metrics: engine.getMetrics(),
    });

    return () => {
      if (runtimeRafRef.current !== null) {
        cancelAnimationFrame(runtimeRafRef.current);
        runtimeRafRef.current = null;
      }

      rendererRef.current = null;
      engine.destroy();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!rendererRef.current && canvasRef.current && engineRef.current) {
      rendererRef.current = new CanvasRenderer(canvasRef.current, engineRef.current.getGrid(), {
        cellSize: settings.cellSize,
        showVisited: settings.showVisited,
        showFrontier: settings.showFrontier,
        showPath: settings.showPath,
      });
    }
  }, [settings.cellSize, settings.showFrontier, settings.showPath, settings.showVisited]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) {
      return;
    }

    engine.setOptions({
      seed: settings.seed,
      generatorId: settings.generatorId,
      solverId: settings.solverId,
      battleMode: settings.battleMode,
      solverBId: settings.solverBId,
      speed: settings.speed,
    });
    engine.setSpeed(settings.speed);
  }, [
    settings.battleMode,
    settings.generatorId,
    settings.seed,
    settings.solverBId,
    settings.solverId,
    settings.speed,
  ]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) {
      return;
    }

    engine.rebuildGrid(settings.gridWidth, settings.gridHeight);
    queueRuntimeUpdate({
      phase: "Idle",
      paused: true,
      metrics: { ...DEFAULT_METRICS },
    });
  }, [settings.gridHeight, settings.gridWidth, queueRuntimeUpdate]);

  useEffect(() => {
    rendererRef.current?.setSettings({
      cellSize: settings.cellSize,
      showVisited: settings.showVisited,
      showFrontier: settings.showFrontier,
      showPath: settings.showPath,
    });
  }, [settings.cellSize, settings.showFrontier, settings.showPath, settings.showVisited]);

  const syncEngineOptions = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) {
      return null;
    }

    const store = useMazeStore.getState().settings;
    engine.setOptions({
      width: store.gridWidth,
      height: store.gridHeight,
      speed: store.speed,
      seed: store.seed,
      generatorId: store.generatorId,
      solverId: store.solverId,
      battleMode: store.battleMode,
      solverBId: store.solverBId,
    });
    engine.setSpeed(store.speed);

    return engine;
  }, []);

  const controls = useMemo<MazeControls>(
    () => ({
      generate: () => {
        const engine = syncEngineOptions();
        if (!engine) {
          return;
        }

        engine.startGeneration();
        queueRuntimeUpdate({ paused: false, metrics: engine.getMetrics() });
      },
      solve: () => {
        const engine = syncEngineOptions();
        if (!engine) {
          return;
        }

        engine.startSolving();
        queueRuntimeUpdate({ paused: false, metrics: engine.getMetrics() });
      },
      pauseResume: () => {
        const engine = engineRef.current;
        if (!engine) {
          return;
        }

        const runtime = useMazeStore.getState().runtime;
        if (runtime.paused) {
          engine.resume();
          queueRuntimeUpdate({ paused: false });
          return;
        }

        engine.pause();
        queueRuntimeUpdate({ paused: true });
      },
      stepOnce: () => {
        const engine = engineRef.current;
        if (!engine) {
          return;
        }

        engine.pause();
        queueRuntimeUpdate({ paused: true });
        engine.stepOnce();
      },
      reset: () => {
        const engine = syncEngineOptions();
        if (!engine) {
          return;
        }

        engine.reset();
        resetRuntime();
      },
    }),
    [queueRuntimeUpdate, resetRuntime, syncEngineOptions],
  );

  return {
    canvasRef,
    controls,
  };
}
