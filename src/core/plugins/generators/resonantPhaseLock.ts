import { carvePatch, neighbors, OverlayFlag, type Grid } from "@/core/grid";
import type { CellPatch } from "@/core/patches";
import type { GeneratorPlugin } from "@/core/plugins/GeneratorPlugin";
import type {
  AlgorithmStepMeta,
  GeneratorRunOptions,
} from "@/core/plugins/types";
import type { RandomSource } from "@/core/rng";

interface InterferenceEmitter {
  x: number;
  y: number;
  radialFreq: number;
  directionalFreq: number;
  dirX: number;
  dirY: number;
  phaseOffset: number;
  amplitude: number;
}

interface ResonantParentChoice {
  parent: number;
  cellWall: number;
  parentWall: number;
  score: number;
}

interface ResonantFrontierPick extends ResonantParentChoice {
  frontierPos: number;
  cell: number;
}

interface ResonantContext {
  grid: Grid;
  rng: RandomSource;
  started: boolean;
  startIndex: number;
  visited: Uint8Array;
  frontierFlags: Uint8Array;
  frontier: number[];
  resonance: Float32Array;
  field: Float32Array;
  phase: Float32Array;
  visitedCount: number;
  current: number;
}

const PHASE_BLEND = 0.62;
const LOCAL_PULSE = 0.28;
const RESONANCE_DECAY = 0.55;

export const resonantPhaseLockGenerator: GeneratorPlugin<
  GeneratorRunOptions,
  AlgorithmStepMeta
> = {
  id: "resonant-phase-lock",
  label: "Resonant Phase-Lock (Wave-Field Growing Tree)",
  tier: "advanced",
  implementationKind: "native",
  create({ grid, rng, options }) {
    const start =
      typeof options.startIndex === "number" &&
      options.startIndex >= 0 &&
      options.startIndex < grid.cellCount
        ? options.startIndex
        : rng.nextInt(grid.cellCount);

    const context: ResonantContext = {
      grid,
      rng,
      started: false,
      startIndex: start,
      visited: new Uint8Array(grid.cellCount),
      frontierFlags: new Uint8Array(grid.cellCount),
      frontier: [],
      resonance: new Float32Array(grid.cellCount),
      field: buildInterferenceField(grid, rng),
      phase: new Float32Array(grid.cellCount),
      visitedCount: 0,
      current: -1,
    };

    return {
      step: () => stepResonantPhaseLock(context),
    };
  },
};

function stepResonantPhaseLock(context: ResonantContext) {
  const patches: CellPatch[] = [];

  if (!context.started) {
    context.started = true;
    context.visited[context.startIndex] = 1;
    context.phase[context.startIndex] = context.field[context.startIndex] as number;
    context.visitedCount = 1;

    const startOverlay =
      context.grid.cellCount <= 1
        ? OverlayFlag.Visited
        : OverlayFlag.Visited | OverlayFlag.Current;

    patches.push({
      index: context.startIndex,
      overlaySet: startOverlay,
    });

    context.current = context.grid.cellCount <= 1 ? -1 : context.startIndex;
    addFrontier(context, context.startIndex, patches);

    return {
      done: context.grid.cellCount <= 1,
      patches,
      meta: {
        line: 1,
        visitedCount: context.visitedCount,
        frontierSize: context.frontier.length,
      },
    };
  }

  if (context.current !== -1) {
    patches.push({
      index: context.current,
      overlayClear: OverlayFlag.Current,
    });
    context.current = -1;
  }

  if (context.frontier.length === 0) {
    return {
      done: true,
      patches,
      meta: {
        line: 2,
        visitedCount: context.visitedCount,
        frontierSize: 0,
      },
    };
  }

  const pick = chooseFrontierCell(context);
  removeFrontier(context, pick.frontierPos, pick.cell);

  patches.push({
    index: pick.cell,
    overlayClear: OverlayFlag.Frontier,
  });
  patches.push(
    ...carvePatch(pick.cell, pick.parent, pick.cellWall, pick.parentWall),
  );

  context.visited[pick.cell] = 1;
  context.visitedCount += 1;
  context.phase[pick.cell] = blendCircular(
    context.phase[pick.parent] as number,
    context.field[pick.cell] as number,
    PHASE_BLEND,
  );

  const done = context.visitedCount >= context.grid.cellCount;

  patches.push({
    index: pick.cell,
    overlaySet: done ? OverlayFlag.Visited : OverlayFlag.Visited | OverlayFlag.Current,
  });

  if (!done) {
    context.current = pick.cell;
  }

  addFrontier(context, pick.cell, patches);
  pulseLocalResonance(context, pick.cell);

  return {
    done,
    patches,
    meta: {
      line: done ? 6 : 4,
      visitedCount: context.visitedCount,
      frontierSize: context.frontier.length,
    },
  };
}

function addFrontier(
  context: ResonantContext,
  base: number,
  patches: CellPatch[],
): void {
  for (const neighbor of neighbors(context.grid, base)) {
    if (context.visited[neighbor.index] === 1) {
      continue;
    }

    const baseResonance = computeFrontierResonance(context, neighbor.index);
    if (context.frontierFlags[neighbor.index] === 1) {
      if (baseResonance > context.resonance[neighbor.index]) {
        context.resonance[neighbor.index] = baseResonance;
      }
      continue;
    }

    context.frontierFlags[neighbor.index] = 1;
    context.frontier.push(neighbor.index);
    context.resonance[neighbor.index] = baseResonance;

    patches.push({
      index: neighbor.index,
      overlaySet: OverlayFlag.Frontier,
    });
  }
}

function removeFrontier(
  context: ResonantContext,
  pos: number,
  cell: number,
): void {
  context.frontier[pos] = context.frontier[context.frontier.length - 1] as number;
  context.frontier.pop();
  context.frontierFlags[cell] = 0;
  context.resonance[cell] = 0;
}

function chooseFrontierCell(context: ResonantContext): ResonantFrontierPick {
  let best: ResonantFrontierPick | null = null;

  for (let i = 0; i < context.frontier.length; i += 1) {
    const cell = context.frontier[i] as number;
    const parentChoice = chooseParentForCell(context, cell);
    const resonance = context.resonance[cell] as number;
    const score = resonance * 0.6 + parentChoice.score * 0.4 + context.rng.next() * 0.015;

    if (!best || score > best.score) {
      best = {
        ...parentChoice,
        frontierPos: i,
        cell,
        score,
      };
    }
  }

  if (!best) {
    throw new Error("Resonant Phase-Lock frontier selection failed.");
  }

  return best;
}

function chooseParentForCell(
  context: ResonantContext,
  cell: number,
): ResonantParentChoice {
  const target = context.field[cell] as number;
  let best: ResonantParentChoice | null = null;

  for (const neighbor of neighbors(context.grid, cell)) {
    if (context.visited[neighbor.index] === 0) {
      continue;
    }

    const parentPhase = context.phase[neighbor.index] as number;
    const phaseAlignment = 1 - circularDistance(parentPhase, target);
    const fieldContinuity =
      1 - circularDistance(context.field[neighbor.index] as number, target);
    const score = phaseAlignment * 0.75 + fieldContinuity * 0.25;

    if (!best || score > best.score) {
      best = {
        parent: neighbor.index,
        cellWall: neighbor.direction.wall,
        parentWall: neighbor.direction.opposite,
        score,
      };
    }
  }

  if (!best) {
    throw new Error("Resonant Phase-Lock found frontier without visited parent.");
  }

  return best;
}

function computeFrontierResonance(context: ResonantContext, cell: number): number {
  const target = context.field[cell] as number;
  let best = 0;

  for (const neighbor of neighbors(context.grid, cell)) {
    if (context.visited[neighbor.index] === 0) {
      continue;
    }

    const parentPhase = context.phase[neighbor.index] as number;
    const phaseAlignment = 1 - circularDistance(parentPhase, target);
    const fieldContinuity =
      1 - circularDistance(context.field[neighbor.index] as number, target);
    const score = phaseAlignment * 0.7 + fieldContinuity * 0.3;

    if (score > best) {
      best = score;
    }
  }

  return best;
}

function pulseLocalResonance(context: ResonantContext, source: number): void {
  const sourcePhase = context.phase[source] as number;

  for (const neighbor of neighbors(context.grid, source)) {
    if (
      context.visited[neighbor.index] === 1 ||
      context.frontierFlags[neighbor.index] === 0
    ) {
      continue;
    }

    const base = computeFrontierResonance(context, neighbor.index);
    const entrainment =
      1 - circularDistance(sourcePhase, context.field[neighbor.index] as number);
    const next =
      (context.resonance[neighbor.index] as number) * RESONANCE_DECAY +
      base * 0.5 +
      entrainment * LOCAL_PULSE;

    context.resonance[neighbor.index] = Math.min(1.5, next);
  }
}

function buildInterferenceField(grid: Grid, rng: RandomSource): Float32Array {
  const emitterCount = Math.max(
    3,
    Math.min(7, Math.floor(Math.sqrt(grid.cellCount) / 5)),
  );
  const emitters: InterferenceEmitter[] = [];

  for (let i = 0; i < emitterCount; i += 1) {
    const angle = rng.next() * Math.PI * 2;
    emitters.push({
      x: rng.nextInt(grid.width),
      y: rng.nextInt(grid.height),
      radialFreq: 0.7 + rng.next() * 2.1,
      directionalFreq: 0.5 + rng.next() * 1.6,
      dirX: Math.cos(angle),
      dirY: Math.sin(angle),
      phaseOffset: rng.next() * Math.PI * 2,
      amplitude: 0.7 + rng.next() * 0.6,
    });
  }

  const field = new Float32Array(grid.cellCount);
  const scaleX = Math.max(1, grid.width - 1);
  const scaleY = Math.max(1, grid.height - 1);

  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const index = y * grid.width + x;
      let waveSum = 0;
      let ampSum = 0;

      for (const emitter of emitters) {
        const dx = (x - emitter.x) / scaleX;
        const dy = (y - emitter.y) / scaleY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const directional = dx * emitter.dirX + dy * emitter.dirY;
        const wave = Math.sin(
          (dist * emitter.radialFreq + directional * emitter.directionalFreq) *
            Math.PI *
            2 +
            emitter.phaseOffset,
        );

        waveSum += wave * emitter.amplitude;
        ampSum += emitter.amplitude;
      }

      const normalized = ampSum > 0 ? waveSum / ampSum : 0;
      const jitter = (rng.next() - 0.5) * 0.04;
      field[index] = clamp01(0.5 + normalized * 0.5 + jitter);
    }
  }

  return field;
}

function blendCircular(a: number, b: number, amount: number): number {
  let delta = b - a;
  if (delta > 0.5) {
    delta -= 1;
  } else if (delta < -0.5) {
    delta += 1;
  }

  return wrap01(a + delta * amount);
}

function circularDistance(a: number, b: number): number {
  const diff = Math.abs(a - b);
  return diff <= 0.5 ? diff : 1 - diff;
}

function wrap01(value: number): number {
  let wrapped = value % 1;
  if (wrapped < 0) {
    wrapped += 1;
  }
  return wrapped;
}

function clamp01(value: number): number {
  if (value < 0) {
    return 0;
  }

  if (value > 1) {
    return 1;
  }

  return value;
}
