# Mazer

Deterministic maze generation and solving visualizer built with Next.js App Router, React, TypeScript, Zustand, and an HTML Canvas renderer.

## Features

- Step-based maze generators:
  - Recursive Backtracker (DFS)
  - Recursive Division
  - Randomized Prim
  - Prim (True Frontier Edges)
  - Prim (Simplified)
  - Prim (Modified)
  - Prim (Frontier Edges)
  - Randomized Kruskal
  - Binary Tree
  - Sidewinder
  - Aldous-Broder
  - Hunt-and-Kill
  - Growing Tree
  - Growing Forest
  - Randomized BFS Tree
  - Eller
  - Houston (AB + Wilson)
  - Wilson
  - Unicursal
  - Fractal Tessellation
  - Cellular Automata (Cave-Biased)
  - Origin Shift
- Step-based maze solvers:
  - Random Mouse
  - BFS
  - DFS
  - A*
  - A* (Euclidean)
  - Dijkstra
  - Greedy Best-First
  - Bidirectional BFS
  - Collision Solver
  - Dead-End Filling
  - Cul-de-sac Filler
  - Blind Alley Sealer
  - Blind Alley Filler
  - Weighted A*
  - Flood Fill
  - Lee Wavefront
  - Shortest Path Finder
  - Shortest Paths Finder (All)
  - Wall Follower (Right-Hand)
  - Wall Follower (Left-Hand)
  - Pledge Algorithm
  - Tremaux
  - Chain
- Runtime controls:
  - algorithm selection
  - optional solver battle mode (Solver A vs Solver B)
  - speed (steps/sec)
  - grid width/height
  - cell size
  - play/pause/step/reset/generate/solve
  - deterministic seed input
  - visited/frontier/path visibility toggles
  - live generator/solver pseudocode trace with active-line highlighting
- speed slider range: `1..5000` steps/sec
- Metrics panel:
  - step count
  - visited count
  - frontier size
  - path length
  - elapsed time
  - actual throughput (steps/s)
  - patch + dirty-cell volume
  - engine compute time + utilization estimate
  - per-solver comparison cards in battle mode (status, throughput, visited/frontier/path, patches)

## Architecture

- `src/core/`: pure algorithmic logic
  - `grid.ts`: typed-array grid model (`walls`, `overlays`) and helpers
  - `rng.ts`: deterministic PRNG + string-to-seed hashing
  - `patches.ts`: cell patch and step result types
  - `plugins/*`: generator/solver interfaces and plugin implementations
- `src/engine/`
  - `MazeEngine.ts`: phase state machine, RAF scheduler, patch application, dirty-cell emission
- `src/render/`
  - `CanvasRenderer.ts`: DPR-aware canvas rendering + dirty-cell redraw
- `src/ui/`
  - Zustand store (`store/mazeStore.ts`)
  - engine hook (`hooks/useMazeEngine.ts`)
  - React components (`components/*`)

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).
Algorithm reference page: [http://localhost:3000/docs](http://localhost:3000/docs).

## Tests

```bash
npm test
```

Current tests cover:
- deterministic RNG behavior
- deterministic generator outputs for identical seeds
- basic generator correctness (connectivity + tree edges)
- solver correctness and BFS optimal path length

## Adding a New Generator Plugin

1. Create a file in `src/core/plugins/generators/`.
2. Implement `GeneratorPlugin`:
   - `create(...)` returns a stepper with `step(): StepResult`
   - mutate only through returned `patches`
3. Export plugin in `src/core/plugins/generators/index.ts`.
4. It will appear in the UI dropdown via `src/ui/constants/algorithms.ts`.

Example patch usage:

```ts
return {
  done: false,
  patches: [
    { index: from, wallClear: WallFlag.East },
    { index: to, wallClear: WallFlag.West, overlaySet: OverlayFlag.Visited },
  ],
};
```

## Adding a New Solver Plugin

1. Create a file in `src/core/plugins/solvers/`.
2. Implement `SolverPlugin` with step-wise search logic.
3. Emit path overlays (`OverlayFlag.Path`) when goal is reached.
4. Export plugin in `src/core/plugins/solvers/index.ts`.

## Performance Notes

- Algorithms never clone full grids per step.
- Step updates are cell-level patches (`CellPatch`).
- Engine tracks dirty cell indices and sends only those to renderer.
- Renderer redraws dirty cells (plus local neighbors for wall edge consistency).
- React runtime state updates are throttled to a single `requestAnimationFrame` flush.
