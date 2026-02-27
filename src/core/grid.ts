import type { CellPatch } from "@/core/patches";

export const enum WallFlag {
  North = 1,
  East = 2,
  South = 4,
  West = 8,
}

export const ALL_WALLS =
  WallFlag.North | WallFlag.East | WallFlag.South | WallFlag.West;

export const enum OverlayFlag {
  Visited = 1,
  Frontier = 2,
  Path = 4,
  Current = 8,
  VisitedB = 16,
  FrontierB = 32,
  PathB = 64,
  CurrentB = 128,
}

export const PRIMARY_OVERLAY_MASK =
  OverlayFlag.Visited |
  OverlayFlag.Frontier |
  OverlayFlag.Path |
  OverlayFlag.Current;

export const SECONDARY_OVERLAY_MASK =
  OverlayFlag.VisitedB |
  OverlayFlag.FrontierB |
  OverlayFlag.PathB |
  OverlayFlag.CurrentB;

export const ALL_SOLVER_OVERLAY_MASK =
  PRIMARY_OVERLAY_MASK | SECONDARY_OVERLAY_MASK;

export const ANY_VISITED_OVERLAY_MASK =
  OverlayFlag.Visited | OverlayFlag.VisitedB;

export const ANY_FRONTIER_OVERLAY_MASK =
  OverlayFlag.Frontier | OverlayFlag.FrontierB;

export const ANY_PATH_OVERLAY_MASK = OverlayFlag.Path | OverlayFlag.PathB;

export const enum CrossingKind {
  None = 0,
  HorizontalOverVertical = 1,
  VerticalOverHorizontal = 2,
}

export interface Grid {
  width: number;
  height: number;
  cellCount: number;
  walls: Uint8Array;
  overlays: Uint16Array;
  crossings: Uint8Array;
  tunnels: Int32Array;
}

export interface Direction {
  name: "N" | "E" | "S" | "W";
  dx: number;
  dy: number;
  wall: WallFlag;
  opposite: WallFlag;
}

export interface Neighbor {
  index: number;
  direction: Direction;
  x: number;
  y: number;
}

export const DIRECTIONS: readonly Direction[] = [
  {
    name: "N",
    dx: 0,
    dy: -1,
    wall: WallFlag.North,
    opposite: WallFlag.South,
  },
  {
    name: "E",
    dx: 1,
    dy: 0,
    wall: WallFlag.East,
    opposite: WallFlag.West,
  },
  {
    name: "S",
    dx: 0,
    dy: 1,
    wall: WallFlag.South,
    opposite: WallFlag.North,
  },
  {
    name: "W",
    dx: -1,
    dy: 0,
    wall: WallFlag.West,
    opposite: WallFlag.East,
  },
] as const;

export function createGrid(width: number, height: number): Grid {
  const cellCount = width * height;
  const walls = new Uint8Array(cellCount);
  walls.fill(ALL_WALLS);

  return {
    width,
    height,
    cellCount,
    walls,
    overlays: new Uint16Array(cellCount),
    crossings: new Uint8Array(cellCount),
    tunnels: new Int32Array(cellCount).fill(-1),
  };
}

export function idx(grid: Grid, x: number, y: number): number {
  return y * grid.width + x;
}

export function xFromIdx(grid: Grid, index: number): number {
  return index % grid.width;
}

export function yFromIdx(grid: Grid, index: number): number {
  return Math.floor(index / grid.width);
}

export function inBounds(grid: Grid, x: number, y: number): boolean {
  return x >= 0 && x < grid.width && y >= 0 && y < grid.height;
}

export function neighbors(grid: Grid, index: number): Neighbor[] {
  const x = xFromIdx(grid, index);
  const y = yFromIdx(grid, index);
  const result: Neighbor[] = [];

  for (const direction of DIRECTIONS) {
    const nx = x + direction.dx;
    const ny = y + direction.dy;
    if (!inBounds(grid, nx, ny)) {
      continue;
    }

    result.push({
      index: idx(grid, nx, ny),
      direction,
      x: nx,
      y: ny,
    });
  }

  return result;
}

export function connectedNeighbors(grid: Grid, index: number): number[] {
  const all = neighbors(grid, index);
  const output: number[] = [];

  for (const neighbor of all) {
    if ((grid.walls[index] & neighbor.direction.wall) === 0) {
      output.push(neighbor.index);
    }
  }

  return output;
}

export function traversableNeighbors(grid: Grid, index: number): number[] {
  const output = connectedNeighbors(grid, index);
  const tunnel = grid.tunnels[index] as number;
  if (tunnel >= 0) {
    output.push(tunnel);
  }

  return output;
}

export function carvePatch(
  fromIndex: number,
  toIndex: number,
  wallFrom: WallFlag,
  wallTo: WallFlag,
): CellPatch[] {
  return [
    {
      index: fromIndex,
      wallClear: wallFrom,
    },
    {
      index: toIndex,
      wallClear: wallTo,
    },
  ];
}

export function clearOverlays(grid: Grid, mask?: number): void {
  if (typeof mask === "number") {
    const invertMask = ~mask;
    for (let i = 0; i < grid.cellCount; i += 1) {
      grid.overlays[i] &= invertMask;
    }
    return;
  }

  grid.overlays.fill(0);
}

export function applyCellPatch(grid: Grid, patch: CellPatch): void {
  const i = patch.index;

  if (typeof patch.wallSet === "number") {
    grid.walls[i] |= patch.wallSet;
  }

  if (typeof patch.wallClear === "number") {
    grid.walls[i] &= ~patch.wallClear;
  }

  if (typeof patch.overlaySet === "number") {
    grid.overlays[i] |= patch.overlaySet;
  }

  if (typeof patch.overlayClear === "number") {
    grid.overlays[i] &= ~patch.overlayClear;
  }

  if (typeof patch.crossingSet === "number") {
    grid.crossings[i] = patch.crossingSet;
  }

  if (typeof patch.tunnelToSet === "number") {
    grid.tunnels[i] = patch.tunnelToSet;
  }
}
