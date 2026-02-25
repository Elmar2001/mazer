export interface GeneratorRunOptions {
  startIndex?: number;
}

export interface SolverRunOptions {
  startIndex: number;
  goalIndex: number;
}

export interface AlgorithmStepMeta {
  [key: string]: number | string | boolean | undefined;
  visitedCount?: number;
  frontierSize?: number;
  pathLength?: number;
  solved?: boolean;
}
