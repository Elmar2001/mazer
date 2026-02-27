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

Mazer is a maze algorithm visualizer built with Next.js 15 (App Router), React 19, TypeScript (strict), Zustand 5, and HTML Canvas. It visualizes step-by-step maze generation and solving with real-time metrics.

### Four layers

1. **Core (`src/core/`)** — Pure algorithm logic with no UI dependencies.
   - `grid.ts`: Grid model using typed arrays (Uint8Array for walls, Uint16Array for overlays). Row-major indexing: `idx = y * width + x`. Wall flags are 4-bit (N/E/S/W). Overlay flags are bit-packed (8 bits per solver role for battle mode).
   - `analysis/graphMetrics.ts`: graph richness analysis (`edgeCount`, `cycleCount`, dead ends, junctions, shortest-route count with cap).
   - `plugins/generators/` and `plugins/solvers/`: All algorithms are iterative steppers. Each `step()` returns a `StepResult` containing `CellPatch` mutations and metadata. Never recursive, never clone full grids.
   - `rng.ts`: Deterministic Mulberry32 PRNG seeded from string hash.

2. **Engine (`src/engine/MazeEngine.ts`)** — Phase state machine (Idle → Generating → Generated → Solving → Solved) with RAF-based frame loop. Accumulates elapsed time, executes steps in batches, applies patches, tracks dirty cells, collects metrics. Supports battle mode (two solvers in parallel with separate overlay flags and metrics).
   - Computes graph metrics once when generation completes and keeps that snapshot visible through solving.

3. **Renderer (`src/render/CanvasRenderer.ts`)** — DPR-aware 2D canvas. Only redraws dirty cells + neighbors, not the full grid.

4. **UI (`src/ui/`)** — React components + Zustand store.
   - `store/mazeStore.ts`: Settings (algorithm selection, speed, dimensions, seed, toggles) and runtime state (phase, metrics, pseudocode line).
   - `hooks/useMazeEngine.ts`: Engine lifecycle, callback wiring, RAF-throttled state updates. Exposes generate/solve/pause/step/reset controls.
   - `components/`: ControlPanel, CanvasViewport, MetricsPanel, GeneratorTracePanel.

### Data flow

User input → Zustand store → useMazeEngine hook → MazeEngine (runs stepper, applies patches, tracks dirty cells) → CanvasRenderer.renderDirty() + store updates → React re-renders.

### Plugin system

Generators implement `GeneratorPlugin<TOptions, TMeta>`, solvers implement `SolverPlugin<TOptions, TMeta>`. Both are registered in their respective `index.ts` files. UI dropdown options are defined in `src/ui/constants/algorithms.ts`. To add a new algorithm: create the plugin file, register it in the index, and add a dropdown entry. Generators advertise output topology (`perfect-planar`, `loopy-planar`, `weave`) and solver dropdowns auto-filter to compatible algorithms. Generators can optionally expose UI controls via `generatorParamsSchema` metadata.

## Key conventions

- **Patch-based updates**: Algorithms emit `CellPatch` objects describing cell-level wall/overlay mutations. No full-grid cloning.
- **Deterministic**: Same seed string produces identical mazes via Mulberry32 PRNG.
- **Step metadata**: Algorithms return `line` numbers for pseudocode tracing and `solverRole` for battle mode identification.
- **Visualization pacing**: Bellman-Ford runs pass-by-pass (snapshot relaxation) to avoid instant convergence on highly connected/open mazes.
- **Path alias**: `@/*` maps to project root in tsconfig.
- **Speed range**: 1–5000 steps/sec, configured in `src/config/limits.ts`.

## Coding style

- 2 spaces, semicolons, double quotes, trailing commas.
- `PascalCase` for classes/components, `camelCase` for functions/variables, `kebab-case` for plugin IDs (e.g. `"dfs-backtracker"`).
- Prefer `@/` import aliases for modules under `src/`.
- Conventional commits: `feat(core): ...`, `fix(ui): ...`.

## Testing

Tests live under `tests/` (`core`, `engine`, `config`). They verify generator determinism/connectivity/topology, solver correctness + visualization pacing regressions, worker/engine behavior, and documentation coverage. Vitest with Node environment.
