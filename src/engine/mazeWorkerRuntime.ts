import type { StepMeta } from "@/core/patches";
import { MazeEngine } from "@/engine/MazeEngine";
import type { MazeEngineOptions, MazeMetrics, MazePhase } from "@/engine/types";
import {
  createGridSnapshot,
  type MazeWorkerCommand,
  type MazeWorkerEvent,
  type SerializedGridSnapshot,
  type WorkerRuntimeSnapshot,
} from "@/engine/mazeWorkerProtocol";

interface ActiveLineState {
  generatorActiveLine: number | null;
  solverActiveLine: number | null;
  solverBActiveLine: number | null;
}

export type MazeWorkerEventEmitter = (
  event: MazeWorkerEvent,
  transfer?: Transferable[],
) => void;

function createEmptyLineState(): ActiveLineState {
  return {
    generatorActiveLine: null,
    solverActiveLine: null,
    solverBActiveLine: null,
  };
}

function isActivePhase(phase: MazePhase): boolean {
  return phase === "Generating" || phase === "Solving";
}

function parseLine(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  return Math.max(1, Math.floor(value));
}

export class MazeWorkerRuntime {
  private engine: MazeEngine | null = null;

  private phase: MazePhase = "Idle";

  private paused = true;

  private activeLines: ActiveLineState = createEmptyLineState();

  private lastSnapshotTs = 0;

  constructor(private readonly emit: MazeWorkerEventEmitter) {}

  handleCommand(command: MazeWorkerCommand): void {
    try {
      switch (command.type) {
        case "init":
          this.init(command.options);
          return;
        case "setOptions":
          this.requireEngine().setOptions(command.options);
          return;
        case "setSpeed":
          this.requireEngine().setSpeed(command.speed);
          return;
        case "generate":
          this.requireEngine().startGeneration();
          return;
        case "solve": {
          const engine = this.requireEngine();
          const phaseBefore = engine.getPhase();
          engine.startSolving();

          if (phaseBefore === "Generated" || phaseBefore === "Solved") {
            this.emitGridSnapshot(engine);
          }

          return;
        }
        case "pause": {
          const engine = this.requireEngine();
          engine.pause();
          this.paused = true;
          this.emitRuntimeSnapshot(engine.getMetrics());
          return;
        }
        case "resume": {
          const engine = this.requireEngine();
          engine.resume();
          if (isActivePhase(this.phase)) {
            this.paused = false;
          }
          this.emitRuntimeSnapshot(engine.getMetrics());
          return;
        }
        case "stepOnce": {
          const engine = this.requireEngine();
          engine.pause();
          this.paused = true;
          engine.stepOnce();
          this.emitRuntimeSnapshot(engine.getMetrics());
          return;
        }
        case "reset":
          this.requireEngine().reset();
          return;
        case "rebuildGrid":
          this.requireEngine().rebuildGrid(command.width, command.height);
          return;
        case "dispose":
          this.dispose();
          return;
      }
    } catch (error) {
      this.emitError(error);
    }
  }

  dispose(): void {
    this.disposeEngine();
  }

  private init(options: MazeEngineOptions): void {
    this.disposeEngine();

    this.engine = new MazeEngine(options, {
      onPatchesApplied: (dirtyCells, patches, meta, metrics) => {
        this.applyLineMeta(meta, metrics);
        this.emit({
          type: "patchesApplied",
          dirtyCells,
          patches,
          meta,
          metrics,
        });
        this.emitRuntimeSnapshot(metrics);
      },
      onPhaseChange: (phase) => {
        this.phase = phase;
        this.paused = !isActivePhase(phase);

        if (phase === "Idle") {
          this.activeLines = createEmptyLineState();
        } else if (phase === "Generating") {
          this.activeLines.solverActiveLine = null;
          this.activeLines.solverBActiveLine = null;
        } else if (phase === "Solving") {
          this.activeLines.generatorActiveLine = null;
          this.activeLines.solverActiveLine = null;
          this.activeLines.solverBActiveLine = null;
        }

        this.emit({
          type: "phaseChange",
          phase,
          paused: this.paused,
        });

        const currentMetrics = this.engine?.getMetrics();
        if (currentMetrics) {
          this.emitRuntimeSnapshot(currentMetrics);
        }
      },
      onGridRebuilt: (grid) => {
        const { snapshot, transfer } = createGridSnapshot(grid);
        this.emitGridRebuilt(snapshot, transfer);
      },
    });

    const engine = this.requireEngine();
    this.phase = engine.getPhase();
    this.paused = !isActivePhase(this.phase);
    this.activeLines = createEmptyLineState();

    this.emitGridSnapshot(engine);
    this.emit({
      type: "phaseChange",
      phase: this.phase,
      paused: this.paused,
    });
    this.emitRuntimeSnapshot(engine.getMetrics());
  }

  private applyLineMeta(meta: StepMeta | undefined, metrics: MazeMetrics): void {
    const line = parseLine(meta?.line);
    const solverRole = typeof meta?.solverRole === "string" ? meta.solverRole : undefined;

    if (metrics.battle) {
      this.activeLines.solverActiveLine = metrics.battle.solverA.activeLine;
      this.activeLines.solverBActiveLine = metrics.battle.solverB.activeLine;
      return;
    }

    if (typeof line === "number" && solverRole === "B") {
      this.activeLines.solverBActiveLine = line;
      return;
    }

    if (typeof line === "number" && solverRole === "A") {
      this.activeLines.solverActiveLine = line;
      return;
    }

    if (typeof line === "number") {
      this.activeLines.generatorActiveLine = line;
    }
  }

  private emitRuntimeSnapshot(metrics: MazeMetrics): void {
    const isTest = typeof process !== "undefined" && process.env.NODE_ENV === "test";
    const now = Date.now();
    if (!isTest && now - this.lastSnapshotTs < 60) {
      if (this.phase !== "Solved" && this.phase !== "Generated" && this.phase !== "Idle") {
        return;
      }
    }
    this.lastSnapshotTs = now;

    const runtime: WorkerRuntimeSnapshot = {
      phase: this.phase,
      paused: this.paused,
      metrics,
      generatorActiveLine: this.activeLines.generatorActiveLine,
      solverActiveLine: this.activeLines.solverActiveLine,
      solverBActiveLine: this.activeLines.solverBActiveLine,
    };

    this.emit({
      type: "runtimeSnapshot",
      runtime,
    });
  }

  private emitGridSnapshot(engine: MazeEngine): void {
    const { snapshot, transfer } = createGridSnapshot(engine.getGrid());
    this.emitGridRebuilt(snapshot, transfer);
  }

  private emitGridRebuilt(
    snapshot: SerializedGridSnapshot,
    transfer?: Transferable[],
  ): void {
    this.emit(
      {
        type: "gridRebuilt",
        grid: snapshot,
      },
      transfer,
    );
  }

  private emitError(error: unknown): void {
    if (error instanceof Error) {
      this.emit({
        type: "error",
        message: error.message,
      });
      return;
    }

    this.emit({
      type: "error",
      message: "Unknown maze worker error.",
    });
  }

  private requireEngine(): MazeEngine {
    if (!this.engine) {
      throw new Error("Maze engine is not initialized.");
    }

    return this.engine;
  }

  private disposeEngine(): void {
    if (this.engine) {
      this.engine.destroy();
      this.engine = null;
    }

    this.phase = "Idle";
    this.paused = true;
    this.activeLines = createEmptyLineState();
  }
}

export function createMazeWorkerRuntime(
  emit: MazeWorkerEventEmitter,
): MazeWorkerRuntime {
  return new MazeWorkerRuntime(emit);
}
