"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type RefObject,
} from "react";

import { applyCellPatch, type Grid } from "@/core/grid";
import type { MazeEngineOptions } from "@/engine/types";
import {
  deserializeGridSnapshot,
  type MazeWorkerCommand,
  type MazeWorkerEvent,
} from "@/engine/mazeWorkerProtocol";
import {
  createMazeWorkerRuntime,
  type MazeWorkerRuntime,
} from "@/engine/mazeWorkerRuntime";
import { CanvasRenderer } from "@/render/CanvasRenderer";
import {
  DEFAULT_METRICS,
  type MazeRuntime,
  type MazeSettings,
  useMazeStore,
} from "@/ui/store/mazeStore";

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

type MazeTransport =
  | {
    kind: "worker";
    worker: Worker;
  }
  | {
    kind: "fallback";
    runtime: MazeWorkerRuntime;
  };

function toEngineOptions(settings: MazeSettings): MazeEngineOptions {
  return {
    width: settings.gridWidth,
    height: settings.gridHeight,
    speed: settings.speed,
    seed: settings.seed,
    generatorId: settings.generatorId,
    solverId: settings.solverId,
    battleMode: settings.battleMode,
    solverBId: settings.solverBId,
    generatorParams: settings.generatorParams,
    solverParams: settings.solverParams,
  };
}

function toRendererSettings(settings: MazeSettings) {
  return {
    cellSize: settings.cellSize,
    showVisited: settings.showVisited,
    showFrontier: settings.showFrontier,
    showPath: settings.showPath,
    colors: settings.colorTheme,
    wallThickness: settings.wallThickness,
    showWallShadow: settings.showWallShadow,
    showCellInset: settings.showCellInset,
  };
}

function sendCommand(
  transport: MazeTransport | null,
  command: MazeWorkerCommand,
): void {
  if (!transport) {
    return;
  }

  if (transport.kind === "worker") {
    transport.worker.postMessage(command);
    return;
  }

  transport.runtime.handleCommand(command);
}

export function useMazeEngine(): UseMazeEngineResult {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const transportRef = useRef<MazeTransport | null>(null);
  const rendererRef = useRef<CanvasRenderer | null>(null);
  const gridRef = useRef<Grid | null>(null);
  const settingsRef = useRef(useMazeStore.getState().settings);
  const pendingRuntimeRef = useRef<Partial<MazeRuntime>>({});
  const runtimeRafRef = useRef<number | null>(null);
  const initializedRef = useRef(false);
  const skipFirstGridSyncRef = useRef(true);

  const settings = useMazeStore((state) => state.settings);
  const setRuntimeSnapshot = useMazeStore((state) => state.setRuntimeSnapshot);
  const resetRuntime = useMazeStore((state) => state.resetRuntime);

  settingsRef.current = settings;

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

  const handleEvent = useCallback(
    (event: MazeWorkerEvent) => {
      if (event.type === "gridRebuilt") {
        const nextGrid = deserializeGridSnapshot(event.grid);
        gridRef.current = nextGrid;

        if (rendererRef.current) {
          rendererRef.current.setGrid(nextGrid);
          return;
        }

        if (canvasRef.current) {
          rendererRef.current = new CanvasRenderer(
            canvasRef.current,
            nextGrid,
            toRendererSettings(settingsRef.current),
          );
        }
        return;
      }

      if (event.type === "patchesApplied") {
        const grid = gridRef.current;
        if (grid) {
          for (const patch of event.patches) {
            applyCellPatch(grid, patch);
          }
        }

        rendererRef.current?.renderDirty(event.dirtyCells);
        return;
      }

      if (event.type === "runtimeSnapshot") {
        queueRuntimeUpdate(event.runtime);
        return;
      }

      if (event.type === "phaseChange") {
        queueRuntimeUpdate({
          phase: event.phase,
          paused: event.paused,
        });
        return;
      }

      if (event.type === "error") {
        console.error("Maze worker error:", event.message);
      }
    },
    [queueRuntimeUpdate],
  );

  const dispatchCommand = useCallback((command: MazeWorkerCommand) => {
    sendCommand(transportRef.current, command);
  }, []);

  useEffect(() => {
    let disposed = false;

    const tryCreateWorkerTransport = (): MazeTransport | null => {
      if (typeof Worker === "undefined") {
        return null;
      }

      try {
        const worker = new Worker(
          new URL("../../engine/maze.worker.ts", import.meta.url),
          { type: "module" },
        );

        worker.onmessage = (message: MessageEvent<MazeWorkerEvent>) => {
          if (disposed) {
            return;
          }

          handleEvent(message.data);
        };

        worker.onerror = (error) => {
          console.error("Maze worker runtime error:", error.message);
        };

        return {
          kind: "worker",
          worker,
        };
      } catch (error) {
        console.warn(
          "Maze worker unavailable, using in-thread engine fallback.",
          error,
        );
        return null;
      }
    };

    const workerTransport = tryCreateWorkerTransport();
    const transport =
      workerTransport ?? {
        kind: "fallback" as const,
        runtime: createMazeWorkerRuntime((event) => {
          if (!disposed) {
            handleEvent(event);
          }
        }),
      };

    transportRef.current = transport;
    initializedRef.current = true;
    skipFirstGridSyncRef.current = true;

    sendCommand(transport, {
      type: "init",
      options: toEngineOptions(settingsRef.current),
    });

    return () => {
      disposed = true;
      initializedRef.current = false;
      skipFirstGridSyncRef.current = true;

      if (runtimeRafRef.current !== null) {
        cancelAnimationFrame(runtimeRafRef.current);
        runtimeRafRef.current = null;
      }

      pendingRuntimeRef.current = {};
      rendererRef.current = null;
      gridRef.current = null;

      const currentTransport = transportRef.current;
      transportRef.current = null;

      if (!currentTransport) {
        return;
      }

      if (currentTransport.kind === "worker") {
        currentTransport.worker.postMessage({ type: "dispose" });
        currentTransport.worker.terminate();
        return;
      }

      currentTransport.runtime.dispose();
    };
  }, [handleEvent]);

  useEffect(() => {
    if (!rendererRef.current && canvasRef.current && gridRef.current) {
      rendererRef.current = new CanvasRenderer(
        canvasRef.current,
        gridRef.current,
        toRendererSettings(settings),
      );
    }
  }, [settings]);

  useEffect(() => {
    if (!initializedRef.current) {
      return;
    }

    dispatchCommand({
      type: "setOptions",
      options: {
        seed: settings.seed,
        generatorId: settings.generatorId,
        solverId: settings.solverId,
        battleMode: settings.battleMode,
        solverBId: settings.solverBId,
        generatorParams: settings.generatorParams,
        solverParams: settings.solverParams,
        speed: settings.speed,
      },
    });
  }, [
    dispatchCommand,
    settings.battleMode,
    settings.generatorId,
    settings.generatorParams,
    settings.seed,
    settings.solverParams,
    settings.solverBId,
    settings.solverId,
    settings.speed,
  ]);

  useEffect(() => {
    if (!initializedRef.current) {
      return;
    }

    if (skipFirstGridSyncRef.current) {
      skipFirstGridSyncRef.current = false;
      return;
    }

    dispatchCommand({
      type: "rebuildGrid",
      width: settings.gridWidth,
      height: settings.gridHeight,
    });
    queueRuntimeUpdate({
      phase: "Idle",
      paused: true,
      metrics: { ...DEFAULT_METRICS },
      generatorActiveLine: null,
      solverActiveLine: null,
      solverBActiveLine: null,
    });
  }, [
    dispatchCommand,
    queueRuntimeUpdate,
    settings.gridHeight,
    settings.gridWidth,
  ]);

  useEffect(() => {
    rendererRef.current?.setSettings(toRendererSettings(settings));
  }, [settings]);

  const syncEngineOptions = useCallback(() => {
    const store = useMazeStore.getState().settings;

    dispatchCommand({
      type: "setOptions",
      options: {
        width: store.gridWidth,
        height: store.gridHeight,
        speed: store.speed,
        seed: store.seed,
        generatorId: store.generatorId,
        solverId: store.solverId,
        battleMode: store.battleMode,
        solverBId: store.solverBId,
        generatorParams: store.generatorParams,
        solverParams: store.solverParams,
      },
    });
  }, [dispatchCommand]);

  const controls = useMemo<MazeControls>(
    () => ({
      generate: () => {
        syncEngineOptions();
        dispatchCommand({ type: "generate" });
        queueRuntimeUpdate({
          paused: false,
          generatorActiveLine: null,
          solverActiveLine: null,
          solverBActiveLine: null,
        });
      },
      solve: () => {
        syncEngineOptions();
        dispatchCommand({ type: "solve" });
        queueRuntimeUpdate({
          paused: false,
          generatorActiveLine: null,
          solverActiveLine: null,
          solverBActiveLine: null,
        });
      },
      pauseResume: () => {
        const runtime = useMazeStore.getState().runtime;
        if (runtime.paused) {
          dispatchCommand({ type: "resume" });
          queueRuntimeUpdate({ paused: false });
          return;
        }

        dispatchCommand({ type: "pause" });
        queueRuntimeUpdate({ paused: true });
      },
      stepOnce: () => {
        dispatchCommand({ type: "stepOnce" });
        queueRuntimeUpdate({ paused: true });
      },
      reset: () => {
        syncEngineOptions();
        dispatchCommand({ type: "reset" });
        resetRuntime();
      },
    }),
    [dispatchCommand, queueRuntimeUpdate, resetRuntime, syncEngineOptions],
  );

  return {
    canvasRef,
    controls,
  };
}
