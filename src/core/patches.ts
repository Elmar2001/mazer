export interface CellPatch {
  index: number;
  wallSet?: number;
  wallClear?: number;
  overlaySet?: number;
  overlayClear?: number;
}

export type StepMeta = Record<string, number | string | boolean | undefined>;

export interface StepResult<TMeta extends StepMeta = StepMeta> {
  done: boolean;
  patches: CellPatch[];
  meta?: TMeta;
}
