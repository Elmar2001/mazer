import { CrossingKind, OverlayFlag, WallFlag, type Grid } from "@/core/grid";
import {
  CANVAS_MAX_BACKING_DIMENSION,
  CANVAS_MAX_BACKING_PIXELS,
  RENDERING_SHADOW_CELL_SIZE_THRESHOLD,
  RENDERING_SHADOW_SPEED_THRESHOLD,
} from "@/config/limits";
import { DEFAULT_COLOR_THEME, type ColorTheme } from "@/render/colorPresets";

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
  }

  setGrid(grid: Grid): void {
    this.grid = grid;
    this.resize();
    this.initBuffers();
    this.renderAll();
  }

  setSettings(settings: Partial<CanvasRendererSettings>): void {
    this.settings = {
      ...this.settings,
      ...settings,
    };

    if (settings.colors) {
      this.colors = settings.colors;
    }

    this.resize();
    this.initBuffers();
    this.renderAll();
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

  renderDirty(dirtyCells: number[], speed = 0): void {
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
  }

  private drawCell(index: number, skipBaseFill = false): void {
    const x = (index % this.grid.width) * this.settings.cellSize;
    const y = Math.floor(index / this.grid.width) * this.settings.cellSize;
    const size = this.settings.cellSize;
    const row = Math.floor(index / this.grid.width);
    const col = index % this.grid.width;

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
}
