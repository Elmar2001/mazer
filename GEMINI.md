# Mazer Project - Architecture & Guidelines

## Project Overview

**Mazer** is a deterministic maze generation and solving visualizer. It features a step-based architecture that allows users to watch the "thinking process" of various maze generation and solving algorithms in real-time.

### Key Technologies
*   **Framework:** Next.js 15 (App Router, Static Export: `output: "export"`)
*   **UI Library:** React 19
*   **Language:** TypeScript 5.7 (strict)
*   **State Management:** Zustand 5
*   **Rendering:** HTML5 Canvas (DPR-aware, no WebGL/third-party libs)
*   **Testing:** Vitest

## Commands & Pre-PR Quality Gate

When proposing changes or fixing bugs, ensure you pass the full quality gate. This mimics the CI checks:

```bash
npm run lint         # ESLint (--max-warnings=0)
npm run typecheck    # TypeScript check (tsc --noEmit)
npm test             # Run all tests (Vitest)
npm run build        # Production build
```
Other useful commands: `npm run dev` (dev server), `npm run test:watch`.

## Architectural Layers & Boundaries

Mazer is strictly divided into four layers with one-way dependencies. **Never violate these boundaries:**

1.  **`src/core/`**: Pure algorithmic logic. **Zero imports** from engine, render, or ui. No DOM, no React.
2.  **`src/engine/`**: Runtime orchestration (RAF loop, Web Worker protocol, state machine). Imports from `core` only. No React, no DOM references beyond `globalThis.requestAnimationFrame`.
3.  **`src/render/`**: Canvas drawing. Imports from `core` and `config` only. No Zustand, no React.
4.  **`src/ui/`**: React + Zustand layer. The only layer allowed to import across all other layers.

## Core Data Models & Performance

*   **Performance First:** The architecture is heavily optimized for fast, GC-friendly execution. Memory footprint is minimized.
*   **The Grid Model (`src/core/grid.ts`)**: The maze is represented using 4 flat row-major TypedArrays:
    *   `walls`: `Uint8Array` (1 byte/cell, 4-bit wall bitmask: North/East/South/West).
    *   `overlays`: `Uint16Array` (2 bytes/cell, packs two 8-bit solver channels for battle mode).
    *   `crossings`: `Uint8Array` (for weave mazes).
    *   `tunnels`: `Int32Array` (tunnel destination flat indices).
*   **Bitmasks (`const enum`)**: Use `WallFlag` and `OverlayFlag`. Because they are `const enum`s, they are inlined at compile time. **Do not use them as object keys or attempt to iterate over them.**
*   **Patch-Based Updates**: Algorithms **must never clone the full grid** per step. Instead, they yield lightweight `CellPatch` arrays that describe incremental bitwise changes to walls or overlays.
*   **Deterministic Execution**: All random behavior must utilize the provided deterministic RNG (Mulberry32 via `rng.ts`) seeded by a string. 
    *   *Critical:* Always use `Math.imul` for 32-bit wrapping multiplication in any hash/PRNG code. Never use the standard `*` operator, which produces float64.

## The Plugin Ecosystem

Adding new algorithms requires creating a `GeneratorPlugin` or `SolverPlugin` in `src/core/plugins/generators/` or `src/core/plugins/solvers/`, then exporting it from `index.ts`.
*   **Closure Steppers**: A plugin's `create` factory returns a stepper closure. All per-run state (stacks, queues, visited bitsets) must live in this lexical scope.
*   **Visualization Pacing**: Algorithms that would natively converge instantly (e.g. O(N) internal loops like Bellman-Ford) must batch work. Group an entire relaxation pass into one `step()` call so animation remains meaningful.
*   **Topological Contracts**: `perfect-planar` generators must produce `cycleCount = 0` (a spanning tree). `loopy-planar` generators may have cycles. Tests will assert these invariants.
*   **Dynamic UI Controls**: Generators can export a `generatorParamsSchema` to dynamically generate UI settings without touching React code.

## Execution Engine & Rendering

*   **Phase State Machine**: `Idle` → `Generating` → `Generated` → `Solving` → `Solved`.
*   **RAF Accumulator Loop**: The engine (`MazeEngine.ts`) uses an accumulator time budget inside a `requestAnimationFrame` loop. It drains the accumulator by executing as many steps as needed to maintain real-time accuracy, capped at 2,000 steps/frame.
*   **Web Worker Isolation**: Execution ideally happens in `maze.worker.ts` with zero-copy Grid transfers (via `Transferable` ArrayBuffers), keeping the UI thread strictly for React and Canvas draw calls.
*   **Dirty-Cell Rendering**: `CanvasRenderer` only redraws `dirtyCells` changed in the current frame. To prevent visual artifact gaps, dirty cells are expanded to include cardinal neighbors because wall rectangles overlap cell boundaries.
*   **Battle Mode**: In battle mode, Solver A uses bits 0-3 of the overlay mask, while Solver B's patches are bit-shifted left by 4 (bits 4-7) under the hood. The algorithm logic remains completely unaware.

## Code Style & Conventions

*   **Formatting**: 2 spaces, semicolons, double quotes, trailing commas.
*   **Naming**: `PascalCase` for components/classes, `camelCase` for functions/variables, `kebab-case` for plugin IDs.
*   **Imports**: Prefer `@/` for imports mapping to the project root.
*   **Commits**: Use conventional commits (e.g., `feat(core): ...`, `fix(ui): ...`).
*   **Graph Metrics Accumulators**: `analyzeMazeGraph` uses `Float64Array` instead of `Int32Array` for shortest path counts to avoid 32-bit overflow on heavily connected loopy mazes.

## Known Areas for Improvement
When planning large architectural changes, keep in mind:
*   Canvas rendering is currently main-thread only (No `OffscreenCanvas` yet).
*   No step-count timeout limits runaway algorithms.
*   `expandDirty` allocates a new `Set<number>` every frame, causing minor GC pressure.
*   Algorithm IDs are currently loose strings, not branded types.