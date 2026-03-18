# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start Next.js dev server
npm run build        # Production build
npm run lint         # ESLint (--max-warnings=0)
npm run typecheck    # TypeScript check (tsc --noEmit)
npm test             # Run all tests (Vitest)
npm run test:watch   # Vitest watch mode
npx vitest run tests/core/generators.test.ts  # Run a single test file
```

**Pre-PR quality gate** (also CI): `npm run lint && npm run typecheck && npm test && npm run build`

## Architecture

Mazer is a maze algorithm visualizer built with Next.js 15 (App Router), React 19, TypeScript (strict), Zustand 5, and HTML Canvas. It visualizes step-by-step maze generation and solving with real-time metrics. Built as a static export (`output: "export"` in `next.config.ts`) — no server components, no Node.js runtime required.

### Four layers — strict one-way dependencies

```
src/core/  ←── src/engine/  ←── src/render/
   ↑                ↑                ↑
   └───────── src/ui/ ───────────────┘
```

- `src/core/` has **zero imports** from engine, render, or ui. No DOM, no React.
- `src/engine/` imports from `src/core/` only. No React, no DOM references beyond `requestAnimationFrame`/`performance.now` (accessed via `globalThis` with fallbacks).
- `src/render/` imports from `src/core/` and `src/config/` only. No Zustand, no React.
- `src/ui/` is the only layer allowed to import across all other layers.

---

### 1. Core (`src/core/`)

#### Grid model (`grid.ts`)

Four TypedArrays, flat row-major index (`idx = y * width + x`):

```
walls:     Uint8Array   — 1 byte/cell: 4-bit wall bitmask (N/E/S/W)
overlays:  Uint16Array  — 2 bytes/cell: 8-bit solver overlay flags
crossings: Uint8Array   — 1 byte/cell: CrossingKind enum (weave mazes)
tunnels:   Int32Array   — 4 bytes/cell: tunnel destination index (-1 = none)
```

Memory at 200×200 (40,000 cells): ~320 KB total vs ~3.2–4 MB for a naive object-per-cell model.

**`WallFlag` (`const enum`)** — inlined at compile time, no runtime object:
```
North=1 (0001), East=2 (0010), South=4 (0100), West=8 (1000)
ALL_WALLS = 15 (0b1111) — initial state, all walls present
```
Wall presence check: `(grid.walls[i] & WallFlag.North) !== 0`. Carving clears bits on both cells with `walls[i] &= ~wallClear`.

**`OverlayFlag` (`const enum`)** — two solver channels packed into one `Uint16Array` element:
```
Bits 0–3 (Solver A): Visited=1, Frontier=2, Path=4, Current=8
Bits 4–7 (Solver B): VisitedB=16, FrontierB=32, PathB=64, CurrentB=128
```
Masks: `PRIMARY_OVERLAY_MASK=0x0F`, `SECONDARY_OVERLAY_MASK=0xF0`, `ANY_VISITED_OVERLAY_MASK=17`.

**`CrossingKind`**: `None=0`, `HorizontalOverVertical=1`, `VerticalOverHorizontal=2`. `traversableNeighbors()` includes tunnel destinations, so solvers work on weave mazes without modification.

**`carvePatch(fromIndex, toIndex, wallFrom, wallTo)`** — factory that produces two `CellPatch` objects (one per cell), each with only `wallClear` set.

#### CellPatch interface (`patches.ts`)

```typescript
interface CellPatch {
  index: number;          // flat cell index
  wallSet?: number;       // OR into walls[index]
  wallClear?: number;     // AND ~mask into walls[index]
  overlaySet?: number;    // OR into overlays[index]
  overlayClear?: number;  // AND ~mask into overlays[index]
  crossingSet?: number;   // assign crossings[index]
  tunnelToSet?: number;   // assign tunnels[index]
}
```

`StepResult<TMeta>` pairs a `patches: CellPatch[]` array with `done: boolean` and optional `meta`. The `meta` field carries: `visitedCount`, `frontierSize`, `pathLength`, `line` (pseudocode line, 1-indexed), `solverRole` (`"A"` or `"B"`).

#### RNG (`rng.ts`)

Mulberry32 PRNG seeded via FNV-1a string hash. Uses `Math.imul` for C-style 32-bit wrapping multiplication (not `*` which produces float64). `createSeededRandom(seedText)` returns `{ next(), nextInt(max), pick(items[]) }`. Solver seeds are derived: `${seed}-solve-a` / `${seed}-solve-b` — reproducible but not user-configurable.

#### Graph metrics (`analysis/graphMetrics.ts`)

`analyzeMazeGraph(grid, start, goal)` runs once synchronously at the `Generating → Generated` boundary:
1. **Degree analysis** (O(N)): count traversable neighbors per cell → `deadEndCount` (degree ≤ 1), `junctionCount` (degree ≥ 3), `edgeCount = degreeSum / 2`.
2. **Cycle count** via Euler characteristic: `cycleCount = max(0, edgeCount − cellCount + componentCount)`. For a spanning tree this is always 0.
3. **Component count**: BFS flood-fill O(N).
4. **Shortest path count**: two-pass BFS (distances then forward propagation), capped at 1,000,000. Uses `Float64Array` (not `Int32Array`) because counts can exceed 2³¹ on loopy mazes before capping.

#### Plugin system

`plugin.create({ grid, rng, options })` is the factory; it returns a **stepper closure** whose `step()` method advances by exactly one logical unit and returns `StepResult`. All per-run state (stacks, queues, visited sets) lives in the closure — pause/resume is free. Algorithms use `Uint8Array` for visited tracking (not `Set<number>`) for memory efficiency.

40 generator plugins, 34 solver plugins registered in their respective `index.ts` catalog arrays. Engine indexes them into `Map<id, plugin>` at load time for O(1) lookup. Topology output (`perfect-planar`, `loopy-planar`, `weave`) controls which solvers appear in the dropdown.

`generatorParamsSchema` supports `{ type: "number" | "boolean" | "select" }` — `MazeConfigPanel` renders dynamic controls from this at runtime; adding params to a plugin does not require modifying React components.

---

### 2. Engine (`src/engine/MazeEngine.ts`)

#### Phase state machine

```
         startGeneration()
Idle ──────────────────────► Generating
                                  │ done=true + analyzeMazeGraph()
                                  ▼
                             Generated ◄── startSolving() [re-solve]
                                  │ startSolving()
                                  ▼
                              Solving
                                  │ both solvers done
                                  ▼
                               Solved

Any state ─── reset() ───► Idle
```

`completePhase()` handles `Generating → Generated`: nulls the stepper, sets `paused = true`, computes graph metrics, emits `onPhaseChange`.

#### RAF frame loop (`onFrame`)

Accumulator model: `accumulatorMs += frameDelta`, then drain:
```
while (accumulatorMs >= stepInterval && iteration < ENGINE_MAX_STEPS_PER_FRAME && hasActiveWork()) {
  result = processStep();
  patches += result.patches;
  dirtyCells.add(...);
  accumulatorMs -= stepInterval;
  iteration++;
  if (result.done) break;
}
// single onPatchesApplied emit per frame with deduplicated dirtyCells Set
```
`ENGINE_MAX_STEPS_PER_FRAME = 2000` prevents unbounded computation per frame. At 8,000 steps/sec on a 60fps machine, the engine executes ~133 steps/frame — well within the cap. In Node.js (Vitest), `requestAnimationFrame` is absent; engine falls back to `setTimeout(..., 16)`.

#### Battle mode

Both `solverPrimary` (role `"A"`) and `solverSecondary` (role `"B"`) step in the same frame. Solver B patches are remapped via `remapPatchForSecondary`: primary overlay flags (bits 0–3) are bit-shifted left by 4 to secondary flags (bits 4–7). Solver B's algorithm implementation is entirely unaware of this remapping. Battle solver seeds: `${seed}-solve-a` and `${seed}-solve-b`.

#### Worker command/event protocol (`mazeWorkerProtocol.ts`)

- **`MazeWorkerCommand`** (UI → Engine): `init`, `setOptions`, `setSpeed`, `generate`, `solve`, `pause`, `resume`, `stepOnce`, `reset`, `rebuildGrid`, `dispose`.
- **`MazeWorkerEvent`** (Engine → UI): `gridRebuilt`, `patchesApplied`, `runtimeSnapshot`, `phaseChange`, `error`.

`gridRebuilt` events transfer all four TypedArray `.buffer`s as `Transferable` objects (zero-copy; sender's buffers become detached). Patch arrays use structured clone. `useMazeEngine` tries Worker first and falls back to in-thread `MazeWorkerRuntime` if `Worker` is unavailable.

---

### 3. Renderer (`src/render/CanvasRenderer.ts`)

**DPR clamping** — `computeSafeDpr(widthPx, heightPx)` takes the minimum of: native DPR, `16384 / widthPx`, `16384 / heightPx`, `sqrt(48_000_000 / (widthPx * heightPx))`. Computed before `canvas.width` assignment to prevent multi-GB backing-store allocation crashes.

**Dirty expansion** — `renderDirty(cells)` expands each dirty cell to its four cardinal neighbors. Walls use `fillRect` straddling the cell boundary (offset by `hw = wallWidth/2`), so a North wall of cell `i` visually overlaps cell `i - width`. Without expansion, repainting only `i` leaves stale pixels in the neighbor.

**Wall rendering** — `fillRect` not `strokeRect`. Reason: `strokeRect` leaves sub-pixel corner gaps where perpendicular walls meet. Filled rectangles that straddle the boundary share pixels between adjacent cells — no gaps.

**Shadow blur** — gated on `cellSize >= 12`. Shadow blur forces software rendering in many browsers; skipping it on dense grids (small cell size) avoids the performance cost entirely.

**Full `renderAll()`** on a 200×200 grid: ~360,000 Canvas 2D API calls. Only triggered by grid rebuild or settings change, not on the animation hot path. `renderDirty()` at moderate speeds touches 2–20 cells → ~20–200 draw calls/frame.

---

### 4. UI (`src/ui/`)

#### Zustand store (`store/mazeStore.ts`) — three slices

- **`MazeSettings`**: all user-configurable options. Setters clamp via `src/config/limits.ts` (e.g., `setGridWidth` calls `clampGridWidth(value, height, cellSize)` for multi-axis constraint enforcement). Defaults: generator `dfs-backtracker`, solver `bfs`, speed 60 steps/sec, grid 40×25 at 16px/cell, seed `"mazer"`.
- **`MazeRuntime`**: `phase`, `paused`, `metrics` (full `MazeMetrics`), active pseudocode lines for generator and both solvers.
- **`MazeUI`**: sidebar collapse, HUD visibility, metrics expansion state.

#### `useMazeEngine` hook — three bridging patterns

1. **Ref-based engine handles** (`transportRef`, `rendererRef`, `gridRef`): hold non-React objects; changes don't trigger re-renders.
2. **`settingsRef.current = settings`**: keeps a synchronous reference to latest Zustand settings inside stale callbacks, avoiding stale-closure bugs without adding settings to dependency arrays.
3. **`queueRuntimeUpdate`**: coalesces multiple rapid engine events into one `setRuntimeSnapshot` Zustand call per animation frame (~60/sec), regardless of algorithm step rate (up to 8,000/sec). Prevents React from re-rendering once per algorithm step.
4. **`skipFirstGridSyncRef`**: suppresses the first fire of the `gridWidth/gridHeight` `useEffect` on mount — without it, the effect fires immediately (undefined → initial value), triggering a spurious `rebuildGrid` that races with `init`.

---

### Data flow — Generate lifecycle

```
1. User clicks "Generate"
   → controls.generate() → syncEngineOptions() → dispatch "generate" command

2. Worker: engine.startGeneration()
   → createGrid() (TypedArrays, walls=ALL_WALLS)
   → emits gridRebuilt → zero-copy ArrayBuffers → UI

3. UI: deserializeGridSnapshot() → new CanvasRenderer() → renderAll()

4. Worker RAF loop:
   → stepper.step() × N (accumulator-based)
   → applyCellPatch() per patch
   → emitPatches(dirtyCells, patches, meta, metrics) → postMessage

5. UI: applyCellPatch() on local grid copy → renderer.renderDirty(dirtyCells)
   → queueRuntimeUpdate → Zustand (RAF-batched)

6. When stepper.done:
   → completePhase(): analyzeMazeGraph() synchronously
   → phase = "Generated", paused = true, RAF stops
```

---

## Configuration constants (`src/config/limits.ts`)

```
SPEED_MIN=1, SPEED_MAX=8_000          (steps/sec)
GRID_MIN=2, GRID_MAX=200              (cells per axis)
GRID_MAX_CELLS=40_000                 (total cell cap)
CELL_MIN=2, CELL_MAX=40               (px per cell)
ENGINE_MAX_STEPS_PER_FRAME=2_000
CANVAS_MAX_BACKING_DIMENSION=16_384   (px per axis)
CANVAS_MAX_BACKING_PIXELS=48_000_000
VIEWPORT_MAX_DIMENSION_PX=16_384
VIEWPORT_MAX_PIXELS=25_000_000
```

No `.env` files — all configuration is static TypeScript constants. The engine applies `clampGridSizeByCells` again internally (defense-in-depth second layer even when called from tests).

## Key conventions

- **Patch-based updates**: Algorithms emit `CellPatch` objects describing cell-level wall/overlay mutations. No full-grid cloning. Never use `const enum` values as object keys or iterate over them — they don't exist at runtime.
- **Deterministic**: Same seed string produces identical mazes via Mulberry32 PRNG. Use `Math.imul` for 32-bit wrapping multiplication in any hash/PRNG code.
- **Step metadata**: Algorithms return `line` (1-indexed pseudocode line) and `solverRole` (`"A"` / `"B"`). `GeneratorTracePanel` highlights `pseudocode[activeLine - 1]`.
- **Visualization pacing**: Algorithms that would converge instantly must batch work. Bellman-Ford groups an entire relaxation pass into one `step()` call. Apply the same pattern to any algorithm with O(N) inner loops.
- **Topology contract**: `perfect-planar` generators must produce `cycleCount = 0` (spanning tree). Tests assert this. `loopy-planar` may have cycles.
- **Path alias**: `@/*` maps to project root in tsconfig.
- **Algorithm IDs**: `kebab-case` strings, e.g. `"dfs-backtracker"`. Currently plain string unions — not branded types, so typos won't error at compile time.
- **No OffscreenCanvas**: rendering is currently main-thread only. The worker handles computation, the main thread handles Canvas 2D draws.

## Coding style

- 2 spaces, semicolons, double quotes, trailing commas.
- `PascalCase` for classes/components, `camelCase` for functions/variables, `kebab-case` for plugin IDs.
- Prefer `@/` import aliases for modules under `src/`.
- Conventional commits: `feat(core): ...`, `fix(ui): ...`.

## Testing

Tests live under `tests/` (`core`, `engine`, `config`). Vitest with Node environment.

| File | Key assertions |
|---|---|
| `core/generators.test.ts` | Determinism (same seed → same `walls` array), full connectivity (BFS from cell 0), topology invariants (`cycleCount=0` for perfect-planar) |
| `core/solvers.test.ts` | Path validity, goal reachability, visualization pacing regressions |
| `core/graphMetrics.test.ts` | Euler characteristic, dead-end count, shortest path count |
| `core/rng.test.ts` | Same seed → same sequence; distribution |
| `engine/mazeEngine.test.ts` | Phase transitions, RAF batching, callback contract |
| `engine/mazeWorker.test.ts` | Grid serialization/deserialization, command handling |
| `engine/mazeWorkerRuntime.test.ts` | Event emission, active line tracking |
| `config/limits.test.ts` | Boundary values, NaN/Infinity inputs |

Engine tests use `vi.useFakeTimers()` + `vi.advanceTimersByTime(N)` to drive the RAF loop (falls back to `setTimeout` in Node). The accumulator arithmetic is identical to production.

Generator determinism pattern:
```typescript
const g1 = runGenerator(plugin, "test", 10, 10);
const g2 = runGenerator(plugin, "test", 10, 10);
expect(g1.walls).toEqual(g2.walls);           // determinism
expect(isFullyConnected(g1)).toBe(true);       // connectivity
expect(analyzeMazeGraph(g1, 0, 99).cycleCount).toBe(0); // topology
```

## Adding a new algorithm (checklist)

When adding a new generator or solver plugin, **all** of the following must be updated or CI will fail:

### Generator
1. Create `src/core/plugins/generators/<kebab-name>.ts` — export a `GeneratorPlugin` object with `id`, `name`, `label`, `create()`.
2. Register it in `src/core/plugins/generators/index.ts` — add to imports, `GENERATOR_TOPOLOGY` (if not `perfect-planar`), and the `generatorPlugins` catalog array.
3. Add pseudocode in `src/ui/docs/generatorPseudocode.ts` — keyed by plugin ID; `algorithmCatalog.test.ts` enforces this.
4. Add a doc entry in `src/ui/docs/algorithmDocs.ts` — `GENERATOR_DOCS` array; same test enforces this.
5. Tests: `tests/core/generators.test.ts` auto-covers all registered generators (determinism, connectivity, topology). No manual test addition needed unless the algorithm has special params.

### Solver
1. Create `src/core/plugins/solvers/<kebab-name>.ts` — export a `SolverPlugin` object.
2. Register in `src/core/plugins/solvers/index.ts` — add to imports, optionally to `NO_LOOPY_SUPPORT` / `NO_WEAVE_SUPPORT` deny-lists, and the `solverPlugins` catalog array.
3. Add pseudocode in `src/ui/docs/solverPseudocode.ts`.
4. Add a doc entry in `src/ui/docs/algorithmDocs.ts` — `SOLVER_DOCS` array.
5. Tests: `tests/core/solvers.test.ts` auto-covers all registered solvers.

### Alias algorithms
Some plugins are aliases (thin wrappers) around another algorithm with different default params (e.g., `primModified`, `primSimplified`, `primTrue`, `bfsTree`). These still need full registry + docs + pseudocode entries.

## Solver compatibility model

Compatibility is **deny-list based**, not per-plugin opt-in (`src/core/plugins/solvers/index.ts:59-137`):
- `NO_LOOPY_SUPPORT`: solvers that break on mazes with cycles (e.g., wall followers, dead-end fillers).
- `NO_WEAVE_SUPPORT`: solvers that can't handle tunnel/crossing topology.
- A solver **not** in either deny-list is assumed compatible with all topologies.
- One incorrect deny-list entry misclassifies the solver for every generator that produces that topology — verify compatibility carefully.

Generator topology output (`src/core/plugins/generators/index.ts:87-114`):
- Generators not listed in `GENERATOR_TOPOLOGY` default to `perfect-planar`.
- Valid topologies: `perfect-planar`, `loopy-planar`, `weave`.

## Silent failure behaviors

These are intentional design choices, not bugs — but they can confuse debugging:

- `sendCommand()` is a **no-op** when no worker/runtime transport exists (`useMazeEngine.ts:81-95`).
- `startSolving()` **silently returns** if phase is not `Generated` or `Solved` (`MazeEngine.ts:176-179`).
- Worker creation failures are **logged to console and downgraded** to in-thread fallback — no user-visible error (`useMazeEngine.ts:221-225`).
- An exception inside `step()` **silently crashes** the animation loop (no error boundary — see known issues).

## Worker runtime details

- **Snapshot throttling**: runtime snapshots are emitted at most once per 60ms, except in terminal phases where they emit immediately. In test mode (`NODE_ENV === "test"`), throttling is disabled entirely (`mazeWorkerRuntime.ts:211-234`).
- **Grid transfer**: `gridRebuilt` events use `Transferable` (zero-copy), but `createGridSnapshot` first `.slice()`s every typed array — so it's actually a full copy before transfer (`mazeWorkerProtocol.ts:90-109`).
- **Patch events**: use structured clone (not transferable), so they're copied on every frame.

## Known issues / improvement areas

- **No plugin error boundary**: an exception inside `step()` propagates to the RAF callback and silently crashes the animation loop. Should add try/catch in `processGenerationStep`/`processSolverRuntime` to emit an `error` event and transition to `Idle`.
- **No step-count watchdog**: an algorithm that never sets `done: true` runs forever. A configurable `maxSteps` limit (e.g. `10 * cellCount`) would auto-complete runaway phases.
- **No OffscreenCanvas**: moving canvas rendering to the worker would eliminate the only remaining main-thread cost during animation.
- **`expandDirty` Set allocation**: creates a new `Set<number>` on every `renderDirty` call — GC pressure at high step rates. A reusable pre-cleared Set would fix this.
- **Plugin IDs are plain strings**: typos won't error at compile time. Branded types (`type GeneratorPluginId = string & { __brand: "GeneratorPluginId" }`) would fix this.
- **Hardcoded endpoints**: start=0 (top-left), goal=cellCount-1 (bottom-right) are fixed in `MazeEngine`. No configurable or random endpoints yet.
