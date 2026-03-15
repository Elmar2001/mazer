import {
  ENGINE_MAX_STEPS_PER_FRAME,
  clampGridSizeByCells,
  clampSpeed,
} from "@/config/limits";
import {
  ALL_SOLVER_OVERLAY_MASK,
  applyCellPatch,
  clearOverlays,
  createGrid,
  OverlayFlag,
  type Grid,
} from "@/core/grid";
import { analyzeMazeGraph } from "@/core/analysis/graphMetrics";
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
  SolverRunMetrics,
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
  graph: null,
  battle: null,
};

const GENERATOR_INDEX = new Map(
  generatorPlugins.map((plugin) => [plugin.id, plugin]),
);
const SOLVER_INDEX = new Map(solverPlugins.map((plugin) => [plugin.id, plugin]));

type SolverRole = "A" | "B";

interface SolverRuntime {
  id: MazeEngineOptions["solverId"];
  label: string;
  role: SolverRole;
  stepper: SolverStepper<AlgorithmStepMeta>;
  metrics: SolverRunMetrics;
  done: boolean;
}

export class MazeEngine implements MazeEnginePublicApi {
  private grid: Grid;

  private phase: MazePhase = "Idle";

  private metrics: MazeMetrics = { ...DEFAULT_METRICS };

  private options: MazeEngineOptions;

  private callbacks: MazeEngineCallbacks;

  private generatorStepper: GeneratorStepper<AlgorithmStepMeta> | null = null;

  private solverPrimary: SolverRuntime | null = null;

  private solverSecondary: SolverRuntime | null = null;

  private paused = true;

  private rafHandle: number | null = null;

  private lastFrameTs = 0;

  private accumulatorMs = 0;

  constructor(options: MazeEngineOptions, callbacks: MazeEngineCallbacks = {}) {
    const safeSize = clampGridSizeByCells(options.width, options.height);
    this.options = {
      ...options,
      width: safeSize.width,
      height: safeSize.height,
      speed: clampSpeed(options.speed),
    };
    this.grid = createGrid(this.options.width, this.options.height);
    this.callbacks = callbacks;
  }

  getGrid(): Grid {
    return this.grid;
  }

  getPhase(): MazePhase {
    return this.phase;
  }

  getMetrics(): MazeMetrics {
    const battle = this.metrics.battle;
    const graph = this.metrics.graph;

    return {
      ...this.metrics,
      graph: graph ? { ...graph } : null,
      battle: battle
        ? {
          enabled: battle.enabled,
          solverA: { ...battle.solverA },
          solverB: { ...battle.solverB },
        }
        : null,
    };
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
      options: this.options.generatorParams ?? {},
    });

    this.solverPrimary = null;
    this.solverSecondary = null;

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

    clearOverlays(this.grid, ALL_SOLVER_OVERLAY_MASK);
    const graphSnapshot = this.metrics.graph ? { ...this.metrics.graph } : null;
    this.metrics = { ...DEFAULT_METRICS, graph: graphSnapshot };

    const solverAPlugin = this.getSolverPlugin(this.options.solverId);

    this.solverPrimary = this.createSolverRuntime(
      solverAPlugin,
      this.options.solverId,
      "A",
      `${this.options.seed}-solve-a`,
    );

    this.solverSecondary = null;

    if (this.options.battleMode) {
      const solverBPlugin = this.getSolverPlugin(this.options.solverBId);
      this.solverSecondary = this.createSolverRuntime(
        solverBPlugin,
        this.options.solverBId,
        "B",
        `${this.options.seed}-solve-b`,
      );

      this.syncBattleMetricsSnapshot();
    }

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
    if (this.paused) {
      return;
    }

    this.paused = true;
    this.lastFrameTs = 0;

    if (this.rafHandle !== null) {
      this.cancelAnimationFrame(this.rafHandle);
      this.rafHandle = null;
    }
  }

  resume(): void {
    if (!this.hasActiveWork()) {
      return;
    }

    if (!this.paused) {
      return;
    }

    this.paused = false;
    this.lastFrameTs = 0;
    this.ensureLoop();
  }

  stepOnce(): void {
    const result = this.processStep();
    if (!result) {
      return;
    }

    this.metrics.dirtyCellCount += result.dirtyCells.length;
    this.recomputeDerivedMetrics();
    this.syncBattleMetricsSnapshot();
    this.emitPatches(result.dirtyCells, result.patches, result.meta);
  }

  reset(): void {
    if (this.rafHandle !== null) {
      this.cancelAnimationFrame(this.rafHandle);
      this.rafHandle = null;
    }
    this.generatorStepper = null;
    this.solverPrimary = null;
    this.solverSecondary = null;
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
    this.options.speed = clampSpeed(stepsPerSecond);
    this.accumulatorMs = 0;
  }

  setOptions(options: Partial<MazeEngineOptions>): void {
    const merged = { ...this.options, ...options };
    const safeSize = clampGridSizeByCells(merged.width, merged.height);

    this.options = {
      ...merged,
      width: safeSize.width,
      height: safeSize.height,
      speed: clampSpeed(merged.speed),
      seed: merged.seed,
    };
  }

  rebuildGrid(width: number, height: number): void {
    if (this.rafHandle !== null) {
      this.cancelAnimationFrame(this.rafHandle);
      this.rafHandle = null;
    }
    const safeSize = clampGridSizeByCells(width, height);
    const safeWidth = safeSize.width;
    const safeHeight = safeSize.height;

    this.options.width = safeWidth;
    this.options.height = safeHeight;

    this.grid = createGrid(safeWidth, safeHeight);
    this.generatorStepper = null;
    this.solverPrimary = null;
    this.solverSecondary = null;
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

    if (!this.hasActiveWork()) {
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
      const patches: CellPatch[] = [];
      let latestMeta: StepMeta | undefined;
      let stepped = false;
      let iteration = 0;

      while (
        this.accumulatorMs >= stepInterval &&
        iteration < ENGINE_MAX_STEPS_PER_FRAME &&
        this.hasActiveWork()
      ) {
        const result = this.processStep();
        if (!result) {
          break;
        }

        stepped = true;
        latestMeta = result.meta;
        for (const patch of result.patches) patches.push(patch);
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
        this.syncBattleMetricsSnapshot();
        this.emitPatches(Array.from(dirtySet), patches, latestMeta);
      }
    }

    if (this.hasActiveWork() && !this.paused) {
      this.ensureLoop();
    }
  }

  private processStep():
    | { done: boolean; dirtyCells: number[]; patches: CellPatch[]; meta?: StepMeta }
    | null {
    if (this.phase === "Generating") {
      return this.processGenerationStep();
    }

    if (this.phase === "Solving") {
      return this.processSolvingStep();
    }

    return null;
  }

  private processGenerationStep():
    | { done: boolean; dirtyCells: number[]; patches: CellPatch[]; meta?: StepMeta }
    | null {
    const stepper = this.generatorStepper;
    if (!stepper) {
      return null;
    }

    const computeStart = nowMs();
    const result = stepper.step();
    const dirtyCells: number[] = [];

    for (const patch of result.patches) {
      this.applyPatch(patch);
      dirtyCells.push(patch.index);
    }

    const computeDelta = nowMs() - computeStart;

    this.metrics.stepCount += 1;
    this.metrics.computeMs += computeDelta;
    this.metrics.patchCount += result.patches.length;

    this.applyMetaOverrides(result.meta);

    if (result.done) {
      this.completePhase();
    }

    return {
      done: result.done,
      dirtyCells,
      patches: result.patches,
      meta: result.meta,
    };
  }

  private processSolvingStep():
    | { done: boolean; dirtyCells: number[]; patches: CellPatch[]; meta?: StepMeta }
    | null {
    const dirtySet = new Set<number>();
    const patches: CellPatch[] = [];
    let latestMeta: StepMeta | undefined;
    let anyWork = false;

    if (this.solverPrimary && !this.solverPrimary.done) {
      const result = this.processSolverRuntime(this.solverPrimary);
      anyWork = true;
      latestMeta = result.meta;
      for (const patch of result.patches) patches.push(patch);
      for (const cell of result.dirtyCells) {
        dirtySet.add(cell);
      }
    }

    if (this.solverSecondary && !this.solverSecondary.done) {
      const result = this.processSolverRuntime(this.solverSecondary);
      anyWork = true;
      latestMeta = result.meta;
      for (const patch of result.patches) patches.push(patch);
      for (const cell of result.dirtyCells) {
        dirtySet.add(cell);
      }
    }

    if (!anyWork) {
      this.completePhase();
      return {
        done: true,
        dirtyCells: [],
        patches: [],
        meta: latestMeta,
      };
    }

    if (this.solverSecondary) {
      this.syncBattleGlobalFromSolvers();
    }

    const done = this.isSolvingComplete();
    if (done) {
      this.completePhase();
    }

    return {
      done,
      dirtyCells: Array.from(dirtySet),
      patches,
      meta: latestMeta,
    };
  }

  private processSolverRuntime(runtime: SolverRuntime): {
    dirtyCells: number[];
    patches: CellPatch[];
    meta?: AlgorithmStepMeta;
  } {
    const computeStart = nowMs();
    const raw = runtime.stepper.step();
    const patches =
      runtime.role === "A"
        ? raw.patches
        : raw.patches.map((patch) => remapPatchForSecondary(patch));

    const dirtySet = new Set<number>();
    for (const patch of patches) {
      this.applyPatch(patch);
      dirtySet.add(patch.index);
    }

    const computeDelta = nowMs() - computeStart;

    runtime.metrics.stepCount += 1;
    runtime.metrics.elapsedMs += 1000 / this.options.speed;
    runtime.metrics.computeMs += computeDelta;
    runtime.metrics.patchCount += patches.length;
    runtime.metrics.dirtyCellCount += dirtySet.size;

    if (typeof raw.meta?.visitedCount === "number") {
      runtime.metrics.visitedCount = raw.meta.visitedCount;
    }

    if (typeof raw.meta?.frontierSize === "number") {
      runtime.metrics.frontierSize = raw.meta.frontierSize;
    }

    if (typeof raw.meta?.pathLength === "number") {
      runtime.metrics.pathLength = raw.meta.pathLength;
    }

    if (typeof raw.meta?.solved === "boolean") {
      runtime.metrics.solved = raw.meta.solved;
    }

    if (typeof raw.meta?.line === "number" && Number.isFinite(raw.meta.line)) {
      runtime.metrics.activeLine = Math.max(1, Math.floor(raw.meta.line));
    }

    if (raw.done) {
      runtime.done = true;
      runtime.metrics.done = true;
      if (!runtime.metrics.solved && runtime.metrics.pathLength > 0) {
        runtime.metrics.solved = true;
      }
    }

    recomputeSolverDerived(runtime.metrics);

    this.metrics.stepCount += 1;
    this.metrics.computeMs += computeDelta;
    this.metrics.patchCount += patches.length;

    if (!this.solverSecondary) {
      this.applyMetaOverrides(raw.meta);
    }

    return {
      dirtyCells: Array.from(dirtySet),
      patches,
      meta: {
        ...raw.meta,
        solverRole: runtime.role,
      },
    };
  }

  private createSolverRuntime(
    plugin: SolverPlugin<SolverRunOptions, AlgorithmStepMeta>,
    solverId: MazeEngineOptions["solverId"],
    role: SolverRole,
    seedText: string,
  ): SolverRuntime {
    const rng = createSeededRandom(seedText);
    const stepper = plugin.create({
      grid: this.grid,
      rng,
      options: {
        ...(this.options.solverParams ?? {}),
        startIndex: 0,
        goalIndex: this.grid.cellCount - 1,
      },
    });

    return {
      id: solverId,
      label: plugin.label,
      role,
      stepper,
      metrics: createEmptySolverMetrics(solverId, plugin.label),
      done: false,
    };
  }

  private syncBattleGlobalFromSolvers(): void {
    if (!this.solverPrimary || !this.solverSecondary) {
      return;
    }

    const a = this.solverPrimary.metrics;
    const b = this.solverSecondary.metrics;

    this.metrics.visitedCount = a.visitedCount + b.visitedCount;
    this.metrics.frontierSize = a.frontierSize + b.frontierSize;
    this.metrics.pathLength = a.pathLength + b.pathLength;
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

  private syncBattleMetricsSnapshot(): void {
    if (!this.solverPrimary || !this.solverSecondary) {
      if (
        this.phase === "Solved" &&
        this.metrics.battle &&
        this.metrics.battle.enabled
      ) {
        return;
      }

      this.metrics.battle = null;
      return;
    }

    this.metrics.battle = {
      enabled: true,
      solverA: { ...this.solverPrimary.metrics },
      solverB: { ...this.solverSecondary.metrics },
    };
  }

  private completePhase(): void {
    if (this.phase === "Generating") {
      this.generatorStepper = null;
      this.paused = true;
      this.metrics.graph = analyzeMazeGraph(
        this.grid,
        0,
        this.grid.cellCount - 1,
      );
      this.phase = "Generated";
      this.emitPhase();
      return;
    }

    if (this.phase === "Solving") {
      this.solverPrimary = null;
      this.solverSecondary = null;
      this.paused = true;
      this.phase = "Solved";
      this.emitPhase();
    }
  }

  private applyPatch(patch: CellPatch): void {
    applyCellPatch(this.grid, patch);
  }

  private emitAllDirty(): void {
    const all = Array.from({ length: this.grid.cellCount }, (_, index) => index);
    this.emitPatches(all, [], undefined);
  }

  private emitPatches(
    cells: number[],
    patches: CellPatch[],
    meta: StepMeta | undefined,
  ): void {
    this.callbacks.onPatchesApplied?.(cells, patches, meta, this.getMetrics());
  }

  private emitPhase(): void {
    this.callbacks.onPhaseChange?.(this.phase);
  }

  private hasActiveWork(): boolean {
    if (this.phase === "Generating") {
      return this.generatorStepper !== null;
    }

    if (this.phase === "Solving") {
      return (
        (this.solverPrimary !== null && !this.solverPrimary.done) ||
        (this.solverSecondary !== null && !this.solverSecondary.done)
      );
    }

    return false;
  }

  private isSolvingComplete(): boolean {
    if (this.phase !== "Solving") {
      return false;
    }

    const aDone = this.solverPrimary ? this.solverPrimary.done : true;
    const bDone = this.solverSecondary ? this.solverSecondary.done : true;

    return aDone && bDone;
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

    return setTimeout(() => callback(nowMs()), 16) as unknown as number;
  }

  private cancelAnimationFrame(handle: number): void {
    if (typeof globalThis.cancelAnimationFrame === "function") {
      globalThis.cancelAnimationFrame(handle);
      return;
    }

    clearTimeout(handle);
  }
}

function remapPatchForSecondary(patch: CellPatch): CellPatch {
  return {
    ...patch,
    overlaySet:
      typeof patch.overlaySet === "number"
        ? mapPrimaryToSecondaryOverlay(patch.overlaySet)
        : undefined,
    overlayClear:
      typeof patch.overlayClear === "number"
        ? mapPrimaryToSecondaryOverlay(patch.overlayClear)
        : undefined,
  };
}

function mapPrimaryToSecondaryOverlay(mask: number): number {
  let mapped = 0;

  if ((mask & OverlayFlag.Visited) !== 0) {
    mapped |= OverlayFlag.VisitedB;
  }

  if ((mask & OverlayFlag.Frontier) !== 0) {
    mapped |= OverlayFlag.FrontierB;
  }

  if ((mask & OverlayFlag.Path) !== 0) {
    mapped |= OverlayFlag.PathB;
  }

  if ((mask & OverlayFlag.Current) !== 0) {
    mapped |= OverlayFlag.CurrentB;
  }

  return mapped;
}

function createEmptySolverMetrics(
  id: MazeEngineOptions["solverId"],
  label: string,
): SolverRunMetrics {
  return {
    id,
    label,
    activeLine: null,
    stepCount: 0,
    visitedCount: 0,
    frontierSize: 0,
    pathLength: 0,
    elapsedMs: 0,
    computeMs: 0,
    actualStepsPerSec: 0,
    patchCount: 0,
    dirtyCellCount: 0,
    avgPatchesPerStep: 0,
    avgDirtyCellsPerStep: 0,
    solved: false,
    done: false,
  };
}

function recomputeSolverDerived(metrics: SolverRunMetrics): void {
  if (metrics.elapsedMs > 0) {
    metrics.actualStepsPerSec = metrics.stepCount / (metrics.elapsedMs / 1000);
  } else {
    metrics.actualStepsPerSec = 0;
  }

  if (metrics.stepCount > 0) {
    metrics.avgPatchesPerStep = metrics.patchCount / metrics.stepCount;
    metrics.avgDirtyCellsPerStep = metrics.dirtyCellCount / metrics.stepCount;
  } else {
    metrics.avgPatchesPerStep = 0;
    metrics.avgDirtyCellsPerStep = 0;
  }
}

function nowMs(): number {
  if (typeof globalThis.performance !== "undefined") {
    return globalThis.performance.now();
  }

  return Date.now();
}


