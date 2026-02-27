export interface GeneratorRunOptions {
  startIndex?: number;
  [key: string]: number | string | boolean | undefined;
}

export interface SolverRunOptions {
  startIndex: number;
  goalIndex: number;
  [key: string]: number | string | boolean | undefined;
}

export interface AlgorithmStepMeta {
  [key: string]: number | string | boolean | undefined;
  line?: number;
  visitedCount?: number;
  frontierSize?: number;
  pathLength?: number;
  solved?: boolean;
}
