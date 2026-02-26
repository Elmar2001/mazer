import type { Grid } from "@/core/grid";
import type { CellPatch, StepMeta } from "@/core/patches";
import type { MazeEngineOptions, MazeMetrics, MazePhase } from "@/engine/types";

export interface SerializedGridSnapshot {
  width: number;
  height: number;
  cellCount: number;
  walls: ArrayBuffer;
  overlays: ArrayBuffer;
}

export interface WorkerRuntimeSnapshot {
  phase: MazePhase;
  paused: boolean;
  metrics: MazeMetrics;
  generatorActiveLine: number | null;
  solverActiveLine: number | null;
  solverBActiveLine: number | null;
}

export type MazeWorkerCommand =
  | {
      type: "init";
      options: MazeEngineOptions;
    }
  | {
      type: "setOptions";
      options: Partial<MazeEngineOptions>;
    }
  | {
      type: "setSpeed";
      speed: number;
    }
  | {
      type: "generate";
    }
  | {
      type: "solve";
    }
  | {
      type: "pause";
    }
  | {
      type: "resume";
    }
  | {
      type: "stepOnce";
    }
  | {
      type: "reset";
    }
  | {
      type: "rebuildGrid";
      width: number;
      height: number;
    }
  | {
      type: "dispose";
    };

export type MazeWorkerEvent =
  | {
      type: "phaseChange";
      phase: MazePhase;
      paused: boolean;
    }
  | {
      type: "gridRebuilt";
      grid: SerializedGridSnapshot;
    }
  | {
      type: "patchesApplied";
      dirtyCells: number[];
      patches: CellPatch[];
      meta?: StepMeta;
      metrics: MazeMetrics;
    }
  | {
      type: "runtimeSnapshot";
      runtime: WorkerRuntimeSnapshot;
    }
  | {
      type: "error";
      message: string;
    };

export function createGridSnapshot(
  grid: Grid,
): { snapshot: SerializedGridSnapshot; transfer: Transferable[] } {
  const walls = grid.walls.slice();
  const overlays = grid.overlays.slice();

  return {
    snapshot: {
      width: grid.width,
      height: grid.height,
      cellCount: grid.cellCount,
      walls: walls.buffer,
      overlays: overlays.buffer,
    },
    transfer: [walls.buffer, overlays.buffer],
  };
}

export function deserializeGridSnapshot(snapshot: SerializedGridSnapshot): Grid {
  return {
    width: snapshot.width,
    height: snapshot.height,
    cellCount: snapshot.cellCount,
    walls: new Uint8Array(snapshot.walls),
    overlays: new Uint16Array(snapshot.overlays),
  };
}
