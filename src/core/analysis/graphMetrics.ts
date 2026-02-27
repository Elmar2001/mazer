import { traversableNeighbors, type Grid } from "@/core/grid";

export interface MazeGraphMetrics {
  edgeCount: number;
  cycleCount: number;
  deadEndCount: number;
  junctionCount: number;
  shortestPathCount: number;
  shortestPathCountCapped: boolean;
}

interface ShortestPathCountResult {
  count: number;
  capped: boolean;
}

const DEFAULT_PATH_COUNT_CAP = 1_000_000;

export function analyzeMazeGraph(
  grid: Grid,
  startIndex: number,
  goalIndex: number,
  pathCountCap = DEFAULT_PATH_COUNT_CAP,
): MazeGraphMetrics {
  const degrees = new Int16Array(grid.cellCount);
  let degreeSum = 0;
  let deadEndCount = 0;
  let junctionCount = 0;

  for (let i = 0; i < grid.cellCount; i += 1) {
    const degree = traversableNeighbors(grid, i).length;
    degrees[i] = degree;
    degreeSum += degree;

    if (degree <= 1) {
      deadEndCount += 1;
    }

    if (degree >= 3) {
      junctionCount += 1;
    }
  }

  const edgeCount = Math.floor(degreeSum / 2);
  const componentCount = countComponents(grid);
  const cycleCount = Math.max(0, edgeCount - grid.cellCount + componentCount);
  const shortest = countShortestPaths(grid, startIndex, goalIndex, pathCountCap);

  return {
    edgeCount,
    cycleCount,
    deadEndCount,
    junctionCount,
    shortestPathCount: shortest.count,
    shortestPathCountCapped: shortest.capped,
  };
}

function countComponents(grid: Grid): number {
  const visited = new Uint8Array(grid.cellCount);
  let components = 0;

  for (let i = 0; i < grid.cellCount; i += 1) {
    if (visited[i] === 1) {
      continue;
    }

    components += 1;
    const queue = [i];
    visited[i] = 1;
    let head = 0;

    while (head < queue.length) {
      const node = queue[head] as number;
      head += 1;

      for (const neighbor of traversableNeighbors(grid, node)) {
        if (visited[neighbor] === 1) {
          continue;
        }

        visited[neighbor] = 1;
        queue.push(neighbor);
      }
    }
  }

  return components;
}

function countShortestPaths(
  grid: Grid,
  startIndex: number,
  goalIndex: number,
  cap: number,
): ShortestPathCountResult {
  if (
    startIndex < 0 ||
    goalIndex < 0 ||
    startIndex >= grid.cellCount ||
    goalIndex >= grid.cellCount
  ) {
    return {
      count: 0,
      capped: false,
    };
  }

  if (startIndex === goalIndex) {
    return {
      count: 1,
      capped: false,
    };
  }

  const distances = new Int32Array(grid.cellCount);
  distances.fill(-1);

  const queue = [startIndex];
  distances[startIndex] = 0;
  let head = 0;

  while (head < queue.length) {
    const node = queue[head] as number;
    head += 1;

    for (const neighbor of traversableNeighbors(grid, node)) {
      if (distances[neighbor] !== -1) {
        continue;
      }

      distances[neighbor] = (distances[node] as number) + 1;
      queue.push(neighbor);
    }
  }

  if (distances[goalIndex] < 0) {
    return {
      count: 0,
      capped: false,
    };
  }

  const counts = new Float64Array(grid.cellCount);
  counts[startIndex] = 1;
  let capped = false;

  for (const node of queue) {
    const count = counts[node] as number;
    if (count === 0) {
      continue;
    }

    const distance = distances[node] as number;

    for (const neighbor of traversableNeighbors(grid, node)) {
      if (distances[neighbor] !== distance + 1) {
        continue;
      }

      const nextCount = (counts[neighbor] as number) + count;
      if (nextCount >= cap) {
        counts[neighbor] = cap;
        capped = true;
      } else {
        counts[neighbor] = nextCount;
      }
    }
  }

  return {
    count: Math.floor(counts[goalIndex] as number),
    capped,
  };
}
