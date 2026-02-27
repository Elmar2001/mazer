import { traversableNeighbors } from "@/core/grid";
import type { Grid } from "@/core/grid";

export function getOpenNeighbors(grid: Grid, index: number): number[] {
  return traversableNeighbors(grid, index);
}

export function buildPath(
  startIndex: number,
  goalIndex: number,
  parents: Int32Array,
): number[] {
  if (startIndex === goalIndex) {
    return [startIndex];
  }

  if (parents[goalIndex] === -1) {
    return [];
  }

  const path: number[] = [];
  let current = goalIndex;

  while (current !== startIndex) {
    path.push(current);
    current = parents[current] as number;
    if (current < 0) {
      return [];
    }
  }

  path.push(startIndex);
  path.reverse();

  return path;
}

export function manhattan(
  width: number,
  fromIndex: number,
  toIndex: number,
): number {
  const fx = fromIndex % width;
  const fy = Math.floor(fromIndex / width);
  const tx = toIndex % width;
  const ty = Math.floor(toIndex / width);

  return Math.abs(fx - tx) + Math.abs(fy - ty);
}
