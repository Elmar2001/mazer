# Plugin System — `src/core/plugins/`

This directory is the algorithm core. Most contributions to Mazer land here. Read this before adding or modifying any generator or solver.

See root `CLAUDE.md` for the full add-algorithm checklist, `CellPatch` interface, `OverlayFlag` bit layout, and `WallFlag` values.

---

## TypeScript Interfaces

### Generator

```typescript
interface GeneratorPlugin<TOptions, TMeta> extends PluginMetadata {
  id: string;           // kebab-case, unique
  label: string;        // display name
  create(params: { grid: Grid; rng: RandomSource; options: TOptions }): {
    step(): StepResult<TMeta>;
  };
}
```

### Solver

```typescript
interface SolverPlugin<TOptions, TMeta> extends PluginMetadata {
  id: string;
  label: string;
  create(params: { grid: Grid; rng: RandomSource; options: TOptions }): {
    step(): StepResult<TMeta>;
  };
}
```

`SolverRunOptions` always includes `startIndex: number` and `goalIndex: number`.
`GeneratorRunOptions` optionally includes `startIndex?: number`.

### StepResult / StepMeta

```typescript
// From patches.ts + types.ts
StepResult<TMeta> = {
  done: boolean;
  patches: CellPatch[];
  meta?: TMeta;
}

AlgorithmStepMeta = {
  line?: number;          // 1-indexed pseudocode line (required — trace panel uses this)
  visitedCount?: number;
  frontierSize?: number;
  pathLength?: number;
  solved?: boolean;       // solvers only — set true when goal found
}
```

`line` is mandatory in every returned `meta`. The trace panel does `pseudocode[activeLine - 1]`, so off-by-one is silent but wrong.

---

## Plugin Metadata (`pluginMetadata.ts`)

```typescript
type PluginImplementationKind = "native" | "alias" | "hybrid";
type PluginTier             = "research-core" | "advanced" | "alias";
type MazeTopology           = "perfect-planar" | "loopy-planar" | "weave";
type SolverGuarantee        = "guaranteed" | "heuristic" | "incomplete";
```

Fields you can declare on a plugin object (all optional unless noted):

| Field | Type | Effect |
|---|---|---|
| `implementationKind` | `"native" \| "alias" \| "hybrid"` | Metadata label; also controls `tier` derivation |
| `aliasOf` | `string` | ID of the conceptual parent algorithm (docs/display only) |
| `tier` | `PluginTier` | Override auto-derived tier (rarely needed) |
| `generatorParamsSchema` | `GeneratorParamSchema[]` | UI controls rendered by `MazeConfigPanel` dynamically |

Do **not** set `topologyOut` or `solverCompatibility` on the plugin object — these are applied by `withGeneratorMetadata()` / `withSolverMetadata()` in the index files.

---

## Implementation Kinds

### `native` (default)
Full self-contained algorithm. No `implementationKind` field needed.

### `alias`
Thin wrapper: same algorithm, different label/defaults. Set `implementationKind: "alias"` and `aliasOf: "<native-id>"`, then delegate `create()`:

```typescript
export const primSimplifiedGenerator: GeneratorPlugin<...> = {
  id: "prim-simplified",
  label: "Prim (Simplified - Randomized Prim)",
  implementationKind: "alias",
  aliasOf: "prim",
  create(params) {
    return primGenerator.create(params);   // pure delegation
  },
};
```

Metadata enrichment automatically assigns `tier: "alias"`. Some aliases have their own `create()` implementation despite the metadata label — `aliasOf` is documentary, not enforced.

### `hybrid`
Composes two or more steppers in phases (e.g., base algorithm → post-processing pass). Set `implementationKind: "hybrid"`. Pattern:

```typescript
create({ grid, rng, options }) {
  const baseStepper = someGenerator.create({ grid, rng, options });
  const context = { phase: "base" as "base" | "postprocess", baseStepper, ... };
  return { step: () => stepHybrid(context) };
}

function stepHybrid(ctx) {
  if (ctx.phase === "base") {
    const base = ctx.baseStepper.step();
    // forward all base patches
    if (base.done) { ctx.phase = "postprocess"; /* collect work */ }
    return { done: false, patches: base.patches, meta: { ...base.meta, line: 1 } };
  }
  // phase 2 logic, return done: true when finished
}
```

Examples: `braid.ts` (DFS → dead-end removal), `weaveGrowingTree.ts` (GrowingTree → crossing insertion).

---

## Closure Pattern (all plugins)

All per-run state lives in a closure — **never on the plugin object itself**. `create()` is called once per generation/solve run; `step()` is called repeatedly.

```typescript
export const myGenerator: GeneratorPlugin<GeneratorRunOptions, AlgorithmStepMeta> = {
  id: "my-algo",
  label: "My Algorithm",
  create({ grid, rng, options }) {
    // all state here — pause/resume is free
    const visited = new Uint8Array(grid.cellCount);  // NOT Set<number>
    const stack: number[] = [];
    let started = false;

    return {
      step() {
        const patches: CellPatch[] = [];
        // mutate local state, build patches
        return { done: false, patches, meta: { line: 1, visitedCount: 0 } };
      },
    };
  },
};
```

**Use `Uint8Array` for visited/frontier tracking**, not `Set<number>`. At 200×200 a `Set` uses ~3–4 MB; `Uint8Array` uses 40 KB.

---

## Visualization Pacing Rule

`step()` must advance by **exactly one logical unit** — the amount a human would consider one step when reading the pseudocode. This is not optional: too-fast convergence produces an animation that jumps straight to the result.

**Rule:** If your algorithm has an O(N) inner loop that runs to completion before producing visible output, batch the **entire inner loop** into one `step()` call.

Bellman-Ford example — one `step()` = one full relaxation pass:
```typescript
step() {
  // one entire edge-relaxation sweep, not one edge
  for (let i = 0; i < edges.length; i++) { ... }
  return { done: passNumber >= cellCount - 1, patches, meta: { line: 2, ... } };
}
```

Algorithms where one step = one cell/edge are fine as-is (DFS, BFS, Prim, etc.).

---

## Generator Registry (`generators/index.ts`)

### Topology assignment

```typescript
const GENERATOR_TOPOLOGY: Record<string, MazeTopology> = {
  "braid": "loopy-planar",
  "prim-loopy": "loopy-planar",
  "kruskal-loopy": "loopy-planar",
  "recursive-division-loopy": "loopy-planar",
  "reaction-diffusion": "loopy-planar",
  "wave-function-collapse": "loopy-planar",
  "percolation": "loopy-planar",
  "weave-growing-tree": "weave",
};
// Any generator NOT listed → "perfect-planar"
```

`perfect-planar` generators **must** produce `cycleCount = 0`. Tests assert this.

### Tier assignment

```typescript
tier = plugin.implementationKind === "alias" ? "alias"
     : RESEARCH_CORE_GENERATORS.has(plugin.id) ? "research-core"
     : "advanced";
```

To make a new generator `"research-core"`, add its ID to `RESEARCH_CORE_GENERATORS`.

---

## Solver Registry (`solvers/index.ts`)

### Compatibility (deny-list based)

All solvers support `"perfect-planar"` by default.

```typescript
// Denied loopy-planar AND weave:
const NO_LOOPY_SUPPORT = new Set(["wall-follower", "left-wall-follower", "random-mouse", "pledge"]);

// Denied weave only (strict subset — random-mouse CAN handle weave):
const NO_WEAVE_SUPPORT = new Set(["wall-follower", "left-wall-follower", "pledge"]);
```

Compatibility topologies are built as: `["perfect-planar", ...(!NO_LOOPY_SUPPORT → "loopy-planar"), ...(!NO_WEAVE_SUPPORT → "weave")]`.

### Guarantee

```typescript
// "guaranteed": BFS, A*, Dijkstra, Bellman-Ford, dead-end-filling, etc.
// "incomplete": random-mouse only
// "heuristic": everything else (greedy, Q-learning, ant-colony, etc.)
```

### Tier

```typescript
tier = plugin.implementationKind === "alias" ? "alias"
     : ADVANCED_SOLVERS.has(plugin.id) ? "advanced"
     : "research-core";
```

---

## Weave Construction

Weave mazes use two additional grid fields (`crossings`, `tunnels` — see root CLAUDE.md). To insert a crossing in a hybrid post-process pass:

A cell is eligible if it has exactly 2 open walls on one axis and 2 closed walls on the perpendicular axis (i.e., already a straight corridor in one direction).

```typescript
// Horizontal corridor → HorizontalOverVertical crossing
patches.push({ index: cell,  crossingSet: CrossingKind.HorizontalOverVertical });
patches.push({ index: north, tunnelToSet: south });
patches.push({ index: south, tunnelToSet: north });

// Vertical corridor → VerticalOverHorizontal crossing
patches.push({ index: cell,  crossingSet: CrossingKind.VerticalOverHorizontal });
patches.push({ index: west,  tunnelToSet: east });
patches.push({ index: east,  tunnelToSet: west });
```

`traversableNeighbors()` automatically includes tunnel destinations, so solvers that don't deny weave support work without modification.

---

## Runtime Parameters (`generatorParamsSchema`)

Declare typed params on the plugin object; `MazeConfigPanel` renders them dynamically — no React changes needed.

```typescript
generatorParamsSchema: [
  {
    type: "number",
    key: "loopDensity",       // must match key in options object
    label: "Loop Density",
    min: 0, max: 100, step: 5,
    defaultValue: 35,
  },
  {
    type: "boolean",
    key: "biasHorizontal",
    label: "Bias Horizontal",
    defaultValue: false,
  },
  {
    type: "select",
    key: "strategy",
    label: "Selection Strategy",
    options: [{ label: "Newest", value: "newest" }, { label: "Random", value: "random" }],
    defaultValue: "newest",
  },
]
```

Use `loopDensity.ts` helpers (`LOOP_DENSITY_PARAM_SCHEMA`, `parseLoopDensity()`) for the standard loop-density param — don't reinvent it.

Always validate options defensively: `typeof options.myParam === "number" && isFinite(options.myParam)` — options come from user input.

---

## Solver Utilities (`solvers/helpers.ts`)

```typescript
// Traversable neighbors — use this in solvers (includes tunnel links for weave)
getOpenNeighbors(grid, index): number[]

// Path reconstruction from parent array
buildPath(startIndex, goalIndex, parents: Int32Array): number[]
// Returns [] if no path. Walk goal → start via parents[], then reverse.

// Manhattan distance heuristic
manhattan(width, fromIndex, toIndex): number
```

## Generator Utilities (`grid.ts`, imported in generators)

```typescript
// Returns all 4 neighbors with direction metadata
neighbors(grid, index): Array<{ index: number; direction: { wall: WallFlag; opposite: WallFlag } }>

// Carve between two adjacent cells — produces 2 CellPatches (wallClear on each side)
carvePatch(fromIndex, toIndex, wallFrom, wallTo): CellPatch[]
```

---

## Common Pitfalls

- **`done: true` on first call**: Valid when the grid is trivially complete (1×1), but make sure the terminal `step()` still emits cleanup patches (clear `Current` overlay).
- **Missing overlay cleanup**: Always emit `overlayClear: OverlayFlag.Current` on the previously current cell before moving. Stale `Current` overlays show as stuck highlights.
- **`const enum` at runtime**: `WallFlag`, `OverlayFlag`, `CrossingKind` are `const enum` — they are inlined at compile time and have no runtime object. Never use them as object keys or iterate over them.
- **`options` may be partial**: The engine passes `{}` as default options. Always guard: `options.startIndex ?? rng.nextInt(grid.cellCount)`.
- **Solver `parents` array**: Initialize with `fill(-1)`. Set `parents[startIndex] = startIndex` (self-parent) before BFS. `buildPath` checks `parents[goal] === -1` as "no path found".
- **Weave eligibility**: Check `grid.tunnels[cell] === -1` on the perpendicular neighbors before inserting a crossing — a cell might already be a tunnel endpoint.
