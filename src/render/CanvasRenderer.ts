import { CrossingKind, OverlayFlag, WallFlag, type Grid } from "@/core/grid";
import type { CellPatch } from "@/core/patches";
import {
  CANVAS_MAX_BACKING_DIMENSION,
  CANVAS_MAX_BACKING_PIXELS,
  RENDERING_SHADOW_CELL_SIZE_THRESHOLD,
  RENDERING_SHADOW_SPEED_THRESHOLD,
} from "@/config/limits";
import { DEFAULT_COLOR_THEME, type ColorTheme } from "@/render/colorPresets";
import {
  classifyPatchEffects,
  pruneTransientEffects,
  resolveRenderMotionMode,
  shouldRunLiveCanvasLoop,
  type RenderAnimationPhase,
  type RenderEffectKind,
  type RenderEffectRole,
  type RenderTransientEffect,
} from "@/render/renderEffects";

export interface CanvasRendererSettings {
  cellSize: number;
  showVisited: boolean;
  showFrontier: boolean;
  showPath: boolean;
  colors?: ColorTheme;
  wallThickness?: number;
  showWallShadow?: boolean;
  showCellInset?: boolean;
}

export interface CanvasRendererMotionState {
  phase: RenderAnimationPhase;
  paused: boolean;
  reducedMotion: boolean;
}

export class CanvasRenderer {
  private readonly canvas: HTMLCanvasElement;

  private readonly ctx: CanvasRenderingContext2D;

  private grid: Grid;

  private settings: CanvasRendererSettings;

  private colors: ColorTheme;

  private dpr = 1;

  private dirtyMask: Uint8Array | null = null;

  private expandedDirtyIndices: number[] = [];

  private isHighPerformance = true;

  private transientEffects: RenderTransientEffect[] = [];

  private effectRafHandle: number | null = null;

  private readonly maxTransientEffects = 220;

  private motionState: CanvasRendererMotionState = {
    phase: "idle",
    paused: true,
    reducedMotion: false,
  };

  constructor(
    canvas: HTMLCanvasElement,
    grid: Grid,
    settings: CanvasRendererSettings,
  ) {
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("2D canvas context is unavailable.");
    }

    this.canvas = canvas;
    this.ctx = context;
    this.grid = grid;
    this.settings = settings;
    this.colors = settings.colors ?? DEFAULT_COLOR_THEME;

    this.resize();
    this.initBuffers();
    this.renderAll();
    this.ensureEffectLoop();
  }

  setGrid(grid: Grid): void {
    this.grid = grid;
    this.clearTransientEffects();
    this.resize();
    this.initBuffers();
    this.renderAll();
    this.ensureEffectLoop();
  }

  setSettings(settings: Partial<CanvasRendererSettings>): void {
    this.settings = {
      ...this.settings,
      ...settings,
    };

    if (settings.colors) {
      this.colors = settings.colors;
    }

    this.clearTransientEffects();
    this.resize();
    this.initBuffers();
    this.renderAll();
  }

  setMotionState(state: CanvasRendererMotionState): void {
    const wasLive = this.isLiveCanvasLoopRunning();
    this.motionState = state;

    if (this.isLiveCanvasLoopRunning()) {
      this.ensureEffectLoop();
      return;
    }

    if (wasLive) {
      this.clearTransientEffects();
      this.renderAll();
    }
  }

  resize(): void {
    const widthPx = this.grid.width * this.settings.cellSize;
    const heightPx = this.grid.height * this.settings.cellSize;

    this.dpr = this.computeSafeDpr(widthPx, heightPx);

    this.canvas.style.width = `${widthPx}px`;
    this.canvas.style.height = `${heightPx}px`;
    this.canvas.width = Math.max(1, Math.floor(widthPx * this.dpr));
    this.canvas.height = Math.max(1, Math.floor(heightPx * this.dpr));

    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
  }

  private computeSafeDpr(widthPx: number, heightPx: number): number {
    const rawDpr = globalThis.devicePixelRatio ?? 1;
    const nativeDpr =
      Number.isFinite(rawDpr) && rawDpr > 0 ? rawDpr : 1;
    const maxByWidth = CANVAS_MAX_BACKING_DIMENSION / Math.max(1, widthPx);
    const maxByHeight = CANVAS_MAX_BACKING_DIMENSION / Math.max(1, heightPx);
    const maxByPixels = Math.sqrt(
      CANVAS_MAX_BACKING_PIXELS / Math.max(1, widthPx * heightPx),
    );

    return Math.max(0.1, Math.min(nativeDpr, maxByWidth, maxByHeight, maxByPixels));
  }

  renderAll(): void {
    this.isHighPerformance = true;
    const widthPx = this.grid.width * this.settings.cellSize;
    const heightPx = this.grid.height * this.settings.cellSize;
    const size = this.settings.cellSize;

    this.resetPaintState();
    this.ctx.fillStyle = this.colors.background;
    this.ctx.fillRect(0, 0, widthPx, heightPx);

    // Batch checkerboard draws
    this.ctx.fillStyle = this.colors.cellA;
    this.ctx.beginPath();
    for (let r = 0; r < this.grid.height; r++) {
      for (let c = 0; c < this.grid.width; c++) {
        if (((r + c) & 1) === 0) {
          this.ctx.rect(c * size, r * size, size, size);
        }
      }
    }
    this.ctx.fill();

    this.ctx.fillStyle = this.colors.cellB;
    this.ctx.beginPath();
    for (let r = 0; r < this.grid.height; r++) {
      for (let c = 0; c < this.grid.width; c++) {
        if (((r + c) & 1) !== 0) {
          this.ctx.rect(c * size, r * size, size, size);
        }
      }
    }
    this.ctx.fill();

    for (let index = 0; index < this.grid.cellCount; index += 1) {
      this.drawCell(index, true); // skipBaseFill=true
    }
  }

  renderDirty(
    dirtyCells: number[],
    speed = 0,
    patches: readonly CellPatch[] = [],
    reducedMotion = false,
  ): void {
    if (dirtyCells.length === 0) {
      return;
    }

    this.isHighPerformance =
      speed < RENDERING_SHADOW_SPEED_THRESHOLD &&
      this.settings.cellSize >= RENDERING_SHADOW_CELL_SIZE_THRESHOLD;

    this.expandDirty(dirtyCells);
    for (const index of this.expandedDirtyIndices) {
      this.drawCell(index);
    }

    const now = nowMs();
    const mode = resolveRenderMotionMode({
      cellSize: this.settings.cellSize,
      dirtyCellCount: dirtyCells.length,
      reducedMotion,
      speed,
    });

    if (mode === "off" || !this.isLiveCanvasLoopRunning()) {
      this.clearTransientEffects();
      this.renderAll();
      return;
    }

    if (patches.length > 0) {
      this.transientEffects = pruneTransientEffects(
        [
          ...this.transientEffects,
          ...classifyPatchEffects(patches, now, mode),
        ],
        now,
        this.maxTransientEffects,
      );
    } else {
      this.transientEffects = pruneTransientEffects(
        this.transientEffects,
        now,
        this.maxTransientEffects,
      );
    }

    this.drawTransientEffects(now);
    this.drawLiveEndpointGlow(now);
    this.ensureEffectLoop();
  }

  private drawCell(index: number, skipBaseFill = false): void {
    const x = (index % this.grid.width) * this.settings.cellSize;
    const y = Math.floor(index / this.grid.width) * this.settings.cellSize;
    const size = this.settings.cellSize;
    const row = Math.floor(index / this.grid.width);
    const col = index % this.grid.width;

    this.resetPaintState();

    if (!skipBaseFill) {
      // Base cell fill — edge-to-edge, no gaps
      this.ctx.fillStyle = ((row + col) & 1) === 0 ? this.colors.cellA : this.colors.cellB;
      this.ctx.fillRect(x, y, size, size);
    }

    // Cell inset highlight — subtle inner bevel
    if (size > 9 && this.settings.showCellInset !== false) {
      this.ctx.fillStyle = this.colors.cellInset;
      this.ctx.fillRect(x + 1, y + 1, size - 2, size - 2);
    }

    const overlays = this.grid.overlays[index] as number;
    const crossing = this.grid.crossings[index] as number;

    // Visited overlays — full cell fill so adjacent cells connect seamlessly
    if (this.settings.showVisited && (overlays & OverlayFlag.Visited) !== 0) {
      this.ctx.fillStyle = this.colors.visitedA;
      this.ctx.fillRect(x, y, size, size);
    }

    if (this.settings.showVisited && (overlays & OverlayFlag.VisitedB) !== 0) {
      this.ctx.fillStyle = this.colors.visitedB;
      this.ctx.fillRect(x + 1, y + 1, size - 2, size - 2);
    }

    // Frontier overlays — full cell fill
    if (this.settings.showFrontier && (overlays & OverlayFlag.Frontier) !== 0) {
      this.ctx.fillStyle = this.colors.frontierA;
      this.ctx.fillRect(x, y, size, size);
    }

    if (this.settings.showFrontier && (overlays & OverlayFlag.FrontierB) !== 0) {
      this.ctx.strokeStyle = this.colors.frontierB;
      this.ctx.lineWidth = 1.5;
      this.ctx.strokeRect(x + 2.5, y + 2.5, size - 5, size - 5);
    }

    // Path overlays — full cell fill with glow for connected trail
    if (this.settings.showPath && (overlays & OverlayFlag.Path) !== 0) {
      if (size >= 12 && this.isHighPerformance) {
        this.ctx.shadowColor = this.colors.pathA;
        this.ctx.shadowBlur = size * 0.3;
      }
      this.ctx.fillStyle = this.colors.pathA;
      this.ctx.fillRect(x, y, size, size);
      this.ctx.shadowBlur = 0;
      this.ctx.shadowColor = "transparent";
    }

    if (this.settings.showPath && (overlays & OverlayFlag.PathB) !== 0) {
      if (size >= 12 && this.isHighPerformance) {
        this.ctx.shadowColor = this.colors.pathB;
        this.ctx.shadowBlur = size * 0.25;
      }
      this.ctx.fillStyle = this.colors.pathB;
      this.ctx.fillRect(x + 1, y + 1, size - 2, size - 2);
      this.ctx.shadowBlur = 0;
      this.ctx.shadowColor = "transparent";
    }

    if (crossing !== CrossingKind.None) {
      this.drawCrossing(x, y, size, crossing);
    }

    // Current cell indicators — circles with glow
    if ((overlays & OverlayFlag.Current) !== 0) {
      this.drawCurrentRing(x, y, size, this.colors.currentRingA, 0.35);
    }

    if ((overlays & OverlayFlag.CurrentB) !== 0) {
      this.drawCurrentRing(x, y, size, this.colors.currentRingB, 0.28);
    }

    this.drawWalls(index, x, y, size);
    this.drawEndpoints(index, x, y, size);
  }

  private resetPaintState(): void {
    this.ctx.globalAlpha = 1;
    this.ctx.globalCompositeOperation = "source-over";
    this.ctx.shadowBlur = 0;
    this.ctx.shadowColor = "transparent";
    this.ctx.setLineDash([]);
    this.ctx.lineCap = "butt";
  }

  private drawCurrentRing(
    x: number,
    y: number,
    size: number,
    color: string,
    radiusFraction: number,
  ): void {
    const cx = x + size / 2;
    const cy = y + size / 2;
    const radius = size * radiusFraction;
    const lineW = Math.max(1.2, size * 0.07);

    if (size >= 12 && this.isHighPerformance) {
      this.ctx.shadowColor = color;
      this.ctx.shadowBlur = size * 0.3;
    }
    this.ctx.beginPath();
    this.ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = lineW;
    this.ctx.stroke();
    this.ctx.shadowBlur = 0;
    this.ctx.shadowColor = "transparent";
  }

  private drawCrossing(
    x: number,
    y: number,
    size: number,
    crossing: number,
  ): void {
    this.ctx.strokeStyle = this.colors.endpointStroke;
    this.ctx.lineWidth = Math.max(1, size * 0.09);
    this.ctx.globalAlpha = 0.65;
    this.ctx.setLineDash([Math.max(2, size * 0.12), Math.max(2, size * 0.12)]);

    if (crossing === CrossingKind.HorizontalOverVertical) {
      const cx = x + size / 2;
      this.ctx.beginPath();
      this.ctx.moveTo(cx, y + 1);
      this.ctx.lineTo(cx, y + size - 1);
      this.ctx.stroke();
    } else if (crossing === CrossingKind.VerticalOverHorizontal) {
      const cy = y + size / 2;
      this.ctx.beginPath();
      this.ctx.moveTo(x + 1, cy);
      this.ctx.lineTo(x + size - 1, cy);
      this.ctx.stroke();
    }

    this.ctx.setLineDash([]);
    this.ctx.globalAlpha = 1;
  }

  private drawWalls(index: number, x: number, y: number, size: number): void {
    const walls = this.grid.walls[index] as number;
    if (walls === 0) {
      return;
    }

    const thickness = this.settings.wallThickness ?? 0.1;
    const wallWidth = Math.max(1, Math.round(size * thickness));
    const hw = wallWidth / 2;

    // Draw walls as filled rectangles instead of stroked lines.
    // This eliminates gaps at corners where perpendicular walls meet,
    // since each wall rect extends fully into the corner pixel.

    if (this.settings.showWallShadow !== false && this.isHighPerformance) {
      const so = 0.6; // shadow offset
      this.ctx.fillStyle = this.colors.wallShadow;
      if ((walls & WallFlag.North) !== 0) {
        this.ctx.fillRect(x - so, y - hw - so, size + so * 2, wallWidth + so * 2);
      }
      if ((walls & WallFlag.South) !== 0) {
        this.ctx.fillRect(x - so, y + size - hw - so, size + so * 2, wallWidth + so * 2);
      }
      if ((walls & WallFlag.West) !== 0) {
        this.ctx.fillRect(x - hw - so, y - so, wallWidth + so * 2, size + so * 2);
      }
      if ((walls & WallFlag.East) !== 0) {
        this.ctx.fillRect(x + size - hw - so, y - so, wallWidth + so * 2, size + so * 2);
      }
    }

    this.ctx.fillStyle = this.colors.wall;
    if ((walls & WallFlag.North) !== 0) {
      this.ctx.fillRect(x, y - hw, size, wallWidth);
    }
    if ((walls & WallFlag.South) !== 0) {
      this.ctx.fillRect(x, y + size - hw, size, wallWidth);
    }
    if ((walls & WallFlag.West) !== 0) {
      this.ctx.fillRect(x - hw, y, wallWidth, size);
    }
    if ((walls & WallFlag.East) !== 0) {
      this.ctx.fillRect(x + size - hw, y, wallWidth, size);
    }
  }

  private drawEndpoints(index: number, x: number, y: number, size: number): void {
    const radius = Math.max(2, Math.floor(size * 0.2));

    if (index === 0) {
      const cx = x + 2 + radius;
      const cy = y + 2 + radius;

      // Glow
      if (size >= 12 && this.isHighPerformance) {
        this.ctx.shadowColor = this.colors.start;
        this.ctx.shadowBlur = size * 0.5;
      }

      // Outer circle
      this.ctx.beginPath();
      this.ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      this.ctx.fillStyle = this.colors.start;
      this.ctx.fill();
      this.ctx.strokeStyle = this.colors.endpointStroke;
      this.ctx.lineWidth = Math.max(0.8, size * 0.04);
      this.ctx.stroke();
      this.ctx.shadowBlur = 0;

      // Inner dot
      this.ctx.beginPath();
      this.ctx.arc(cx, cy, Math.max(1, radius * 0.35), 0, Math.PI * 2);
      this.ctx.fillStyle = "rgba(10, 20, 34, 0.9)";
      this.ctx.fill();
    }

    if (index === this.grid.cellCount - 1) {
      const cx = x + size - 2 - radius;
      const cy = y + size - 2 - radius;

      // Glow
      if (size >= 12 && this.isHighPerformance) {
        this.ctx.shadowColor = this.colors.goal;
        this.ctx.shadowBlur = size * 0.5;
      }

      // Outer circle
      this.ctx.beginPath();
      this.ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      this.ctx.fillStyle = this.colors.goal;
      this.ctx.fill();
      this.ctx.strokeStyle = this.colors.endpointStroke;
      this.ctx.lineWidth = Math.max(0.8, size * 0.04);
      this.ctx.stroke();
      this.ctx.shadowBlur = 0;

      // Cross mark
      const armLen = Math.max(1, radius * 0.5);
      this.ctx.beginPath();
      this.ctx.moveTo(cx - armLen, cy - armLen);
      this.ctx.lineTo(cx + armLen, cy + armLen);
      this.ctx.moveTo(cx + armLen, cy - armLen);
      this.ctx.lineTo(cx - armLen, cy + armLen);
      this.ctx.strokeStyle = this.colors.endpointStroke;
      this.ctx.lineWidth = Math.max(0.8, size * 0.05);
      this.ctx.lineCap = "round";
      this.ctx.stroke();
      this.ctx.lineCap = "butt";
    }
  }

  private expandDirty(cells: number[]): void {
    if (!this.dirtyMask) return;
    this.dirtyMask.fill(0);
    this.expandedDirtyIndices.length = 0;

    const { width, height } = this.grid;

    for (const index of cells) {
      // Self
      if (this.dirtyMask[index] === 0) {
        this.dirtyMask[index] = 1;
        this.expandedDirtyIndices.push(index);
      }

      const x = index % width;
      const y = Math.floor(index / width);

      // North
      if (y > 0) {
        const i = index - width;
        if (this.dirtyMask[i] === 0) {
          this.dirtyMask[i] = 1;
          this.expandedDirtyIndices.push(i);
        }
      }
      // South
      if (y + 1 < height) {
        const i = index + width;
        if (this.dirtyMask[i] === 0) {
          this.dirtyMask[i] = 1;
          this.expandedDirtyIndices.push(i);
        }
      }
      // West
      if (x > 0) {
        const i = index - 1;
        if (this.dirtyMask[i] === 0) {
          this.dirtyMask[i] = 1;
          this.expandedDirtyIndices.push(i);
        }
      }
      // East
      if (x + 1 < width) {
        const i = index + 1;
        if (this.dirtyMask[i] === 0) {
          this.dirtyMask[i] = 1;
          this.expandedDirtyIndices.push(i);
        }
      }
    }
  }

  private initBuffers(): void {
    if (!this.dirtyMask || this.dirtyMask.length !== this.grid.cellCount) {
      this.dirtyMask = new Uint8Array(this.grid.cellCount);
      this.expandedDirtyIndices = [];
    }
  }

  private ensureEffectLoop(): void {
    if (
      this.effectRafHandle !== null ||
      (this.transientEffects.length === 0 && !this.isLiveCanvasLoopRunning())
    ) {
      return;
    }

    this.effectRafHandle = requestFrame((ts) => {
      this.effectRafHandle = null;
      this.renderEffectFrame(ts);
    });
  }

  private renderEffectFrame(now: number): void {
    const dirty = [
      ...this.collectTransientEffectIndices(),
      ...this.liveCanvasIndices(),
    ];

    this.transientEffects = pruneTransientEffects(
      this.transientEffects,
      now,
      this.maxTransientEffects,
    );

    if (dirty.length > 0) {
      this.expandDirty(dirty);

      for (const index of this.expandedDirtyIndices) {
        this.drawCell(index);
      }
    }

    if (this.transientEffects.length === 0 && !this.isLiveCanvasLoopRunning()) {
      return;
    }

    this.drawTransientEffects(now);
    this.drawLiveEndpointGlow(now);
    this.ensureEffectLoop();
  }

  private drawTransientEffects(now: number): void {
    for (const effect of this.transientEffects) {
      const progress = (now - effect.bornAt) / effect.durationMs;
      if (progress < 0 || progress > 1) {
        continue;
      }

      this.drawTransientEffect(effect, progress);
    }
  }

  private drawTransientEffect(
    effect: RenderTransientEffect,
    progress: number,
  ): void {
    const x = (effect.index % this.grid.width) * this.settings.cellSize;
    const y = Math.floor(effect.index / this.grid.width) * this.settings.cellSize;
    const size = this.settings.cellSize;
    const alpha = Math.max(0, 1 - progress);
    const color = this.effectColor(effect.kind, effect.role);
    const cx = x + size / 2;
    const cy = y + size / 2;

    this.ctx.save();
    this.ctx.globalCompositeOperation = "lighter";

    if (effect.kind === "frontier-flash") {
      const flash = alpha * alpha;
      const inset = size * 0.08;
      this.ctx.globalAlpha = flash * 0.42;
      this.ctx.fillStyle = color;
      this.ctx.fillRect(x + inset, y + inset, size - inset * 2, size - inset * 2);
      this.ctx.globalAlpha = flash * 0.72;
      this.ctx.strokeStyle = color;
      this.ctx.lineWidth = Math.max(1, size * 0.08);
      this.ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
      this.ctx.restore();
      return;
    }

    if (effect.kind === "path-pulse") {
      const pulse = 0.65 + Math.sin(progress * Math.PI * 5) * 0.35;
      const inset = Math.max(1, size * 0.16);
      this.ctx.globalAlpha = alpha * pulse * 0.5;
      this.ctx.fillStyle = color;
      this.ctx.fillRect(x + inset, y + inset, size - inset * 2, size - inset * 2);
      this.ctx.globalAlpha = alpha * pulse * 0.7;
      this.ctx.strokeStyle = color;
      this.ctx.lineWidth = Math.max(1, size * 0.1);
      this.ctx.strokeRect(x + inset * 0.5, y + inset * 0.5, size - inset, size - inset);
      this.ctx.restore();
      return;
    }

    this.ctx.globalAlpha = alpha * 0.2;
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x, y, size, size);
    this.ctx.globalAlpha = alpha * 0.12;
    this.ctx.beginPath();
    this.ctx.arc(cx, cy, size * 0.42, 0, Math.PI * 2);
    this.ctx.fillStyle = color;
    this.ctx.fill();

    this.ctx.restore();
  }

  private collectTransientEffectIndices(): number[] {
    const indices: number[] = [];
    const seen = new Set<number>();

    for (const effect of this.transientEffects) {
      if (seen.has(effect.index)) {
        continue;
      }

      seen.add(effect.index);
      indices.push(effect.index);
    }

    return indices;
  }

  private redrawTransientEffectCells(): void {
    if (this.transientEffects.length === 0) {
      return;
    }

    const dirty = this.collectTransientEffectIndices();
    this.expandDirty(dirty);

    for (const index of this.expandedDirtyIndices) {
      this.drawCell(index);
    }
  }

  private redrawCells(indices: number[]): void {
    if (indices.length === 0) {
      return;
    }

    this.expandDirty(indices);

    for (const index of this.expandedDirtyIndices) {
      this.drawCell(index);
    }
  }

  private effectColor(kind: RenderEffectKind, role: RenderEffectRole): string {
    if (role === "B") {
      if (kind === "path-pulse") return this.colors.pathB;
      if (kind === "frontier-flash") return this.colors.frontierB;
      return this.colors.visitedB;
    }

    if (kind === "path-pulse") return this.colors.pathA;
    if (kind === "frontier-flash") return this.colors.frontierA;
    return this.colors.visitedA;
  }

  private liveCanvasIndices(): number[] {
    if (!this.isLiveCanvasLoopRunning()) {
      return [];
    }

    return this.endpointIndices();
  }

  private endpointIndices(): number[] {
    if (this.grid.cellCount <= 1) {
      return [0];
    }

    return [0, this.grid.cellCount - 1];
  }

  private drawLiveEndpointGlow(now: number): void {
    if (!this.isLiveCanvasLoopRunning()) {
      return;
    }

    const size = this.settings.cellSize;
    if (size < 8) {
      return;
    }

    const pulse = 0.5 + Math.sin(now / 260) * 0.5;
    const haloAlpha = 0.22 + pulse * 0.22;
    this.drawEndpointHalo(0, this.colors.start, haloAlpha, true);
    this.drawEndpointHalo(this.grid.cellCount - 1, this.colors.goal, haloAlpha, false);
  }

  private drawEndpointHalo(
    index: number,
    color: string,
    alpha: number,
    isStart: boolean,
  ): void {
    const size = this.settings.cellSize;
    const x = (index % this.grid.width) * size;
    const y = Math.floor(index / this.grid.width) * size;
    const baseRadius = Math.max(2, Math.floor(size * 0.2));
    const cx = isStart ? x + 2 + baseRadius : x + size - 2 - baseRadius;
    const cy = isStart ? y + 2 + baseRadius : y + size - 2 - baseRadius;
    const radius = baseRadius * 2.2;

    this.ctx.save();
    this.ctx.globalCompositeOperation = "lighter";
    this.ctx.globalAlpha = alpha;
    this.ctx.shadowColor = color;
    this.ctx.shadowBlur = size * 0.75;
    this.ctx.beginPath();
    this.ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = Math.max(1, size * 0.08);
    this.ctx.stroke();
    this.ctx.restore();
  }

  private isLiveCanvasLoopRunning(): boolean {
    return shouldRunLiveCanvasLoop(this.motionState);
  }

  private clearTransientEffects(): void {
    this.transientEffects = [];

    if (this.effectRafHandle === null) {
      return;
    }

    cancelFrame(this.effectRafHandle);
    this.effectRafHandle = null;
  }
}

function requestFrame(callback: (ts: number) => void): number {
  if (typeof globalThis.requestAnimationFrame === "function") {
    return globalThis.requestAnimationFrame(callback);
  }

  return setTimeout(() => callback(nowMs()), 16) as unknown as number;
}

function cancelFrame(handle: number): void {
  if (typeof globalThis.cancelAnimationFrame === "function") {
    globalThis.cancelAnimationFrame(handle);
    return;
  }

  clearTimeout(handle);
}

function nowMs(): number {
  if (typeof globalThis.performance !== "undefined") {
    return globalThis.performance.now();
  }

  return Date.now();
}
