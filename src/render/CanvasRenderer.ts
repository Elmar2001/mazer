import { OverlayFlag, WallFlag, type Grid } from "@/core/grid";

export interface CanvasRendererSettings {
  cellSize: number;
  showVisited: boolean;
  showFrontier: boolean;
  showPath: boolean;
}

const COLORS = {
  background: "#0f1318",
  cell: "#151d24",
  wall: "#f1f5f9",
  visitedA: "rgba(71, 159, 230, 0.30)",
  frontierA: "rgba(245, 158, 11, 0.45)",
  pathA: "rgba(34, 197, 94, 0.70)",
  visitedB: "rgba(244, 114, 182, 0.34)",
  frontierB: "rgba(251, 113, 133, 0.50)",
  pathB: "rgba(251, 146, 60, 0.72)",
  start: "#22d3ee",
  goal: "#fb7185",
  currentRingA: "rgba(255, 255, 255, 0.75)",
  currentRingB: "rgba(251, 191, 36, 0.85)",
};

export class CanvasRenderer {
  private readonly canvas: HTMLCanvasElement;

  private readonly ctx: CanvasRenderingContext2D;

  private grid: Grid;

  private settings: CanvasRendererSettings;

  private dpr = 1;

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

    this.resize();
    this.renderAll();
  }

  setGrid(grid: Grid): void {
    this.grid = grid;
    this.resize();
    this.renderAll();
  }

  setSettings(settings: Partial<CanvasRendererSettings>): void {
    this.settings = {
      ...this.settings,
      ...settings,
    };

    this.resize();
    this.renderAll();
  }

  resize(): void {
    const widthPx = this.grid.width * this.settings.cellSize;
    const heightPx = this.grid.height * this.settings.cellSize;

    this.dpr = Math.max(1, Math.floor(globalThis.devicePixelRatio ?? 1));

    this.canvas.style.width = `${widthPx}px`;
    this.canvas.style.height = `${heightPx}px`;
    this.canvas.width = Math.floor(widthPx * this.dpr);
    this.canvas.height = Math.floor(heightPx * this.dpr);

    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
  }

  renderAll(): void {
    const widthPx = this.grid.width * this.settings.cellSize;
    const heightPx = this.grid.height * this.settings.cellSize;

    this.ctx.fillStyle = COLORS.background;
    this.ctx.fillRect(0, 0, widthPx, heightPx);

    for (let index = 0; index < this.grid.cellCount; index += 1) {
      this.drawCell(index);
    }
  }

  renderDirty(dirtyCells: number[]): void {
    if (dirtyCells.length === 0) {
      return;
    }

    const expanded = this.expandDirty(dirtyCells);
    for (const index of expanded) {
      this.drawCell(index);
    }
  }

  private drawCell(index: number): void {
    const x = (index % this.grid.width) * this.settings.cellSize;
    const y = Math.floor(index / this.grid.width) * this.settings.cellSize;
    const size = this.settings.cellSize;

    this.ctx.fillStyle = COLORS.cell;
    this.ctx.fillRect(x, y, size, size);

    const overlays = this.grid.overlays[index] as number;

    if (this.settings.showVisited && (overlays & OverlayFlag.Visited) !== 0) {
      this.ctx.fillStyle = COLORS.visitedA;
      this.ctx.fillRect(x + 1, y + 1, Math.max(1, size - 2), Math.max(1, size - 2));
    }

    if (this.settings.showVisited && (overlays & OverlayFlag.VisitedB) !== 0) {
      this.ctx.fillStyle = COLORS.visitedB;
      this.ctx.fillRect(x + 3, y + 3, Math.max(1, size - 6), Math.max(1, size - 6));
    }

    if (this.settings.showFrontier && (overlays & OverlayFlag.Frontier) !== 0) {
      this.ctx.fillStyle = COLORS.frontierA;
      this.ctx.fillRect(x + 2, y + 2, Math.max(1, size - 4), Math.max(1, size - 4));
    }

    if (this.settings.showFrontier && (overlays & OverlayFlag.FrontierB) !== 0) {
      this.ctx.strokeStyle = COLORS.frontierB;
      this.ctx.lineWidth = 1.2;
      this.ctx.strokeRect(x + 4, y + 4, Math.max(1, size - 8), Math.max(1, size - 8));
    }

    if (this.settings.showPath && (overlays & OverlayFlag.Path) !== 0) {
      this.ctx.fillStyle = COLORS.pathA;
      this.ctx.fillRect(x + 3, y + 3, Math.max(1, size - 6), Math.max(1, size - 6));
    }

    if (this.settings.showPath && (overlays & OverlayFlag.PathB) !== 0) {
      this.ctx.fillStyle = COLORS.pathB;
      this.ctx.beginPath();
      this.ctx.arc(
        x + size * 0.5,
        y + size * 0.5,
        Math.max(1.5, size * 0.22),
        0,
        Math.PI * 2,
      );
      this.ctx.fill();
    }

    if ((overlays & OverlayFlag.Current) !== 0) {
      this.ctx.strokeStyle = COLORS.currentRingA;
      this.ctx.lineWidth = 1.5;
      this.ctx.strokeRect(x + 2, y + 2, Math.max(1, size - 4), Math.max(1, size - 4));
    }

    if ((overlays & OverlayFlag.CurrentB) !== 0) {
      this.ctx.strokeStyle = COLORS.currentRingB;
      this.ctx.lineWidth = 1.3;
      this.ctx.strokeRect(x + 4, y + 4, Math.max(1, size - 8), Math.max(1, size - 8));
    }

    this.drawWalls(index, x, y, size);
    this.drawEndpoints(index, x, y, size);
  }

  private drawWalls(index: number, x: number, y: number, size: number): void {
    const walls = this.grid.walls[index] as number;

    this.ctx.strokeStyle = COLORS.wall;
    this.ctx.lineWidth = 1.2;
    this.ctx.beginPath();

    if ((walls & WallFlag.North) !== 0) {
      this.ctx.moveTo(x, y);
      this.ctx.lineTo(x + size, y);
    }

    if ((walls & WallFlag.East) !== 0) {
      this.ctx.moveTo(x + size, y);
      this.ctx.lineTo(x + size, y + size);
    }

    if ((walls & WallFlag.South) !== 0) {
      this.ctx.moveTo(x + size, y + size);
      this.ctx.lineTo(x, y + size);
    }

    if ((walls & WallFlag.West) !== 0) {
      this.ctx.moveTo(x, y + size);
      this.ctx.lineTo(x, y);
    }

    this.ctx.stroke();
  }

  private drawEndpoints(index: number, x: number, y: number, size: number): void {
    const r = Math.max(2, Math.floor(size * 0.2));

    if (index === 0) {
      this.ctx.fillStyle = COLORS.start;
      this.ctx.beginPath();
      this.ctx.arc(x + r + 2, y + r + 2, r, 0, Math.PI * 2);
      this.ctx.fill();
    }

    if (index === this.grid.cellCount - 1) {
      this.ctx.fillStyle = COLORS.goal;
      this.ctx.beginPath();
      this.ctx.arc(x + size - r - 2, y + size - r - 2, r, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }

  private expandDirty(cells: number[]): number[] {
    const output = new Set<number>();

    for (const index of cells) {
      output.add(index);
      const x = index % this.grid.width;
      const y = Math.floor(index / this.grid.width);

      if (x > 0) {
        output.add(index - 1);
      }

      if (x + 1 < this.grid.width) {
        output.add(index + 1);
      }

      if (y > 0) {
        output.add(index - this.grid.width);
      }

      if (y + 1 < this.grid.height) {
        output.add(index + this.grid.width);
      }
    }

    return Array.from(output);
  }
}
