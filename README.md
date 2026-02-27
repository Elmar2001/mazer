# Mazer

Deterministic maze generation and solving visualizer built with Next.js App Router, React, TypeScript, Zustand, and an HTML Canvas renderer.

## Features

- Step-based generator catalog with `40` algorithms (research-core + advanced + aliases), including:
  - classic perfect mazes: DFS Backtracker, Prim variants, Kruskal, Wilson, Eller, Recursive Division
  - loop-capable mazes: Braid, Prim (Loopy), Kruskal (Loopy), Recursive Division (Multi-Gap)
  - weave topology: Weave Growing Tree
  - advanced/experimental variants: Resonant Phase-Lock, Erosion, Quantum Seismogenesis, Mycelial Anastomosis, Counterfactual Cycle Annealing, Sandpile Avalanche
- Step-based solver catalog with `29` algorithms, including:
  - Random Mouse
  - BFS
  - DFS
  - A*
  - A* (Euclidean)
  - Bellman-Ford
  - Iterative Deepening DFS (IDDFS)
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
  - Q-Learning (RL)
  - Ant Colony Optimization
- Runtime controls:
  - algorithm selection
  - topology workspace filter (`All`, `Perfect`, `Loopy`, `Weave`)
  - dynamic generator parameter controls from plugin metadata schemas
  - loop-density presets for loopy generators (`20`, `35`, `60`)
  - optional solver battle mode (Solver A vs Solver B)
  - speed (steps/sec)
  - grid width/height
  - cell size
  - play/pause/step/reset/generate/solve
  - deterministic seed input
  - topology-aware solver compatibility filtering
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
  - graph richness stats after generation (`edgeCount`, `cycleCount`, `deadEndCount`, `junctionCount`, `shortestPathCount`)
  - per-solver comparison cards in battle mode (status, throughput, visited/frontier/path, patches)
- Full algorithm list, pseudocode, complexity, and topology/compatibility notes: `/docs`

## Architecture

- `src/core/`: pure algorithmic logic
  - `grid.ts`: typed-array grid model (`walls`, `overlays`) and helpers
  - `rng.ts`: deterministic PRNG + string-to-seed hashing
  - `patches.ts`: cell patch and step result types
  - `analysis/graphMetrics.ts`: topology/graph richness metrics + shortest-route counting
  - `plugins/*`: generator/solver interfaces and plugin implementations
- `src/engine/`
  - `MazeEngine.ts`: phase state machine, RAF scheduler, patch application, dirty-cell emission, graph metric snapshotting at `Generated`
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

## Quality Gates

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

CI runs the same four commands on every push and pull request.

Current tests cover:
- deterministic RNG behavior
- deterministic generator outputs for identical seeds
- basic generator correctness (connectivity + topology-specific invariants)
- solver correctness and shortest-path optimality checks (BFS, Dijkstra, Bellman-Ford)
- graph metric correctness (cycles, dead ends, shortest-route counting, tunnel traversal)
- visualization pacing regressions (including Bellman-Ford progression on open/loopy graphs)
- documentation/pseudocode coverage for all registered plugins

## Topology + Weights Notes

- Maze edges are unit-cost (unweighted) across every generator.
- Weighted A* is retained as an advanced heuristic-priority variant; it does **not** introduce weighted maze edges.
- Generators now advertise output topology (`perfect-planar`, `loopy-planar`, `weave`) and solver dropdowns auto-filter to compatible algorithms.
- Loopy generators expose `loopDensity` through UI metadata schemas to tune cycle frequency.
- Bellman-Ford relaxation is pass-snapshot based (not in-pass cascading) to preserve stepwise visualization clarity.

## Adding a New Generator Plugin

1. Create a file in `src/core/plugins/generators/`.
2. Implement `GeneratorPlugin`:
   - `create(...)` returns a stepper with `step(): StepResult`
   - mutate only through returned `patches`
   - optionally add `generatorParamsSchema` in plugin metadata for UI controls
3. Export plugin in `src/core/plugins/generators/index.ts`.
4. Register topology (`perfect-planar` / `loopy-planar` / `weave`) in generator metadata wiring.
5. It will appear in the UI dropdown via `src/ui/constants/algorithms.ts`.

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
