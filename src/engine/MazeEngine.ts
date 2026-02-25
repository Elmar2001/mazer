import {
  ALL_WALLS,
  applyCellPatch,
  clearOverlays,
  createGrid,
  OverlayFlag,
  type Grid,
} from "@/core/grid";
import { SPEED_MAX, SPEED_MIN } from "@/config/limits";
import type { CellPatch, StepMeta } from "@/core/patches";
import type {
  GeneratorPlugin,
  GeneratorStepper,
} from "@/core/plugins/GeneratorPlugin";
import { generatorPlugins } from "@/core/plugins/generators";
import type {
  SolverPlugin,
  SolverStepper,
} from "@/core/plugins/SolverPlugin";
import { solverPlugins } from "@/core/plugins/solvers";
import type {
  AlgorithmStepMeta,
  GeneratorRunOptions,
  SolverRunOptions,
} from "@/core/plugins/types";
import { createSeededRandom } from "@/core/rng";
import type {
  MazeEngineCallbacks,
  MazeEngineOptions,
  MazeEnginePublicApi,
  MazeMetrics,
  MazePhase,
} from "@/engine/types";

const DEFAULT_METRICS: MazeMetrics = {
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
};

const GENERATOR_INDEX = new Map(
  generatorPlugins.map((plugin) => [plugin.id, plugin]),
);
const SOLVER_INDEX = new Map(solverPlugins.map((plugin) => [plugin.id, plugin]));

export class MazeEngine implements MazeEnginePublicApi {
  private grid: Grid;

  private phase: MazePhase = "Idle";

  private metrics: MazeMetrics = { ...DEFAULT_METRICS };

  private options: MazeEngineOptions;

  private callbacks: MazeEngineCallbacks;

  private generatorStepper: GeneratorStepper<AlgorithmStepMeta> | null = null;

  private solverStepper: SolverStepper<AlgorithmStepMeta> | null = null;

  private paused = true;

  private rafHandle: number | null = null;

  private lastFrameTs = 0;

  private accumulatorMs = 0;

  constructor(options: MazeEngineOptions, callbacks: MazeEngineCallbacks = {}) {
    this.options = { ...options };
    this.grid = createGrid(options.width, options.height);
    this.callbacks = callbacks;
  }

  getGrid(): Grid {
    return this.grid;
  }

  getPhase(): MazePhase {
    return this.phase;
  }

  getMetrics(): MazeMetrics {
    return { ...this.metrics };
  }

  getOptions(): MazeEngineOptions {
    return { ...this.options };
  }

  startGeneration(): void {
    const plugin = this.getGeneratorPlugin(this.options.generatorId);

    this.grid = createGrid(this.options.width, this.options.height);
    this.callbacks.onGridRebuilt?.(this.grid);
    this.metrics = { ...DEFAULT_METRICS };

    const rng = createSeededRandom(this.options.seed);
    this.generatorStepper = plugin.create({
      grid: this.grid,
      rng,
      options: {},
    });
    this.solverStepper = null;

    this.phase = "Generating";
    this.emitPhase();

    this.paused = false;
    this.lastFrameTs = 0;
    this.accumulatorMs = 0;
    this.ensureLoop();

    this.emitAllDirty();
  }

  startSolving(): void {
    if (this.phase !== "Generated" && this.phase !== "Solved") {
      return;
    }

    const plugin = this.getSolverPlugin(this.options.solverId);

    clearOverlays(
      this.grid,
      OverlayFlag.Visited |
        OverlayFlag.Frontier |
        OverlayFlag.Path |
        OverlayFlag.Current,
    );
    this.metrics = { ...DEFAULT_METRICS };

    const rng = createSeededRandom(`${this.options.seed}-solve`);
    this.solverStepper = plugin.create({
      grid: this.grid,
      rng,
      options: {
        startIndex: 0,
        goalIndex: this.grid.cellCount - 1,
      },
    });
    this.generatorStepper = null;

    this.phase = "Solving";
    this.emitPhase();

    this.paused = false;
    this.lastFrameTs = 0;
    this.accumulatorMs = 0;
    this.ensureLoop();

    this.emitAllDirty();
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    if (!this.activeStepper()) {
      return;
    }

    this.paused = false;
    this.ensureLoop();
  }

  stepOnce(): void {
    const result = this.processStep();
    if (!result) {
      return;
    }

    this.metrics.dirtyCellCount += result.dirtyCells.length;
    this.recomputeDerivedMetrics();
    this.emitPatches(result.dirtyCells, result.meta);
  }

  reset(): void {
    this.generatorStepper = null;
    this.solverStepper = null;
    this.phase = "Idle";
    this.paused = true;
    this.metrics = { ...DEFAULT_METRICS };
    this.accumulatorMs = 0;
    this.lastFrameTs = 0;

    this.grid = createGrid(this.options.width, this.options.height);
    this.callbacks.onGridRebuilt?.(this.grid);
    this.emitPhase();
    this.emitAllDirty();
  }

  setSpeed(stepsPerSecond: number): void {
    this.options.speed = clamp(stepsPerSecond, SPEED_MIN, SPEED_MAX);
  }

  setOptions(options: Partial<MazeEngineOptions>): void {
    const merged = { ...this.options, ...options };

    const nextWidth = Math.max(2, Math.floor(merged.width));
    const nextHeight = Math.max(2, Math.floor(merged.height));
    this.options = {
      ...merged,
      width: nextWidth,
      height: nextHeight,
      speed: clamp(merged.speed, SPEED_MIN, SPEED_MAX),
      seed: merged.seed,
    };
  }

  rebuildGrid(width: number, height: number): void {
    const safeWidth = Math.max(2, Math.floor(width));
    const safeHeight = Math.max(2, Math.floor(height));

    this.options.width = safeWidth;
    this.options.height = safeHeight;

    this.grid = createGrid(safeWidth, safeHeight);
    this.generatorStepper = null;
    this.solverStepper = null;
    this.phase = "Idle";
    this.paused = true;
    this.metrics = { ...DEFAULT_METRICS };
    this.accumulatorMs = 0;
    this.lastFrameTs = 0;

    this.callbacks.onGridRebuilt?.(this.grid);
    this.emitPhase();
    this.emitAllDirty();
  }

  setCallbacks(callbacks: MazeEngineCallbacks): void {
    this.callbacks = callbacks;
  }

  destroy(): void {
    if (this.rafHandle !== null) {
      this.cancelAnimationFrame(this.rafHandle);
      this.rafHandle = null;
    }
  }

  private ensureLoop(): void {
    if (this.rafHandle !== null) {
      return;
    }

    this.rafHandle = this.requestAnimationFrame((ts) => this.onFrame(ts));
  }

  private onFrame(ts: number): void {
    this.rafHandle = null;

    if (!this.activeStepper()) {
      return;
    }

    if (this.lastFrameTs === 0) {
      this.lastFrameTs = ts;
    }

    const delta = ts - this.lastFrameTs;
    this.lastFrameTs = ts;

    if (!this.paused) {
      this.metrics.elapsedMs += delta;
      const stepInterval = 1000 / this.options.speed;
      this.accumulatorMs += delta;

      const dirtySet = new Set<number>();
      let latestMeta: StepMeta | undefined;
      let stepped = false;
      let iteration = 0;

      while (
        this.accumulatorMs >= stepInterval &&
        iteration < 1000 &&
        this.activeStepper()
      ) {
        const result = this.processStep();
        if (!result) {
          break;
        }

        stepped = true;
        latestMeta = result.meta;
        for (const cell of result.dirtyCells) {
          dirtySet.add(cell);
        }

        this.accumulatorMs -= stepInterval;
        iteration += 1;

        if (result.done) {
          break;
        }
      }

      if (stepped) {
        this.metrics.dirtyCellCount += dirtySet.size;
        this.recomputeDerivedMetrics();
        this.emitPatches(Array.from(dirtySet), latestMeta);
      }
    }

    if (this.activeStepper()) {
      this.ensureLoop();
    }
  }

  private processStep():
    | { done: boolean; dirtyCells: number[]; meta?: StepMeta }
    | null {
    const stepper = this.activeStepper();
    if (!stepper) {
      return null;
    }

    const computeStart = nowMs();
    const result = stepper.step();
    const dirtyCells: number[] = [];

    for (const patch of result.patches) {
      this.applyPatchWithMetrics(patch);
      dirtyCells.push(patch.index);
    }

    const computeDelta = nowMs() - computeStart;

    this.metrics.stepCount += 1;
    this.metrics.computeMs += computeDelta;
    this.metrics.patchCount += result.patches.length;

    this.applyMetaOverrides(result.meta);
    this.recomputeDerivedMetrics();

    if (result.done) {
      this.completePhase();
    }

    return {
      done: result.done,
      dirtyCells,
      meta: result.meta,
    };
  }

  private applyMetaOverrides(meta?: AlgorithmStepMeta): void {
    if (!meta) {
      return;
    }

    if (typeof meta.visitedCount === "number") {
      this.metrics.visitedCount = meta.visitedCount;
    }

    if (typeof meta.frontierSize === "number") {
      this.metrics.frontierSize = meta.frontierSize;
    }

    if (typeof meta.pathLength === "number") {
      this.metrics.pathLength = meta.pathLength;
    }
  }

  private recomputeDerivedMetrics(): void {
    if (this.metrics.elapsedMs > 0) {
      this.metrics.actualStepsPerSec =
        this.metrics.stepCount / (this.metrics.elapsedMs / 1000);
      this.metrics.engineUtilizationPct =
        (this.metrics.computeMs / this.metrics.elapsedMs) * 100;
    } else {
      this.metrics.actualStepsPerSec = 0;
      this.metrics.engineUtilizationPct = 0;
    }

    if (this.metrics.stepCount > 0) {
      this.metrics.avgPatchesPerStep =
        this.metrics.patchCount / this.metrics.stepCount;
      this.metrics.avgDirtyCellsPerStep =
        this.metrics.dirtyCellCount / this.metrics.stepCount;
    } else {
      this.metrics.avgPatchesPerStep = 0;
      this.metrics.avgDirtyCellsPerStep = 0;
    }
  }

  private completePhase(): void {
    if (this.phase === "Generating") {
      this.generatorStepper = null;
      this.paused = true;
      this.phase = "Generated";
      this.emitPhase();
      return;
    }

    if (this.phase === "Solving") {
      this.solverStepper = null;
      this.paused = true;
      this.phase = "Solved";
      this.emitPhase();
    }
  }

  private applyPatchWithMetrics(patch: CellPatch): void {
    const before = this.grid.overlays[patch.index] as number;
    applyCellPatch(this.grid, patch);
    const after = this.grid.overlays[patch.index] as number;

    this.updateBitMetric(before, after, OverlayFlag.Visited, "visitedCount");
    this.updateBitMetric(before, after, OverlayFlag.Frontier, "frontierSize");
    this.updateBitMetric(before, after, OverlayFlag.Path, "pathLength");
  }

  private updateBitMetric(
    before: number,
    after: number,
    mask: number,
    field: keyof Pick<MazeMetrics, "visitedCount" | "frontierSize" | "pathLength">,
  ): void {
    const had = (before & mask) !== 0;
    const has = (after & mask) !== 0;

    if (had === has) {
      return;
    }

    if (has) {
      this.metrics[field] += 1;
    } else {
      this.metrics[field] = Math.max(0, this.metrics[field] - 1);
    }
  }

  private emitAllDirty(): void {
    const all = Array.from({ length: this.grid.cellCount }, (_, index) => index);
    this.emitPatches(all, undefined);
  }

  private emitPatches(cells: number[], meta: StepMeta | undefined): void {
    this.callbacks.onPatchesApplied?.(cells, meta, this.getMetrics());
  }

  private emitPhase(): void {
    this.callbacks.onPhaseChange?.(this.phase);
  }

  private activeStepper():
    | GeneratorStepper<AlgorithmStepMeta>
    | SolverStepper<AlgorithmStepMeta>
    | null {
    if (this.phase === "Generating") {
      return this.generatorStepper;
    }

    if (this.phase === "Solving") {
      return this.solverStepper;
    }

    return null;
  }

  private getGeneratorPlugin(
    id: MazeEngineOptions["generatorId"],
  ): GeneratorPlugin<GeneratorRunOptions, AlgorithmStepMeta> {
    const plugin = GENERATOR_INDEX.get(id);
    if (!plugin) {
      throw new Error(`Unknown generator plugin: ${id}`);
    }

    return plugin as GeneratorPlugin<GeneratorRunOptions, AlgorithmStepMeta>;
  }

  private getSolverPlugin(
    id: MazeEngineOptions["solverId"],
  ): SolverPlugin<SolverRunOptions, AlgorithmStepMeta> {
    const plugin = SOLVER_INDEX.get(id);
    if (!plugin) {
      throw new Error(`Unknown solver plugin: ${id}`);
    }

    return plugin as SolverPlugin<SolverRunOptions, AlgorithmStepMeta>;
  }

  private requestAnimationFrame(callback: (ts: number) => void): number {
    if (typeof globalThis.requestAnimationFrame === "function") {
      return globalThis.requestAnimationFrame(callback);
    }

    return setTimeout(() => callback(performance.now()), 16) as unknown as number;
  }

  private cancelAnimationFrame(handle: number): void {
    if (typeof globalThis.cancelAnimationFrame === "function") {
      globalThis.cancelAnimationFrame(handle);
      return;
    }

    clearTimeout(handle);
  }
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) {
    return min;
  }

  return Math.max(min, Math.min(max, value));
}

function nowMs(): number {
  if (typeof globalThis.performance !== "undefined") {
    return globalThis.performance.now();
  }

  return Date.now();
}

export function resetWalls(grid: Grid): void {
  grid.walls.fill(ALL_WALLS);
  grid.overlays.fill(0);
}
