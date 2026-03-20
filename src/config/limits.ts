export const SPEED_MIN = 1;
export const SPEED_MAX = 16_000;

export const GRID_MIN = 2;
export const GRID_MAX = 200;
export const GRID_MAX_CELLS = 40_000;

export const CELL_MIN = 2;
export const CELL_MAX = 40;

export const VIEWPORT_MAX_DIMENSION_PX = 16_384;
export const VIEWPORT_MAX_PIXELS = 25_000_000;

export const ENGINE_MAX_STEPS_PER_FRAME = 2_000;

export const RENDERING_SHADOW_SPEED_THRESHOLD = 150;
export const RENDERING_SHADOW_CELL_SIZE_THRESHOLD = 8;

export const CANVAS_MAX_BACKING_DIMENSION = 16_384;
export const CANVAS_MAX_BACKING_PIXELS = 48_000_000;

export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) {
    return min;
  }

  return Math.max(min, Math.min(max, value));
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return clamp(Math.floor(value), min, max);
}

export function clampSpeed(value: number): number {
  return clampInt(value, SPEED_MIN, SPEED_MAX);
}

function getGridAxisMaxByCells(otherAxis: number): number {
  const safeOtherAxis = clampInt(otherAxis, GRID_MIN, GRID_MAX);
  const maxByCells = Math.floor(GRID_MAX_CELLS / safeOtherAxis);

  return Math.max(GRID_MIN, Math.min(GRID_MAX, maxByCells));
}

export function clampGridWidthByCells(width: number, height: number): number {
  return clampInt(width, GRID_MIN, getGridAxisMaxByCells(height));
}

export function clampGridHeightByCells(height: number, width: number): number {
  return clampInt(height, GRID_MIN, getGridAxisMaxByCells(width));
}

export function clampGridSizeByCells(
  width: number,
  height: number,
): { width: number; height: number } {
  let safeHeight = clampInt(height, GRID_MIN, GRID_MAX);
  let safeWidth = clampGridWidthByCells(width, safeHeight);
  safeHeight = clampGridHeightByCells(safeHeight, safeWidth);
  safeWidth = clampGridWidthByCells(safeWidth, safeHeight);

  return {
    width: safeWidth,
    height: safeHeight,
  };
}

export function getGridWidthMax(height: number, cellSize: number): number {
  const safeHeight = clampInt(height, GRID_MIN, GRID_MAX);
  const safeCellSize = clampInt(cellSize, CELL_MIN, CELL_MAX);
  const maxByCells = getGridAxisMaxByCells(safeHeight);
  const maxByDimension = Math.floor(VIEWPORT_MAX_DIMENSION_PX / safeCellSize);
  const maxByPixels = Math.floor(
    VIEWPORT_MAX_PIXELS / (safeHeight * safeCellSize * safeCellSize),
  );

  return Math.max(
    GRID_MIN,
    Math.min(GRID_MAX, maxByCells, maxByDimension, maxByPixels),
  );
}

export function getGridHeightMax(width: number, cellSize: number): number {
  const safeWidth = clampInt(width, GRID_MIN, GRID_MAX);
  const safeCellSize = clampInt(cellSize, CELL_MIN, CELL_MAX);
  const maxByCells = getGridAxisMaxByCells(safeWidth);
  const maxByDimension = Math.floor(VIEWPORT_MAX_DIMENSION_PX / safeCellSize);
  const maxByPixels = Math.floor(
    VIEWPORT_MAX_PIXELS / (safeWidth * safeCellSize * safeCellSize),
  );

  return Math.max(
    GRID_MIN,
    Math.min(GRID_MAX, maxByCells, maxByDimension, maxByPixels),
  );
}

export function getCellSizeMax(width: number, height: number): number {
  const safeWidth = clampInt(width, GRID_MIN, GRID_MAX);
  const safeHeight = clampInt(height, GRID_MIN, GRID_MAX);
  const maxByWidth = Math.floor(VIEWPORT_MAX_DIMENSION_PX / safeWidth);
  const maxByHeight = Math.floor(VIEWPORT_MAX_DIMENSION_PX / safeHeight);
  const maxByPixels = Math.floor(
    Math.sqrt(VIEWPORT_MAX_PIXELS / (safeWidth * safeHeight)),
  );

  return Math.max(CELL_MIN, Math.min(CELL_MAX, maxByWidth, maxByHeight, maxByPixels));
}

export function clampGridWidth(
  width: number,
  height: number,
  cellSize: number,
): number {
  return clampInt(width, GRID_MIN, getGridWidthMax(height, cellSize));
}

export function clampGridHeight(
  height: number,
  width: number,
  cellSize: number,
): number {
  return clampInt(height, GRID_MIN, getGridHeightMax(width, cellSize));
}

export function clampCellSize(
  cellSize: number,
  width: number,
  height: number,
): number {
  return clampInt(cellSize, CELL_MIN, getCellSizeMax(width, height));
}
