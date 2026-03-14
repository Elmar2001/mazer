# Mazer Architecture Analysis

## 1. Project Overview & Domain
**Mazer** is a deterministic, step-based visualization engine designed to demonstrate and compare maze generation and solving algorithms in real-time. Unlike typical algorithm visualizers that process an entire graph and replay a recorded state history, Mazer executes algorithms incrementally using a highly optimized, decoupled architecture. This allows users to observe the "thinking process" of algorithms—such as DFS backtracking, BFS, A*, or Bellman-Ford—as they carve paths or search for goals.

**Domain & Audience:**
The primary domain is algorithmic education and performance visualization. The target audience includes Computer Science students, educators, and algorithm enthusiasts who want to intuitively understand graph traversal, heuristics, and topological structures. The "battle mode" feature explicitly compares two solvers simultaneously on the same deterministic maze grid, offering a mechanical breakdown of efficiency (e.g., frontier size vs. path length).

---

## 2. Tech Stack & Environment
The project strictly separates the React/UI layer from the high-performance execution engine.

*   **Frontend Framework:** Next.js 15 (App Router, statically exported via `output: "export"`).
*   **UI Library & Styling:** React 19, raw CSS (`globals.css`).
*   **State Management:** Zustand (`useMazeStore` for UI configuration and low-frequency runtime snapshots).
*   **Rendering Layer:** Raw HTML5 Canvas API (2D Context), built to be DPR-aware (Device Pixel Ratio) for crisp rendering on high-density displays.
*   **Language:** TypeScript (Strict mode).
*   **Build & Testing:** Vite/Vitest for unit testing Node-compatible algorithmic logic.
*   **Runtime Environments:** Designed for browser execution (`window.requestAnimationFrame`), with fallbacks or potential offloading to Web Workers (currently implemented via `maze.worker.ts` and `mazeWorkerProtocol.ts`).

---

## 3. Project Structure & Boundary Enforcement
The codebase enforces a strict separation of concerns, ensuring that pure mathematical logic never touches the DOM.

```text
mazer/
├── app/                  # Next.js App Router entry points (layout.tsx, page.tsx, docs/)
├── src/
│   ├── config/           # Enforced system limits, dimensions, and speeds
│   ├── core/             # Framework-agnostic mathematical domain. No UI or Canvas here.
│   │   ├── grid.ts       # TypedArray implementations & Bitmasks logic
│   │   ├── patches.ts    # Incremental state delta definitions (CellPatch)
│   │   ├── rng.ts        # Seeded deterministic PRNG
│   │   ├── analysis/     # Graph topology metrics
│   │   └── plugins/      # Generator and Solver interfaces and implementations
│   ├── engine/           # Runtime Orchestrator
│   │   ├── MazeEngine.ts        # The core state machine and requestAnimationFrame loop
│   │   ├── maze.worker.ts       # Web Worker entry point
│   │   └── mazeWorkerRuntime.ts # Decoupled execution runtime
│   ├── render/           # Visual presentation
│   │   └── CanvasRenderer.ts    # Dirty-cell Canvas 2D redraw logic
│   └── ui/               # React integration
│       ├── components/   # React Components
│       ├── hooks/        # e.g., useMazeEngine.ts (bridges Engine events -> Zustand)
│       └── store/        # Zustand (mazeStore.ts)
└── tests/                # Vitest coverage verifying determinism and invariants
```

**Boundaries:**
1.  `core` knows nothing about execution pacing or rendering. It merely calculates logic and yields generic `CellPatch` arrays.
2.  `engine` knows nothing about Canvas or React. It orchestrates `core`, queues patches, measures execution time, and emits generic events.
3.  `render` knows nothing about algorithms. It only knows how to interpret a `Grid`'s bitmask arrays and draw subsets of pixels based on array indices.
4.  `ui` wraps the engine via Web Workers, ensuring standard Next.js state doesn't choke on 5,000 algorithmic yields per second.

---

## 4. Architecture & Design Patterns
Mazer relies on several advanced design patterns to maintain 60FPS while mutating tens of thousands of grid cells per second.

1.  **Event-Driven / Patch-Driven Updates:** Instead of cloning graphs, plugins yield `CellPatch` objects. The Engine applies these masks to a mutable singleton `Grid` and forwards the delta indices to the Canvas.
2.  **Plugin Architecture:** All algorithms conform to an explicit `Stepper` interface (`GeneratorPlugin`, `SolverPlugin`).
3.  **State Machine Orchestration:** `MazeEngine` enforces a linear pipeline: `Idle` → `Generating` → `Generated` → `Solving` → `Solved`.
4.  **Decoupled requestAnimationFrame (rAF) Loop:** The Engine's rAF loop accumulates time (`accumulatorMs`) and steps algorithms multiple times per visual frame (`ENGINE_MAX_STEPS_PER_FRAME`) depending on the user's requested `speed`, fully divorcing simulation time from render time.
5.  **Reactive State Bridge (Publish-Subscribe):** `useMazeEngine` uses a React ref to hold the Engine transport. High-frequency `patchesApplied` events hit the Canvas directly. Low-frequency `runtimeSnapshot` events hit Zustand, which updates React.

---

## 5. Core Components & High-Performance Data Models

### Deep Dive: `src/core/grid.ts`
To achieve maximum memory efficiency and CPU cache locality, Mazer **eschews Object-Oriented nodes** (e.g., `class Cell { edges: Node[] }`).
Instead, a `Grid` is a System of Arrays (SoA):
```typescript
export interface Grid {
  walls: Uint8Array;     // 1 byte per cell (North=1, East=2, South=4, West=8)
  overlays: Uint16Array; // 2 bytes per cell (Visited=1, Frontier=2, Path=4, Current=8...)
  // ...
}
```
*   **Bitmasks:** Constants like `WallFlag.East` (2) and `OverlayFlag.Visited` (1) allow logic to carve walls or mark visits using single-cycle CPU instructions (`|=` to set, `&= ~` to clear).
*   **Battle Mode Masks:** `OverlayFlag` contains distinct high-bits for a secondary solver (`VisitedB=16`, `FrontierB=32`), allowing two solvers to write to the same `Uint16` simultaneously without collision.

### Deep Dive: `CellPatch`
Algorithms yield iterations of:
```typescript
export interface CellPatch {
  index: number;
  wallClear?: number;
  overlaySet?: number;
}
```
The Engine takes this patch, mutates `grid.walls[index] &= ~patch.wallClear`, and queues `index` for the Canvas.

### Deep Dive: `MazeEngine.ts` and Pacing
`MazeEngine.processStep()` decides whether to call `generatorStepper.step()` or the `solverPrimary` / `solverSecondary` steppers.
In the `onFrame` loop:
1.  Calculates delta `ts - lastFrameTs`.
2.  Adds to `accumulatorMs`.
3.  While `accumulatorMs >= stepInterval` (e.g., `speed=100` means `10ms` intervals), it ticks the algorithm and collects dirty cells.
4.  Finally, it emits `dirtyCells` and `patches` to the UI exactly once per physical browser frame.

### Deep Dive: `CanvasRenderer.ts`
When `renderDirty(dirtyCells)` is called:
1.  Expands the dirty set to include immediate neighbors (to correctly overdraw wall connections and shadows).
2.  For each index, recalculates X/Y coordinates based on `settings.cellSize`.
3.  Draws base colors, insets, paths, current rings, and finally walls using `ctx.fillRect`.
4.  Crucially, it **only** clears and redraws those specific 16x16 pixel areas, ignoring the other 99% of the static maze.

---

## 6. Algorithm Plugin Ecosystem
Algorithms are generators acting as state machines.

Interfaces (`GeneratorStepper`, `SolverStepper`) require a `step(): StepResult` method.
Because Mazer pauses/resumes and renders intermediately, algorithms *cannot* use standard recursive call stacks or synchronous `while(frontier.length > 0)` loops.
Instead:
*   **Heap-allocated State:** Algorithms must explicitly store their `stack`/`queue`/`visited` sets on a class instance.
*   **Yielding:** Each call to `step()` performs exactly one logical unit of work (e.g., "pop one cell from the queue, push its neighbors, yield the newly visited cell patches").
*   **Determinism:** Plugins are passed a `rng: RandomSource`. Sorting edges using `rng.random()` guarantees that seeds like `"mazer"` always produce the exact same topological layout and Battle Mode outcome on every user's machine.

---

## 7. Data Flow & Execution Lifecycle

1.  **Bootstrap:** User sets width/height. Zustand updates. `useMazeEngine` sends `init` command to Web Worker. Engine allocates `Uint8Array`.
2.  **Generate:** User clicks "Generate".
    *   `UI` calls `controls.generate()`.
    *   Command dispatched to Worker.
    *   `MazeEngine.startGeneration()` instantiates the chosen plugin stepper.
    *   `onFrame` loop starts pulsing.
3.  **Execution Loop:**
    *   Stepper checks its internal stack.
    *   Stepper yields a `CellPatch` (e.g., index 5, `wallClear=WallFlag.East`).
    *   Engine mutates `Grid`.
    *   Engine sends `patchesApplied` event back to main thread.
4.  **Render Sync:**
    *   `useMazeEngine` traps event.
    *   Calls `CanvasRenderer.renderDirty([5])`.
    *   React is entirely bypassed for this 60FPS visual update.
5.  **Phase Transition:**
    *   Generator stack empties. `done: true` yielded.
    *   Engine fires `analyzeMazeGraph()` seamlessly before telling the UI it is "Generated".
6.  **Battle / Solve:**
    *   Engine instantiates two solver steppers simultaneously.
    *   Engine yields patches from both. For Solver B, the engine uses a helper `remapPatchForSecondary()` to automatically bitshift `OverlayFlag.Visited` to `OverlayFlag.VisitedB`, preventing UI collisions.

---

## 8. State Management

Mazer expertly delineates UI State from Engine Logic State:

| Category | High-Frequency State (Bitmasks) | Low-Frequency State (React) |
| :--- | :--- | :--- |
| **Storage** | Raw ArrayBuffers (`Grid`), Worker closures | Zustand Store (`useMazeStore`) |
| **Examples** | What walls exist? Is cell 50 in the A* queue? | Is sidebar open? What is the current Seed? |
| **Mutation Rate** | Up to 10,000x per second | ~2x to 10x per second (Phase changes) |
| **Access** | `engine` mutates, `CanvasRenderer` reads | Next.js components bind via `useStore` |

Using `requestAnimationFrame` batching in `useMazeEngine` (`queueRuntimeUpdate()`), the hook throttles React re-renders to a maximum of 60FPS even if the Worker emits thousands of events.

---

## 9. Configuration & Ecosystem Tuning

*   **`config/limits.ts`**: Protects the browser from exploding. Caps maximum speed to `5000` TPS, maximum grid cells to prevent V8 allocation limits, and max Canvas backing pixel sizes (for iOS Safari compat).
*   **`colorPresets.ts`**: CSS-free rendering. All colors injected directly into Canvas Context fillStyles.
*   **Algorithm Parameters**: Handled via `generatorParamsSchema` and `solverParamsSchema`, pushed into `MazeEngineOptions`. (e.g., adjusting DFS straightness bias).
*   **Relaxation Pacing**: Documented in `GEMINI.md`, algorithms like Bellman-Ford intentionally perform internal looping without yielding to the engine on open graphs to avoid visualizing tens of thousands of meaningless unrelaxed edges.

---

## 10. Testing Strategy & CI Considerations
The Vite/Vitest implementation acts mathematically, lacking a DOM.

*   **Determinism Tests (`rng.test.ts`, logic tests)**: Ensures `same seed = same bitmask output`.
*   **Topological Invariants (`generators.test.ts`)**: Exhaustively runs algorithms and verifies via `connectedNeighbors` that the graph is fully connected (no walled-off islands) and respects topological requests (pure trees have `cycles === 0`).
*   **Solver Correctness (`solvers.test.ts`)**: Confirms `pathLength` is identical to known optimal Dijkstra routes.
*   **Engine Decoupling**: Because `Grid` is DOM-free, Vitest instantiates `MazeEngine` synchronously, stubs `requestAnimationFrame`, manually steps the engine `10_000` times, and asserts final state metrics.

---

## 11. Security & Edge Case Analysis

*   **Thread-Blocking Risks**: In extremely large mazes without Web Workers, an algorithm yielding high-density calculations could monopolize the main thread. By manually enforcing a `stepper.step()` granularity and clamping execution times inside `ENGINE_MAX_STEPS_PER_FRAME`, Mazer prevents the "Page Unresponsive" browser crash.
*   **Input Validation**: `clampGridWidth`, `clampGridHeight`, and `clampSpeed` inside Zustand ensure that user manipulation of DOM inputs cannot force the Engine to allocate malicious `Uint8Array` sizes beyond 1-10MB.
*   **Memory Leaks**: `Grid` objects are explicitly abandoned to garbage collection upon `rebuildGrid`. Handlers correctly detach in the `useEffect` returned cleanup inside `useMazeEngine`.

---

## 12. Performance & Scalability Bottlenecks

1.  **Bitwise TypedArrays over JSON**: Storing a 200x200 maze (40,000 cells) as Objects would require ~10MB of jagged memory heap. `Uint8Array(40000)` requires precisely 40KB of contiguous L1 Cache-friendly memory.
2.  **Draw Calls**: `CanvasRenderer` does not `clearRect` the whole canvas. It recalculates the union of `dirtyCells`, draws local rectangles.
3.  **Future Bottleneck:** Transferring large arrays of `CellPatch` objects from Web Worker to Main Thread involves structured cloning. If stepping at 50,000 steps/sec, serialization overhead might exceed DOM render time.
    *   *Web Worker Offloading (Implemented)*: `src/engine/mazeWorkerProtocol.ts` bridges this, but uses standard array serialization.
    *   *Improvement*: Shifting to `SharedArrayBuffer` for the `Grid` and a ring buffer for patches would drop serialization cost to exactly ZERO.

---

## 13. Architectural Diagrams

### Execution Loop Component Diagram (Mermaid)

```mermaid
sequenceDiagram
    participant User
    participant React (useMazeEngine/Zustand)
    participant WorkerController (Protocol)
    participant MazeEngine
    participant Plugin (DFS/A*)
    participant CanvasRenderer

    User->>React: Click "Generate"
    React->>WorkerController: dispatch {type: 'generate'}
    WorkerController->>MazeEngine: startGeneration()
    MazeEngine->>Plugin: create(Grid, RNG)
    
    loop requestAnimationFrame
        MazeEngine->>Plugin: step()
        Plugin-->>MazeEngine: yield CellPatch[]
        MazeEngine->>MazeEngine: applyPatch(Grid)
        MazeEngine-->>WorkerController: emit {patches, dirtyCells}
        WorkerController-->>Rect: trigger handleEvent
        React->>CanvasRenderer: renderDirty(dirtyCells)
        CanvasRenderer->>CanvasRenderer: Direct ctx.fillRect() on Canvas
    end
    
    MazeEngine->>MazeEngine: analyzeMazeGraph()
    MazeEngine-->>WorkerController: emitPhase('Generated')
    WorkerController-->>React: update Zustand Phase
    React-->>User: UI updates (Enable Solve buttons)
```

---

## 14. Interesting & Non-Obvious Facts
1.  **Canvas Visual Tricks:** Walls are drawn as slightly overlapping overlapping filled rectangles (`wallWidth + so * 2`). This entirely prevents ugly pixel gaps at intersections where a North/South wall meets an East/West wall, avoiding complex corner SVG calculations.
2.  **Solver Battle Offsets:** The UI manages to render two algorithms simultaneously not by drawing two grids, but by rendering nested geometric outlines. `Current` draws as a full circle, whereas `CurrentB` draws as an inner ring. `FrontierA` fills the cell, `FrontierB` strokes the cell boundary.
3.  **"Headless" capability:** By separating `CanvasRenderer`, the `MazeEngine` can technically run on a Node.js server seamlessly.

---

## 15. Improvement Recommendations

1.  **Priority 1: SharedArrayBuffer Migration.** If aiming to push grid limits into 1000x1000 macro-mazes, transferring `CellPatch[]` across the Worker boundary will stutter. Switch `Grid` arrays to `SharedArrayBuffer` and use `Atomics` for signaling to completely bypass structured cloning.
2.  **Priority 2: OffscreenCanvas.** Currently, the Web Worker handles logic, but `useMazeEngine` still catches the patches and tells the Main Thread Canvas to draw. Shifting the Canvas rendering entirely to the Worker via `OffscreenCanvas` would guarantee 60FPS UI rendering even if React locks up heavily.
3.  **Anti-Pattern Warning:** In `useMazeEngine.ts`, `queueRuntimeUpdate` uses `requestAnimationFrame` to batch Zustand updates. This is clever but slightly risky as it creates a secondary async queue running parallel to React's internal fiber scheduler. `useSyncExternalStore` or React 19's concurrent features might be a more idiomatically safe approach moving forward.
4.  **Renderer Flexibility:** Extract `CanvasRenderer` implementations into a `BaseRenderer` interface. This would allow an easy swap to WebGL/PixiJS if complex shaders (e.g., lighting effects as solvers search) are desired later.
