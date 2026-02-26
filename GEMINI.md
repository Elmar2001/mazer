# Mazer Project

## Project Overview

**Mazer** is a deterministic maze generation and solving visualizer. It features a step-based architecture that allows users to visualize how various maze generation and solving algorithms work in real-time. 

### Key Technologies
*   **Framework:** Next.js 15 (App Router)
*   **UI Library:** React 19
*   **Language:** TypeScript
*   **State Management:** Zustand
*   **Rendering:** HTML Canvas (DPR-aware)
*   **Testing:** Vitest

### Architecture
The project is structured to strictly separate algorithmic logic, execution, and rendering:
*   **`src/core/`**: Contains pure, framework-agnostic algorithmic logic.
    *   `grid.ts`: Represents the maze using highly efficient typed arrays (`Uint8Array` for walls, `Uint16Array` for overlays) and bitmask operations.
    *   `patches.ts`: Defines `CellPatch` types used to record and transmit state changes incrementally.
    *   `rng.ts`: Implements a deterministic pseudo-random number generator.
    *   `plugins/`: Defines interfaces and implementations for generators and solvers.
*   **`src/engine/`**: The core runtime execution layer.
    *   `MazeEngine.ts`: Manages a state machine (`Idle`, `Generating`, `Generated`, `Solving`, `Solved`). It uses a decoupled `requestAnimationFrame` loop to step algorithms at a requested speed (up to 5000 steps/sec) and emits dirty-cell patches rather than full grid clones. Supports "battle mode" between two solvers.
*   **`src/render/`**: Handles drawing.
    *   `CanvasRenderer.ts`: Efficiently redraws only the "dirty" cells (and their immediate neighbors) communicated by the engine.
*   **`src/ui/`**: React integration.
    *   Zustand store for global UI state.
    *   Custom hooks (e.g., `useMazeEngine.ts`) to bridge the engine to React components.

## Building and Running

*   **Development Server:**
    ```bash
    npm run dev
    ```
    (Runs Next.js dev server on `http://localhost:3000`)
*   **Production Build:**
    ```bash
    npm run build
    npm run start
    ```
*   **Testing:**
    ```bash
    npm test
    ```
    (Runs the Vitest test suite, verifying RNG behavior, generator output consistency, and solver path correctness)
*   **Linting:**
    ```bash
    npm run lint
    ```

## Development Conventions

*   **Performance First:** The architecture heavily emphasizes performance. Algorithms **must never** clone the full grid per step. Instead, they must yield `CellPatch` objects describing incremental changes to wall configurations or visual overlays.
*   **Deterministic Execution:** All random behavior within algorithms must utilize the provided deterministic RNG (seeded via the UI) to ensure visual consistency and reproducible battles.
*   **Plugin System:** 
    *   **Generators:** Adding a new generator involves creating a `GeneratorPlugin` in `src/core/plugins/generators/`, implementing a stepper that yields patches, and exporting it from `index.ts`.
    *   **Solvers:** Solvers follow a similar pattern in `src/core/plugins/solvers/`, emitting `OverlayFlag.Path` when a path is found.
*   **Bitmasks:** Grid walls and overlays (visited, frontier, path, current) are managed using bitwise operations for memory efficiency and speed. Ensure you use the provided masks (e.g., `WallFlag`, `OverlayFlag`) in `src/core/grid.ts`.
