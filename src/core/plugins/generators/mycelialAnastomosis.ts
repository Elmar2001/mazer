import {
    carvePatch,
    neighbors,
    OverlayFlag,
    type Grid,
} from "@/core/grid";
import type { CellPatch } from "@/core/patches";
import type { GeneratorPlugin } from "@/core/plugins/GeneratorPlugin";
import type { RandomSource } from "@/core/rng";
import type {
    AlgorithmStepMeta,
    GeneratorRunOptions,
} from "@/core/plugins/types";

interface HyphaTip {
    index: number;
}

interface MycelialAnastomosisContext {
    grid: Grid;
    parent: Int32Array;
    rank: Uint8Array;
    visited: Uint8Array;
    activeHyphae: HyphaTip[];
    visitedCount: number;
    components: number;
}

export const mycelialAnastomosisGenerator: GeneratorPlugin<
    GeneratorRunOptions,
    AlgorithmStepMeta
> = {
    id: "mycelial-anastomosis",
    label: "Mycelial Anastomosis (Multi-Source Kruskal's & Random Walk)",
    create({ grid, rng }) {
        const parent = new Int32Array(grid.cellCount);
        for (let i = 0; i < grid.cellCount; i++) {
            parent[i] = i;
        }

        // Seed multiple spores based on grid size
        const numSpores = Math.min(
            Math.max(2, Math.floor(grid.width * grid.height * 0.005)),
            grid.cellCount
        );
        const activeHyphae: HyphaTip[] = [];
        const visited = new Uint8Array(grid.cellCount);
        let visitedCount = 0;

        for (let i = 0; i < numSpores; i++) {
            // Find an unvisited spot
            let idx = rng.nextInt(grid.cellCount);
            while (visited[idx] === 1) {
                idx = rng.nextInt(grid.cellCount);
            }

            visited[idx] = 1;
            visitedCount++;
            activeHyphae.push({ index: idx });
        }

        const context: MycelialAnastomosisContext = {
            grid,
            parent,
            rank: new Uint8Array(grid.cellCount),
            visited,
            activeHyphae,
            visitedCount,
            components: grid.cellCount,
        };

        return {
            step: () => stepMycelialAnastomosis(context, rng),
        };
    },
};

function stepMycelialAnastomosis(
    context: MycelialAnastomosisContext,
    rng: RandomSource,
) {
    const { grid, parent, rank, visited, activeHyphae } = context;
    const patches: CellPatch[] = [];

    if (context.components <= 1) {
        // If the maze is technically spanning, clear frontier overlays
        if (activeHyphae.length > 0) {
            for (const tip of activeHyphae) {
                patches.push({ index: tip.index, overlayClear: OverlayFlag.Frontier });
            }
            activeHyphae.length = 0;
        }

        return {
            done: true,
            patches,
            meta: {
                line: 1,
                visitedCount: context.visitedCount,
                frontierSize: 0,
            },
        };
    }

    if (activeHyphae.length === 0) {
        // Failsafe: if we run out of hyphae before finishing the tree
        // (e.g. they got trapped), spawn a new one in an unvisited cell
        for (let i = 0; i < grid.cellCount; i++) {
            if (visited[i] === 0) {
                visited[i] = 1;
                context.visitedCount++;
                activeHyphae.push({ index: i });
                patches.push({ index: i, overlaySet: OverlayFlag.Frontier });
                break;
            }
        }
    }

    // To simulate concurrent growth, we pick a random active tip
    const tipIdx = rng.nextInt(activeHyphae.length);
    const tip = activeHyphae[tipIdx]!;

    const validNeighbors = neighbors(grid, tip.index);

    // Shuffle to pick random directions
    for (let i = validNeighbors.length - 1; i > 0; i--) {
        const j = rng.nextInt(i + 1);
        const tmp = validNeighbors[i];
        validNeighbors[i] = validNeighbors[j]!;
        validNeighbors[j] = tmp!;
    }

    let grown = false;

    for (const n of validNeighbors) {
        if (visited[n.index] === 0) {
            // Empty space: grow into it
            if (union(tip.index, n.index, parent, rank)) {
                context.components--;
                context.visitedCount++;
                visited[n.index] = 1;

                patches.push(...carvePatch(tip.index, n.index, n.direction.wall, n.direction.opposite));

                patches.push({ index: tip.index, overlaySet: OverlayFlag.Visited, overlayClear: OverlayFlag.Frontier });
                patches.push({ index: n.index, overlaySet: OverlayFlag.Frontier });

                // Branching: maybe keep the old tip alive sometimes
                if (rng.nextInt(100) < 15) {
                    activeHyphae.push({ index: n.index });
                    patches.push({ index: tip.index, overlaySet: OverlayFlag.Frontier }); // restore frontier overlay
                } else {
                    activeHyphae[tipIdx] = { index: n.index };
                }
                grown = true;
                break;
            }
        } else {
            // Hit an existing wall/path. Can we anastomose (merge)?
            if (union(tip.index, n.index, parent, rank)) {
                // They belonged to different networks! Merge them!
                context.components--;

                patches.push(...carvePatch(tip.index, n.index, n.direction.wall, n.direction.opposite));
                patches.push({ index: tip.index, overlaySet: OverlayFlag.Visited, overlayClear: OverlayFlag.Frontier });

                // This tip terminates since it merged into an existing body
                activeHyphae.splice(tipIdx, 1);
                grown = true;
                break;
            }
        }
    }

    if (!grown) {
        // Tip is dead-ended
        patches.push({ index: tip.index, overlaySet: OverlayFlag.Visited, overlayClear: OverlayFlag.Frontier });
        activeHyphae.splice(tipIdx, 1);
    }

    // To make it visually stunning, we can occasionally jump and do 2-3 growths
    return {
        done: false,
        patches,
        meta: {
            line: 2 + (grown ? 1 : 0),
            visitedCount: context.visitedCount,
            frontierSize: activeHyphae.length,
        },
    };
}

function find(index: number, parent: Int32Array): number {
    let root = index;
    while (parent[root] !== root) {
        root = parent[root];
    }

    let node = index;
    while (parent[node] !== node) {
        const next = parent[node];
        parent[node] = root;
        node = next;
    }

    return root;
}

function union(
    a: number,
    b: number,
    parent: Int32Array,
    rank: Uint8Array,
): boolean {
    const rootA = find(a, parent);
    const rootB = find(b, parent);

    if (rootA === rootB) {
        return false;
    }

    if (rank[rootA] < rank[rootB]) {
        parent[rootA] = rootB;
    } else if (rank[rootA] > rank[rootB]) {
        parent[rootB] = rootA;
    } else {
        parent[rootB] = rootA;
        rank[rootA] += 1;
    }

    return true;
}
