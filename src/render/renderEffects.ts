import { OverlayFlag } from "@/core/grid";
import type { CellPatch } from "@/core/patches";

export type RenderMotionMode = "full" | "lite" | "off";

export type RenderEffectKind =
  | "frontier-flash"
  | "visited-tint"
  | "path-pulse";

export type RenderEffectRole = "A" | "B";

export interface RenderMotionLoad {
  cellSize: number;
  dirtyCellCount: number;
  reducedMotion: boolean;
  speed: number;
}

export type RenderAnimationPhase =
  | "idle"
  | "generating"
  | "generated"
  | "solving"
  | "solved";

export interface RenderLiveMotionState {
  phase: RenderAnimationPhase;
  paused: boolean;
  reducedMotion: boolean;
}

export interface RenderTransientEffect {
  id: number;
  index: number;
  kind: RenderEffectKind;
  role: RenderEffectRole;
  bornAt: number;
  durationMs: number;
}

const CELL_SIZE_EFFECT_MIN = 8;
const DIRTY_CELLS_LITE_THRESHOLD = 220;
const DIRTY_CELLS_OFF_THRESHOLD = 640;
const SPEED_LITE_THRESHOLD = 1_200;
const SPEED_OFF_THRESHOLD = 6_000;

const EFFECT_DURATIONS: Record<RenderEffectKind, number> = {
  "frontier-flash": 280,
  "visited-tint": 520,
  "path-pulse": 920,
};

let nextEffectId = 1;

export function resolveRenderMotionMode(load: RenderMotionLoad): RenderMotionMode {
  if (load.reducedMotion || load.cellSize < CELL_SIZE_EFFECT_MIN) {
    return "off";
  }

  if (
    load.speed >= SPEED_OFF_THRESHOLD ||
    load.dirtyCellCount > DIRTY_CELLS_OFF_THRESHOLD
  ) {
    return "off";
  }

  if (
    load.speed >= SPEED_LITE_THRESHOLD ||
    load.dirtyCellCount > DIRTY_CELLS_LITE_THRESHOLD
  ) {
    return "lite";
  }

  return "full";
}

export function classifyPatchEffects(
  patches: readonly CellPatch[],
  bornAt: number,
  mode: RenderMotionMode,
): RenderTransientEffect[] {
  if (mode === "off") {
    return [];
  }

  const effects: RenderTransientEffect[] = [];

  for (const patch of patches) {
    if (
      typeof patch.wallClear === "number" ||
      typeof patch.wallSet === "number" ||
      typeof patch.crossingSet === "number" ||
      typeof patch.tunnelToSet === "number"
    ) {
      effects.push(createEffect(patch.index, "frontier-flash", "A", bornAt));
    }

    const overlaySet = patch.overlaySet ?? 0;

    addOverlayEffect(
      effects,
      patch.index,
      overlaySet,
      OverlayFlag.Visited,
      "visited-tint",
      "A",
      bornAt,
      mode,
    );
    addOverlayEffect(
      effects,
      patch.index,
      overlaySet,
      OverlayFlag.VisitedB,
      "visited-tint",
      "B",
      bornAt,
      mode,
    );
    addOverlayEffect(
      effects,
      patch.index,
      overlaySet,
      OverlayFlag.Frontier,
      "frontier-flash",
      "A",
      bornAt,
      mode,
    );
    addOverlayEffect(
      effects,
      patch.index,
      overlaySet,
      OverlayFlag.FrontierB,
      "frontier-flash",
      "B",
      bornAt,
      mode,
    );
    addOverlayEffect(
      effects,
      patch.index,
      overlaySet,
      OverlayFlag.Current,
      "frontier-flash",
      "A",
      bornAt,
      mode,
    );
    addOverlayEffect(
      effects,
      patch.index,
      overlaySet,
      OverlayFlag.CurrentB,
      "frontier-flash",
      "B",
      bornAt,
      mode,
    );
    addOverlayEffect(
      effects,
      patch.index,
      overlaySet,
      OverlayFlag.Path,
      "path-pulse",
      "A",
      bornAt,
      mode,
    );
    addOverlayEffect(
      effects,
      patch.index,
      overlaySet,
      OverlayFlag.PathB,
      "path-pulse",
      "B",
      bornAt,
      mode,
    );
  }

  return effects;
}

export function pruneTransientEffects(
  effects: readonly RenderTransientEffect[],
  now: number,
  maxEffects: number,
): RenderTransientEffect[] {
  const alive = effects.filter((effect) => now - effect.bornAt <= effect.durationMs);

  if (alive.length <= maxEffects) {
    return alive;
  }

  return alive.slice(alive.length - maxEffects);
}

export function shouldRunLiveCanvasLoop(state: RenderLiveMotionState): boolean {
  if (state.reducedMotion || state.paused) {
    return false;
  }

  return state.phase === "generating" || state.phase === "solving";
}

function addOverlayEffect(
  effects: RenderTransientEffect[],
  index: number,
  overlaySet: number,
  flag: OverlayFlag,
  kind: RenderEffectKind,
  role: RenderEffectRole,
  bornAt: number,
  mode: RenderMotionMode,
): void {
  if ((overlaySet & flag) === 0) {
    return;
  }

  if (mode === "lite" && kind !== "frontier-flash" && kind !== "path-pulse") {
    return;
  }

  effects.push(createEffect(index, kind, role, bornAt));
}

function createEffect(
  index: number,
  kind: RenderEffectKind,
  role: RenderEffectRole,
  bornAt: number,
): RenderTransientEffect {
  return {
    id: nextEffectId++,
    index,
    kind,
    role,
    bornAt,
    durationMs: EFFECT_DURATIONS[kind],
  };
}
