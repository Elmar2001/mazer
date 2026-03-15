# Mazer Codebase Review

> **Senior Architecture Review — Mazer v0.1.0**
> Scope: correctness, performance, maintainability, extensibility, and testing.
> All file references and line numbers are precise to the reviewed source.

---

## Table of Contents

- [CRITICAL](#critical)
- [HIGH](#high)
- [MEDIUM](#medium)
- [LOW](#low)

---

## CRITICAL

---

### C-1 — Unhandled Plugin Exceptions Silently Kill the Animation Loop

**Description:**
`stepper.step()` is called with no error boundary in either `processGenerationStep` (`MazeEngine.ts:424`) or `processSolverRuntime` (`MazeEngine.ts:513`). If any of the 40 generators or 34 solvers throws a runtime exception — an array out-of-bounds access, an exhausted priority queue, an unexpected RNG state, or a division by zero in an experimental algorithm — the exception propagates uncaught into `onFrame` (`MazeEngine.ts:337`), which is invoked via `requestAnimationFrame` or `setTimeout`. This leaves the engine in an irreversible zombie state:

- `rafHandle` is set to `null` at the top of `onFrame` (`line:338`), so the loop has already de-registered itself.
- `phase` remains `"Generating"` or `"Solving"` (no phase transition to `"Idle"`).
- No `onPhaseChange` or error callback fires.
- In Worker mode, the uncaught exception triggers `worker.onerror`, which only calls `console.error("Maze worker runtime error:", error.message)` (`useMazeEngine.ts:213`). The UI remains stuck with a running spinner and no way to recover short of a page reload.
- In the in-thread fallback mode, the uncaught exception propagates to the `setTimeout` callback level, where browser behavior varies.

The issue is especially acute for the experimental research tier generators (Quantum Seismogenesis, Mycelial Anastomosis, Reaction Diffusion, Sandpile Avalanche) which involve complex non-standard state machines that are more likely to have edge-case failures on unusual grid dimensions.

**Impact / Effect:**
- Guaranteed recovery from all plugin failures: failed generation/solving transitions to `Idle`, emits an error event, and surfaces a human-readable message in the UI.
- Eliminates zombie engine states. Users can retry without page reload.
- Provides actionable signal during development when adding new algorithms.

**Effort / Difficulty:** **Easy**
- Wrap the `stepper.step()` call in `processGenerationStep` and `processSolverRuntime` in a `try/catch`.
- On catch: call `completePhase()` to reset steppers, set `this.phase = "Idle"`, emit an error via a new `onError?(message: string): void` field in `MazeEngineCallbacks` (`engine/types.ts:77`).
- `MazeWorkerRuntime` already has `emitError()` (`mazeWorkerRuntime.ts:243`) — wire it to the new callback.
- `useMazeEngine.ts`: surface the error in Zustand as a new `error: string | null` field in `MazeRuntime`.

---

### C-2 — `patches.push(...result.patches)` Spread Can Corrupt Frame Batching

**Description:**
In `MazeEngine.onFrame` (`MazeEngine.ts:375`), patches from each step are accumulated via:

```typescript
patches.push(...result.patches);
```

The spread-into-`push` pattern passes all elements of `result.patches` as individual function arguments. In older V8 contexts (and any environment using `Function.prototype.apply` under the hood), this pattern has a hard argument limit of ~65,536 elements. Algorithms that emit a large batch per step are at risk:

- **Bellman-Ford** (`solvers/bellmanFord.ts`) emits a full-pass snapshot — on a 200×200 grid with ~80,000 directed edges, a single `StepResult.patches` can contain tens of thousands of elements.
- **Shortest Paths Finder**, **Flood Fill**, and **Cellular Automata generators** have similar batch-emission profiles.

Even if the JS engine silently handles more than 65K arguments (Node 20+ V8 raises this limit substantially), the semantic problem remains: at `ENGINE_MAX_STEPS_PER_FRAME = 2000` (`limits.ts:14`), the `patches` array grows unbounded within a single frame. At 2,000 steps × 100 patches/step = 200,000 objects allocated and then immediately garbage collected after `emitPatches` returns. This creates significant GC pressure on every frame at high speeds.

Additionally, this entire accumulated array is then passed to `onPatchesApplied` and forwarded via `postMessage` to the UI thread as a structured-clone payload. At 200,000 objects per `postMessage`, the structured clone cost alone can cause multi-millisecond frame jitter.

**Impact / Effect:**
- Eliminates the argument-limit risk for high-patch-count algorithms on all JS engines.
- Reduces per-frame heap allocation by replacing a single large ephemeral array with a loop-based accumulation.
- Reduces structured-clone cost on the worker→UI message boundary.
- Enables the longer-term optimization of streaming dirty cells only (see H-2).

**Effort / Difficulty:** **Easy**
- Replace `patches.push(...result.patches)` with an explicit loop: `for (const p of result.patches) patches.push(p)`.
- Similarly replace `for (const cell of result.dirtyCells) dirtySet.add(cell)` with a direct iteration (already correct at `MazeEngine.ts:376`, but the patches spread is the issue).
- Evaluate whether the `patches` array is actually needed in `onPatchesApplied` — the UI uses it only to `applyCellPatch` on its local grid copy (see H-1 for the architectural remedy). If dirty cells are sufficient for rendering and the worker grid is the authoritative source, patches can be dropped from the callback entirely.

---

## HIGH

---

### H-1 — Main-Thread Canvas Rendering and Redundant Grid Copy

**Description:**
The current architecture maintains the grid in two places simultaneously: the worker holds the authoritative `Grid` (TypedArrays updated by `applyCellPatch`), and the main thread holds a deserialized `gridRef.current` copy (`useMazeEngine.ts:101`) that is kept in sync by replaying patches (`useMazeEngine.ts:158–163`). The `CanvasRenderer` then reads from this main-thread copy to render. This design has two compounded costs:

1. **Per-frame serialization**: Every `patchesApplied` event carries the full `patches: CellPatch[]` array across the `postMessage` boundary via structured clone, solely so the main thread can call `applyCellPatch` on its local grid copy.
2. **Main-thread rendering**: `renderer.renderDirty(event.dirtyCells)` runs on the main thread, competing with React reconciliation, Zustand subscriptions, and browser layout. For full redraws (`renderAll` on settings change), up to ~360,000 Canvas 2D API calls are issued on the main thread.

The `OffscreenCanvas` API (supported in all modern browsers) solves both problems: transfer the canvas to the worker at initialization, run `CanvasRenderer` entirely inside `MazeWorkerRuntime`, and eliminate the main-thread grid copy. The `patchesApplied` event then carries only `dirtyCells: number[]` (a compact `Int32Array` transfer, not structured-cloned objects), and the renderer reads from the worker's authoritative grid directly with zero serialization overhead.

**Impact / Effect:**
- Eliminates the redundant main-thread grid copy (~320 KB at max grid size).
- Reduces `postMessage` payload from `CellPatch[]` objects to a single `Int32Array` Transferable.
- All Canvas 2D draw calls move off the main thread, preventing UI jitter during `renderAll`.
- React component re-renders and canvas rendering become fully independent (no shared main-thread CPU budget).
- At 8,000 steps/sec on a 200×200 grid, this is the single change with the highest throughput impact.

**Effort / Difficulty:** **Moderate**
- `useMazeEngine.ts`: Pass the canvas element to the `init` command after calling `canvas.transferControlToOffscreen()`. Remove `gridRef`, `rendererRef`, and the patch-replay loop.
- `mazeWorkerProtocol.ts`: Add `canvas: OffscreenCanvas` as a Transferable in the `init` command.
- `mazeWorkerRuntime.ts`: Instantiate `CanvasRenderer` when `canvas` is received. Call `renderDirty` inside `onPatchesApplied`.
- `patchesApplied` event: Remove the `patches` field; only `dirtyCells` and `metrics` are needed.
- The in-thread fallback path (where `Worker` is unavailable) cannot use `OffscreenCanvas` — maintain the existing direct `CanvasRenderer` instantiation in `useMazeEngine` for that case.
- The `setSettings` renderer update path needs to be replaced with a `setRendererSettings` command sent to the worker.

---

### H-2 — `expandDirty` Allocates a New `Set<number>` on Every Frame

**Description:**
`CanvasRenderer.renderDirty` (`CanvasRenderer.ts:112`) calls `expandDirty` (`CanvasRenderer.ts:371`) on every invocation. `expandDirty` creates a `new Set<number>()`, populates it, and converts it back to `Array.from(output)`. Similarly, `onFrame` in `MazeEngine.ts:357` creates `new Set<number>()` for the frame-level dirty accumulation.

At the maximum step rate of 8,000/sec (rendering rate ~60 fps), `renderDirty` is called ~60 times/sec. Each call allocates a Set and an Array that hold up to `dirtyCells.length × 5` numbers. For large dirty sets (e.g., a solver visiting many cells per frame), these allocations are immediately promoted to the old generation heap and trigger GC cycles.

In `MazeEngine.onFrame`, the `dirtySet` and `patches` arrays are fresh allocations every frame. The `dirtySet` is a `Set<number>` that can hold up to `ENGINE_MAX_STEPS_PER_FRAME × avg_patches_per_step` elements — potentially tens of thousands of entries per frame.

**Impact / Effect:**
- Reduces GC pressure from per-frame object allocations.
- Stabilizes frame timing (fewer GC pauses disrupting the 16ms RAF budget).
- Pre-allocated structures eliminate the per-frame cost of Set/Array initialization.

**Effort / Difficulty:** **Easy**
- In `CanvasRenderer`: add `private readonly _expandBuffer = new Set<number>()` as a class field. In `expandDirty`, call `this._expandBuffer.clear()` at the start, populate it, and return `Array.from(this._expandBuffer)`.
- In `MazeEngine.onFrame`: Pre-allocate `private readonly _frameDirtySet = new Set<number>()` and `private readonly _framePatches: CellPatch[] = []` as class fields. Clear them at the start of each frame rather than constructing new instances. Be careful: `_framePatches` must be sliced (not referenced directly) when passed to `emitPatches`, since `emitPatches` may be asynchronous (postMessage).

---

### H-3 — `renderAll()` Fires on Every `setSettings` Call, Including Visual-Only Changes

**Description:**
`CanvasRenderer.setSettings` (`CanvasRenderer.ts:58–70`) always calls `this.resize()` followed by `this.renderAll()`, regardless of which settings field changed. In `useMazeEngine.ts:351–353`, a `useEffect` subscribes to the entire `settings` object and calls `rendererRef.current?.setSettings(...)` on any change. This means:

- Toggling `showWallShadow` (a boolean) triggers `resize()` + 40,000 `drawCell` calls on a max grid.
- Changing `wallThickness` (a visual-only number) does the same.
- Changing a single `colorTheme` property triggers full repaint.
- Typing in the seed input field triggers a full repaint on every keystroke (since `settings.seed` is in the same `useEffect` dependency array implicitly via `settings` reference).

The `resize()` call itself is cheap for visual-only changes (no `cellSize` change means no canvas dimension change). But `renderAll()` on a 200×200 grid at 40px/cell is ~360,000 Canvas 2D API calls that block the main thread for several milliseconds.

**Impact / Effect:**
- Sub-millisecond settings change handling for non-dimensional properties.
- No jank when toggling visual options during an active animation.
- Reduces redundant work for settings that don't affect canvas dimensions.

**Effort / Difficulty:** **Easy–Moderate**
- Split `setSettings` into two methods: `setDimensionalSettings({ cellSize })` which calls `resize() + renderAll()`, and `setVisualSettings({ showVisited, showFrontier, showPath, colors, wallThickness, ... })` which only calls `renderAll()` (no resize).
- Add a third path: when only `showVisited/showFrontier/showPath/wallThickness` changes *during an active animation*, the next `renderDirty` call will naturally repaint affected cells. A full `renderAll()` is only needed when the animation is paused or finished (so dirty cells won't be repainted by the loop). Gate the `renderAll` call on `engine.getPhase() !== "Generating" && phase !== "Solving"`.
- In `useMazeEngine.ts`, split the single `useEffect([settings])` into separate effects for dimensional vs. visual settings changes.

---

### H-4 — No Algorithm Termination Watchdog

**Description:**
`MazeEngine` has no maximum step budget per phase. `ENGINE_MAX_STEPS_PER_FRAME = 2000` (`limits.ts:14`) only caps *per-frame* batching — it does not prevent a phase from running indefinitely. Algorithms that stochastically approach but never guarantee convergence within `maxSteps = width * height * N` steps can run forever:

- **Aldous-Broder** (`generators/aldousBroder.ts`) is a random walk with O(N log N) expected termination but unbounded worst-case runtime. On a 200×200 grid, worst-case random walk can take millions of steps.
- **Wilson's algorithm** similarly has a loop-erased random walk with polynomial expected runtime but no hard bound.
- **Experimental generators** (Reaction Diffusion, Quantum Seismogenesis, Mycelial Anastomosis) may have convergence conditions that fail on certain grid sizes or parameter combinations.

The user's only recourse is clicking "Reset," but the UI may appear to be working correctly (the animation continues). There is no visual indicator that the algorithm has been running abnormally long, and no automated recovery.

**Impact / Effect:**
- Guaranteed phase completion within a configurable step budget.
- Automated transition to `Generated` (with a partial/best-effort maze) when the budget is exceeded, rather than an infinite loop.
- Allows safe exposure of experimental generators without risk of permanent hangs.

**Effort / Difficulty:** **Easy**
- Add `maxGenerationSteps?: number` and `maxSolvingSteps?: number` to `MazeEngineOptions` (`engine/types.ts:64`).
- Default values: `maxGenerationSteps = width * height * 50` (generous multiple for Aldous-Broder/Wilson), `maxSolvingSteps = width * height * 200`.
- In `processGenerationStep`, increment a per-phase step counter. When the counter exceeds the limit, force `result.done = true` and call `completePhase()`. Log a warning in the error callback.
- Expose a `terminatedEarly: boolean` flag in `MazeMetrics` so the UI can show a "Timed out" indicator.

---

### H-5 — `analyzeMazeGraph` Synchronously Blocks the Worker RAF on Completion

**Description:**
When generation completes, `MazeEngine.completePhase()` (`MazeEngine.ts:683–693`) calls `analyzeMazeGraph(grid, 0, cellCount-1)` synchronously before emitting the phase change. For a 200×200 grid (40,000 cells):

- **Degree scan**: O(N) iteration over all cells computing `traversableNeighbors`. At 4 neighbors per cell, this is ~160,000 function calls.
- **`countComponents`**: BFS over all 40,000 cells.
- **`countShortestPaths`**: Two-pass BFS. Pass 1: 40,000 cells × 4 neighbors. Pass 2: same. Allocates `new Int32Array(40000)` and `new Float64Array(40000)`.

The total execution time is in the 5–20ms range depending on hardware. Since this runs inside the Worker's frame callback (directly within `processGenerationStep` via `completePhase`), it **blocks the Worker thread** for that duration. At the end of a fast generation run (8,000 steps/sec), this is a noticeable stutter — the last frame takes 5–20ms longer than all preceding frames.

**Impact / Effect:**
- Smooth phase transition with no computational stutter at generation completion.
- Consistent frame timing for the Worker's RAF loop.
- Graph metrics arrive asynchronously, eliminating the blocking pause.

**Effort / Difficulty:** **Moderate**
- Defer `analyzeMazeGraph` to run after the `Generated` phase event is emitted. In `completePhase`, set `this.phase = "Generated"`, emit the phase change, then schedule the graph analysis in a `setTimeout(0)` or `queueMicrotask`. Emit a new `onGraphMetricsReady(metrics)` callback when done.
- Alternatively, run `analyzeMazeGraph` in a nested `postMessage` round-trip: emit `"Generated"`, and when the UI receives it, post a `"computeGraphMetrics"` command back. The worker computes and posts a `"graphMetricsReady"` event. This avoids any change to `MazeEngine` internals.
- Update `MazeMetrics.graph` to start as `null` when phase transitions to `Generated`, then populate asynchronously. The `MetricsPanel` already handles `graph: null` gracefully.

---

### H-6 — Worker Failures Are Invisible to the User

**Description:**
`useMazeEngine.ts:213` handles worker errors with only `console.error("Maze worker runtime error:", error.message)`. This is the sole notification path for: Worker spawn failures, uncaught exceptions in the Worker global scope, and OOM conditions. The UI has no `error` state in Zustand's `MazeRuntime` slice (`mazeStore.ts:44`), no error banner component, and no retry mechanism.

Additionally, when the Worker fails to spawn (the `try/catch` in `tryCreateWorkerTransport` at `useMazeEngine.ts:196–228` catches the error), the fallback to the in-thread runtime happens silently with only `console.warn`. Users on environments where the Worker fails to load (restrictive CSPs, certain iframe contexts, browser bugs with Webpack's Worker URL resolution) get the fallback without knowing it. On the main thread, heavy computation at 8,000 steps/sec would cause the UI to be unresponsive, and the user has no indication this is happening because of a Worker failure.

**Impact / Effect:**
- Users see actionable error messages instead of a frozen/broken UI.
- The fallback-to-main-thread case is surfaced with an appropriate warning in the UI.
- Operational visibility for debugging Worker load failures in production environments.

**Effort / Difficulty:** **Easy**
- Add `error: string | null` and `workerMode: "worker" | "fallback" | null` to `MazeRuntime` in `mazeStore.ts`.
- In `useMazeEngine`, set `error` when `worker.onerror` fires, and `workerMode` on initialization.
- Add a dismissible error banner component that reads `runtime.error` from Zustand.
- The `workerMode` flag allows showing a performance warning toast when the fallback activates.

---

### H-7 — Zustand Settings Changes Propagate to Engine via Effect, Not on Action

**Description:**
`useMazeEngine.ts:291–319` has a `useEffect` that fires `setOptions` to the engine whenever algorithmic settings change (`generatorId`, `solverId`, `seed`, `battleMode`, `speed`, `generatorParams`, `solverParams`). However, the `controls.generate()` and `controls.solve()` actions (`useMazeEngine.ts:376–395`) also call `syncEngineOptions()` immediately before dispatching the generate/solve command. This creates a **double-update race**: the effect fires a `setOptions` command, and then `generate()` fires another `setOptions` + `generate` in rapid succession. Because commands are processed in order via `postMessage` (or synchronously in fallback mode), this double-send is harmless but redundant and creates an implicit sequencing dependency.

More critically: if the user changes `generatorId` and immediately clicks "Generate" before the effect fires (e.g., in a programmatically driven test or rapid UI interaction), the engine may start generation with stale options because the `setOptions` effect hasn't yet been triggered by the React scheduler.

The `syncEngineOptions()` call in each control action exists specifically as a workaround for this race, but it reads from `useMazeStore.getState()` directly (bypassing React's state system), meaning the settings it reads are always the latest Zustand state rather than the React render-cycle snapshot. This works, but the pattern is fragile.

**Impact / Effect:**
- Single, authoritative option-sync path before each generation/solve command.
- Eliminates double-`setOptions` sends.
- Removes the implicit dependency on React effect timing for correctness.

**Effort / Difficulty:** **Easy**
- Remove the `useEffect` that sends `setOptions` on settings change. Rely solely on `syncEngineOptions()` in each control action.
- For `setSpeed`, which should take effect mid-animation (user drags the speed slider without clicking "Generate"), send a `setSpeed` command directly from the `setSpeed` store action via a `dispatchCommand` ref exposed from `useMazeEngine` (or via a dedicated hook). Alternatively, keep only the `setSpeed` effect and remove the others.

---

## MEDIUM

---

### M-1 — `DEFAULT_METRICS` Defined in Two Places (DRY Violation)

**Description:**
An identical `DEFAULT_METRICS` object is defined in both `src/ui/store/mazeStore.ts:89–104` and `src/engine/MazeEngine.ts:41–56`. Any future addition to `MazeMetrics` (e.g., a new counter field) requires updating both files. There is no type-level enforcement that they remain in sync.

**Impact / Effect:** Eliminates a subtle maintenance trap. A single source of truth for the zero-state metrics object.

**Effort / Difficulty:** **Easy**
- Export `DEFAULT_METRICS` from `src/engine/types.ts` (where `MazeMetrics` is defined). Import it in both `MazeEngine.ts` and `mazeStore.ts`. Both sites use `{ ...DEFAULT_METRICS }` spread, so the object remains immutable at definition.

---

### M-2 — `MazeGraphMetrics` Interface Duplicated Between `graphMetrics.ts` and `engine/types.ts`

**Description:**
`src/core/analysis/graphMetrics.ts:3–10` and `src/engine/types.ts:13–20` define two separate but structurally identical `MazeGraphMetrics` interfaces. The `analyzeMazeGraph` function returns the `graphMetrics.ts` version, but `MazeMetrics.graph` in `engine/types.ts` uses the engine version. TypeScript's structural typing means this works without error, but it's a hidden coupling: if one interface gains a field, the other can silently diverge.

**Impact / Effect:** Single canonical definition; TypeScript will immediately flag any divergence at use sites.

**Effort / Difficulty:** **Easy**
- Delete the interface in `graphMetrics.ts`. Import `MazeGraphMetrics` from `engine/types.ts`. Adjust the return type annotation of `analyzeMazeGraph`.

---

### M-3 — Generator Params Not Cleared on Algorithm Change

**Description:**
`mazeStore.ts` stores `generatorParams: Record<string, number | string | boolean>` as a flat object that persists across `generatorId` changes. When the user switches from "DFS Backtracker" (no params) to "Growing Tree" (which has a `bias` param exposed via `generatorParamsSchema`), the params from any previously set algorithm remain in the store. The engine then passes these stale params to the new algorithm's `plugin.create({ options: generatorParams })`, where the new algorithm reads `options.bias` (for example) which may coincidentally be set from a prior algorithm's unrelated param key.

More practically: switching from an algorithm with params back to one without them leaves the params object populated. While most algorithms simply ignore unknown keys in `options`, this is fragile and can cause surprising behavior if two algorithms share a param key name with different semantics.

**Impact / Effect:** Predictable, isolated algorithm param state. No cross-contamination between algorithm selections.

**Effort / Difficulty:** **Easy**
- In `mazeStore.ts:setGeneratorId`, reset `generatorParams: {}` alongside the `generatorId` update.
- Similarly, `setSolverId` should reset `solverParams: {}`.
- The `MazeConfigPanel` component reads `generatorParamsSchema` from the selected plugin and renders controls with `defaultValue`s from the schema — clearing params will cause controls to reinitialize to their defaults, which is the correct UX behavior.

---

### M-4 — Wall Thickness Clamping Is Hardcoded in the Store, Not in `config/limits.ts`

**Description:**
`mazeStore.ts:287` clamps `wallThickness` with inline magic numbers:

```typescript
wallThickness: Math.max(0.02, Math.min(0.3, value)),
```

`config/limits.ts` is the designated home for all numeric constraints, and exports a `clamp()` utility. This constraint is not co-located with the other limits (`SPEED_MIN/MAX`, `CELL_MIN/MAX`, etc.) and has no corresponding `WALL_THICKNESS_MIN`/`WALL_THICKNESS_MAX` constants, making it invisible during code review and easy to accidentally change in one place but not the other.

**Impact / Effect:** Consistency and discoverability. All constraints in one auditable file.

**Effort / Difficulty:** **Easy**
- Add `export const WALL_THICKNESS_MIN = 0.02` and `export const WALL_THICKNESS_MAX = 0.3` to `limits.ts`. Add `export function clampWallThickness(v: number)`. Use it in the store's `setWallThickness`.

---

### M-5 — `CanvasRenderer` Has Zero Test Coverage

**Description:**
The Vitest configuration (`vitest.config.ts:8`) uses `environment: "node"`. The DOM APIs (`HTMLCanvasElement`, `CanvasRenderingContext2D`) are unavailable in Node. `CanvasRenderer` is entirely untested. No tests verify:
- Correct DPR computation and canvas dimension calculation.
- That `expandDirty` correctly includes all four cardinal neighbors without duplicates.
- That `drawWalls` respects bitmask flags (e.g., `WallFlag.North` paints a wall at the top edge).
- That `renderDirty` with an empty array is a no-op.
- That `setSettings` with a new `cellSize` triggers `resize()`.

`@vitest/coverage-v8` is installed (`package.json:18`) but no `coverage` script is defined and no coverage thresholds are configured. The actual coverage of `src/render/` is effectively 0%.

**Impact / Effect:** Confidence in rendering correctness. Prevents regressions when modifying drawing logic. Surfaces DPR bugs caught only in real browser testing.

**Effort / Difficulty:** **Moderate**
- Add `environment: "jsdom"` or `environment: "happy-dom"` to the Vitest config for the render test suite. These environments provide `HTMLCanvasElement` with a basic (non-rendering) 2D context.
- Alternatively, use `vi.mock` to provide a lightweight Canvas mock with spy functions on `fillRect`, `strokeRect`, `arc`, `fill`, `stroke`.
- Key tests: constructor sets canvas dimensions correctly for given DPR; `renderAll` calls `drawCell` for every cell index; `expandDirty` returns exactly the expected set; wall bitmask tests verify `fillRect` is called for the correct walls.
- Add a `coverage` script to `package.json` and set minimum thresholds for `src/render/` in `vitest.config.ts`.

---

### M-6 — No Integration Test for `useMazeEngine` Hook

**Description:**
`useMazeEngine.ts` is the most complex piece of the UI layer — it manages Worker lifecycle, transport selection, Zustand synchronization, grid deserialization, and RAF batching. It has no tests. The `mazeEngine.test.ts` tests `MazeEngine` directly but do not exercise the hook, the worker transport abstraction, or the React/Zustand integration.

Failure modes that are currently untested:
- Worker creation failure causing incorrect fallback behavior.
- `gridRebuilt` event before canvas is mounted (the `if (!canvasRef.current)` branch at `useMazeEngine.ts:145`).
- `queueRuntimeUpdate` correctly batching multiple rapid updates into one Zustand set.
- The `skipFirstGridSyncRef` logic — if this breaks, dimension changes on mount cause a spurious `rebuildGrid` command.
- Component unmount during active generation (the `disposed = true` guard at `useMazeEngine.ts:250`).

**Impact / Effect:** Catches regressions in the most critical integration path. Documents the expected behavior of edge cases (race conditions, unmount cleanup).

**Effort / Difficulty:** **Moderate**
- Use `@testing-library/react` with a `jsdom` environment to render a test component that calls `useMazeEngine`.
- Mock `Worker` with a `vi.mock` that simulates the message protocol, allowing tests to trigger `gridRebuilt`, `patchesApplied`, and `phaseChange` events programmatically.
- Key scenarios: transport selection (worker vs. fallback); generate/solve/reset control dispatch; runtime update batching; unmount cleanup (worker.terminate called).

---

### M-7 — `AlgorithmStepMeta` Is an Open Record With No Per-Algorithm Typing

**Description:**
`AlgorithmStepMeta` (`plugins/types.ts:12–19`) is defined as:

```typescript
export interface AlgorithmStepMeta {
  [key: string]: number | string | boolean | undefined;
  line?: number;
  visitedCount?: number;
  // ...
}
```

This makes it impossible for TypeScript to enforce that a specific algorithm returns the fields it claims to. A solver could declare it returns `{ visitedCount: number }` but actually return `{ visitedcount: number }` (wrong casing) and the type system would not catch it. The engine's `applyMetaOverrides` (`MazeEngine.ts:621`) and `processSolverRuntime` (`MazeEngine.ts:532–551`) are littered with `typeof meta?.visitedCount === "number"` guard checks precisely because the typing provides no compile-time confidence.

**Impact / Effect:** Type-safe meta access. Eliminates runtime `typeof` guards. Compiler catches meta field naming mistakes in plugins.

**Effort / Difficulty:** **Moderate**
- Define a `GeneratorStepMeta` and `SolverStepMeta` as typed interfaces (not open records). Use discriminated union or generic constraints: `GeneratorPlugin<TOptions, TMeta extends StepMeta>` already accepts a generic; constrain the meta to `GeneratorStepMeta` for the base interface.
- The open `[key: string]` index signature is needed for extensibility — consider removing it from the specific meta types and only keeping it on `StepMeta` (the unconstrained base). Plugin implementations that need extra fields can extend their specific meta interface.

---

### M-8 — Plugin Registry Is a Static Array; No Dynamic Registration

**Description:**
`src/core/plugins/generators/index.ts` and `src/core/plugins/solvers/index.ts` export static arrays assembled at module load time. Adding a new algorithm requires: (1) creating the plugin file, (2) importing it in `index.ts`, (3) adding it to the array literal. There is no way to register plugins at runtime (e.g., from a URL or external module). The `GENERATOR_INDEX` and `SOLVER_INDEX` Maps in `MazeEngine.ts:58–61` are built from these static arrays.

This is a manageable approach at 40–74 algorithms, but it creates a growing `index.ts` with 40+ import statements and makes it impossible to lazy-load algorithms (all 40 generators are imported synchronously even if only one is ever used, adding to the initial bundle).

**Impact / Effect:** Route-based or lazy-loaded algorithm bundles reduce initial JS parse time. A registry pattern enables future dynamic algorithm loading (e.g., user-submitted WASM plugins).

**Effort / Difficulty:** **Moderate**
- Introduce a `PluginRegistry` class with `register(plugin)` and `get(id)` methods, replacing the static `Map`s in `MazeEngine`.
- In `generators/index.ts`, replace the static array with lazy `import()` calls keyed on plugin ID, returning a `Promise<GeneratorPlugin>`. The engine's `startGeneration` becomes async (or the plugin is pre-fetched when the user selects it from the dropdown).
- For immediate bundle savings, even a static `Record<id, () => import('...')>` with dynamic import expressions (without full async engine changes) gives bundlers the signal to split algorithm files.

---

## LOW

---

### L-1 — Settings Are Not Persisted Across Page Reloads

**Description:**
Zustand `MazeSettings` is initialized to hardcoded defaults on every page load (`mazeStore.ts:106–126`). A user's preferred algorithm, grid size, seed, speed, and color theme are lost on reload. `zustand/middleware` provides a `persist` middleware that serializes store slices to `localStorage` with no additional dependencies.

**Impact / Effect:** Users return to their last configuration. Educational use cases (demonstrating a specific algorithm at a specific speed to students) benefit from a persistent setup.

**Effort / Difficulty:** **Easy**
- Wrap `create<MazeStore>` with `persist(...)` from `zustand/middleware`. Persist only `settings` (not `runtime` or `ui`). Add a `version: 1` and `migrate` function to handle schema evolution. Exclude `colorTheme` from persistence if desired (it's a large nested object).

---

### L-2 — `hslToHex` and `hslToRgba` Are Duplicated in `colorPresets.ts`

**Description:**
`colorPresets.ts:150–173` and `colorPresets.ts:175–193` define two near-identical HSL conversion functions. The only difference between them is the return type (`"#rrggbb"` vs `"rgba(r,g,b,a)"`). The internal RGB computation logic is copy-pasted verbatim across both functions.

**Impact / Effect:** Reduced code surface area. A bug in the HSL computation (e.g., the `hNorm < 300` branch) needs only one fix.

**Effort / Difficulty:** **Easy**
- Extract a shared `hslToRgb(h, s, l): [number, number, number]` function. `hslToHex` and `hslToRgba` each call it and format the result.

---

### L-3 — Vitest Coverage Is Installed but Not Configured or Enforced

**Description:**
`@vitest/coverage-v8` is listed in `devDependencies` (`package.json:18`) but there is no `coverage` script in `package.json`, no `coverage` threshold in `vitest.config.ts`, and no CI step that enforces coverage. The CI gate (`npm run lint && npm run typecheck && npm test && npm run build`) does not include coverage. As the codebase grows and more experimental algorithms are added, coverage gaps will widen silently.

**Impact / Effect:** Baseline coverage metrics visible in CI. Prevents coverage regression on the core layers (`src/core/`, `src/engine/`).

**Effort / Difficulty:** **Easy**
- Add `"test:coverage": "vitest run --coverage"` to `package.json`.
- In `vitest.config.ts`, add a `coverage` block with `provider: "v8"`, `thresholds: { lines: 80, functions: 85 }` for `src/core/` and `src/engine/`.
- The current `node` environment already supports V8 coverage. `src/render/` and `src/ui/` can be excluded from thresholds until jsdom tests are added.

---

### L-4 — No Keyboard Shortcuts for Core Playback Actions

**Description:**
All primary actions (Generate, Solve, Pause/Resume, Step Once, Reset) require mouse interaction. There are no keyboard shortcuts. For educators demonstrating algorithms at a lectern, keyboard control is significantly more ergonomic. React's `useEffect` + `addEventListener("keydown")` pattern is sufficient; no additional library is needed.

**Impact / Effect:** Improved accessibility and ergonomics for demo/teaching use cases.

**Effort / Difficulty:** **Easy**
- Map: `Space` → pause/resume, `G` → generate, `S` → solve, `.` (period) → step once, `R` → reset, `1–8` → speed presets.
- Add a `useKeyboardShortcuts(controls)` hook that attaches a `keydown` listener when the canvas or body is focused. Suppress shortcuts when the user is typing in an input (check `event.target` against `INPUT`, `SELECT`, `TEXTAREA`).

---

### L-5 — `SolverPlugin` and `GeneratorPlugin` Are Structurally Identical; No Shared Base

**Description:**
`GeneratorPlugin.ts` and `SolverPlugin.ts` define interfaces that differ only in their `create()` parameter type (`GeneratorCreateParams` vs `SolverCreateParams`). Both extend `PluginMetadata`. Both have `id: string` and `label: string`. Future additions (e.g., `description?: string`, `docsUrl?: string`) would need to be duplicated in both files.

**Impact / Effect:** Single source of truth for plugin shape. Reduces future maintenance when extending the plugin contract.

**Effort / Difficulty:** **Easy**
- Extract an `AlgorithmPlugin<TParams, TStepper>` base interface in `pluginMetadata.ts` or a new `AlgorithmPlugin.ts`. `GeneratorPlugin` and `SolverPlugin` each extend it with their specific param and stepper types.

---

### L-6 — `skipFirstGridSyncRef` Is a Leaky Abstraction

**Description:**
`useMazeEngine.ts:106` introduces `skipFirstGridSyncRef = useRef(true)` to suppress the first fire of the `useEffect` that watches `settings.gridWidth/gridHeight` (`line:321–349`). This is necessary because React's `useEffect` always fires on mount, which would send a spurious `rebuildGrid` command racing with the initial `init` command. The comment at `line:326–329` explains the intent, but the implementation is fragile: it resets `skipFirstGridSyncRef.current = true` on cleanup (`line:243`), which is correct, but the asymmetry between "init always sends current dimensions" and "dimension change effect fires on mount" is a hidden invariant.

**Impact / Effect:** More explicit, less surprising effect logic. Eliminates a subtle ordering dependency.

**Effort / Difficulty:** **Easy**
- The `init` command already carries `MazeEngineOptions` including `width` and `height`. The `rebuildGrid` effect is only meaningful when dimensions change *after* initialization. Replace `skipFirstGridSyncRef` with `useEffect` split: initialize the engine in one effect (runs once on mount); watch dimensions in a separate effect that is explicitly conditioned on `initializedRef.current` being true. The `initializedRef` is already set in the init effect (`line:242`) — add a second state variable `postInitRef = useRef(false)` that is set after the first init effect completes (via a callback or `useLayoutEffect`), and gate the dimension effect on `postInitRef.current`.

---

### L-7 — Color Theme Is Stored as CSS String Values, Not CSS Custom Properties

**Description:**
`ColorTheme` (`colorPresets.ts:1–19`) stores 17 color values as CSS string literals (hex, rgba). These are consumed directly in `CanvasRenderer.drawCell` as `ctx.fillStyle = this.colors.visitedA`. There is no CSS custom property (`--color-visited-a`) backing, no live theming via the DOM, and no ability to use CSS transitions on color changes.

Currently, changing the theme triggers a full `renderAll()` to repaint with new colors. If colors were CSS custom properties, certain overlay animations (fade in/out of visited cells) could be achieved through CSS transitions rather than Canvas redraw cycles.

**Impact / Effect:** Enables CSS-level theming (user OS dark/light mode preference via `prefers-color-scheme`). Enables smooth color transitions without Canvas repaints. Simplifies the `CanvasRenderer` API (it reads computed CSS values rather than being passed color strings).

**Effort / Difficulty:** **Moderate**
- This is a non-trivial refactor since `CanvasRenderer` is a headless Canvas class. Implementing it would require passing a `getComputedStyle`-compatible interface or pre-resolving CSS custom properties to strings at render time.
- A simpler intermediate step: expose a `applyThemeToDocument(theme: ColorTheme)` utility that writes CSS custom properties to `:root`, and use `var(--color-wall)` etc. in `globals.css` for non-Canvas elements. The Canvas renderer continues using the raw string values — this is a low-effort UX improvement even without changing the renderer.

---

*Review completed: 2026-03-15. Source analyzed at `/Users/ekarimov/mazer`.*
