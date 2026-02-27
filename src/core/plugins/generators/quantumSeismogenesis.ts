import {
    carvePatch,
    neighbors,
    OverlayFlag,
    type Grid,
} from "@/core/grid";
import type { CellPatch } from "@/core/patches";
import type { GeneratorPlugin } from "@/core/plugins/GeneratorPlugin";
import type {
    AlgorithmStepMeta,
    GeneratorRunOptions,
} from "@/core/plugins/types";
import type { RandomSource } from "@/core/rng";

interface FractureTip {
    index: number;
}

interface QuantumSeismogenesisContext {
    grid: Grid;
    rng: RandomSource;
    stress: Float32Array;
    parent: Int32Array;
    rank: Uint8Array;
    activeFractures: FractureTip[];
    visitedCount: number;
    components: number;
}

export const quantumSeismogenesisGenerator: GeneratorPlugin<
    GeneratorRunOptions,
    AlgorithmStepMeta
> = {
    id: "quantum-seismogenesis",
    label: "Quantum Seismogenesis",
    create({ grid, rng }) {
        const parent = new Int32Array(grid.cellCount);
        for (let i = 0; i < grid.cellCount; i++) {
            parent[i] = i;
        }

        const context: QuantumSeismogenesisContext = {
            grid,
            rng,
            stress: new Float32Array(grid.cellCount),
            parent,
            rank: new Uint8Array(grid.cellCount),
            activeFractures: [],
            visitedCount: 0,
            components: grid.cellCount,
        };

        return {
            step: () => stepQuantumSeismogenesis(context),
        };
    },
};

function stepQuantumSeismogenesis(context: QuantumSeismogenesisContext) {
    const { grid, rng, stress, parent, rank, activeFractures } = context;
    const patches: CellPatch[] = [];

    if (context.components <= 1) {
        return {
            done: true,
            patches,
            meta: {
                line: 1,
                visitedCount: grid.cellCount,
                frontierSize: 0,
            },
        };
    }

    // 1. Process active fractures
    if (activeFractures.length > 0) {
        // Process one tip per step for visual clarity
        const tip = activeFractures.shift()!;
        const currentNeighbors = neighbors(grid, tip.index);

        // Sort neighbors by stress descending
        currentNeighbors.sort((a, b) => stress[b.index]! - stress[a.index]!);

        let carved = false;
        for (const neighbor of currentNeighbors) {
            if (union(tip.index, neighbor.index, parent, rank)) {
                // Successful fracture
                context.components--;
                if (stress[tip.index] === 0) {
                    context.visitedCount++;
                }
                if (stress[neighbor.index] === 0) {
                    context.visitedCount++;
                }

                stress[tip.index] = 0; // Relieve stress
                stress[neighbor.index] = 1.0; // Transfer remaining energy to push fracture forward

                patches.push(...carvePatch(tip.index, neighbor.index, neighbor.direction.wall, neighbor.direction.opposite));

                // Add visual overlays
                patches.push({ index: tip.index, overlaySet: OverlayFlag.Visited, overlayClear: OverlayFlag.Current });
                patches.push({ index: neighbor.index, overlaySet: OverlayFlag.Current });

                activeFractures.unshift({ index: neighbor.index });
                carved = true;
                break;
            }
        }

        if (!carved) {
            // Fracture died out (hit dead end or existing path it can't join)
            stress[tip.index] = 0;
            patches.push({ index: tip.index, overlaySet: OverlayFlag.Visited, overlayClear: OverlayFlag.Current });
        }
    } else {
        // 2. Accumulate stress if no active fractures
        // Select N random cells to add stress to
        const N = Math.max(1, Math.floor(grid.cellCount * 0.01));
        for (let i = 0; i < N; i++) {
            const idx = rng.nextInt(grid.cellCount);
            // Only stress disjoint cells (not fully integrated into the single tree)
            // A simple heuristic: if it has all its walls, it's definitely unintegrated. 
            // More accurately, if it's the root of its own set.

            stress[idx] += 0.2 + rng.next() * 0.3;

            if (stress[idx] >= 1.0) {
                // Ignition
                activeFractures.push({ index: idx });
                patches.push({ index: idx, overlaySet: OverlayFlag.Current });
            }
        }
    }

    return {
        done: context.components <= 1,
        patches,
        meta: {
            line: activeFractures.length > 0 ? 3 : 2,
            visitedCount: grid.cellCount - context.components,
            frontierSize: activeFractures.length,
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
