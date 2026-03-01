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

interface ReactionDiffusionContext {
    grid: Grid;
    A: Float32Array;
    B: Float32Array;
    nextA: Float32Array;
    nextB: Float32Array;
    iterations: number;
    maxIterations: number;
    phase: "reaction" | "threshold" | "connect" | "done";
    AThreshold: number;
    parent: Int32Array;
    rank: Uint8Array;
    unconnectedEdges: { cellIndex: number; neighborIndex: number; dir: number; opposite: number }[];
    currentEdgeIndex: number;
    components: number;
}

export const reactionDiffusionGenerator: GeneratorPlugin<
    GeneratorRunOptions,
    AlgorithmStepMeta
> = {
    id: "reaction-diffusion",
    label: "Reaction-Diffusion (Turing)",
    create({ grid, rng }) {
        const context: ReactionDiffusionContext = {
            grid,
            A: new Float32Array(grid.cellCount),
            B: new Float32Array(grid.cellCount),
            nextA: new Float32Array(grid.cellCount),
            nextB: new Float32Array(grid.cellCount),
            iterations: 0,
            maxIterations: 800, // Enough to stabilize patterns
            phase: "reaction",
            AThreshold: 0.5,
            parent: new Int32Array(grid.cellCount),
            rank: new Uint8Array(grid.cellCount),
            unconnectedEdges: [],
            currentEdgeIndex: 0,
            components: grid.cellCount,
        };

        // Initialize state
        for (let i = 0; i < grid.cellCount; i++) {
            context.A[i] = 1.0;
            context.B[i] = 0.0;
            context.parent[i] = i;
        }

        // Seed the center with chemical B
        const centerX = Math.floor(grid.width / 2);
        const centerY = Math.floor(grid.height / 2);
        const seedRadius = Math.max(2, Math.floor(Math.min(grid.width, grid.height) * 0.1));

        for (let y = centerY - seedRadius; y <= centerY + seedRadius; y++) {
            for (let x = centerX - seedRadius; x <= centerX + seedRadius; x++) {
                if (x >= 0 && x < grid.width && y >= 0 && y < grid.height) {
                    // Add some noise to the seed to break symmetry
                    if (rng.next() > 0.2) {
                        const idx = y * grid.width + x;
                        context.B[idx] = 1.0;
                    }
                }
            }
        }

        // Add some random noise points
        for (let i = 0; i < grid.cellCount * 0.05; i++) {
            const idx = rng.nextInt(grid.cellCount);
            context.B[idx] = 1.0;
        }

        return {
            step: () => stepReactionDiffusion(context, rng),
        };
    },
};

const Da = 1.0;
const Db = 0.5;
const f = 0.029;
const k = 0.057;

function stepReactionDiffusion(context: ReactionDiffusionContext, rng: any) {
    const { grid, A, B, nextA, nextB } = context;
    const patches: CellPatch[] = [];

    if (context.phase === "reaction") {
        // Run multiple iterations per visual frame to speed it up
        const iterationsPerFrame = 20;

        for (let step = 0; step < iterationsPerFrame; step++) {
            for (let i = 0; i < grid.cellCount; i++) {
                let a = A[i];
                let b = B[i];

                const currentNeighbors = neighbors(grid, i);
                let lapA = -4 * a;
                let lapB = -4 * b;

                for (const n of currentNeighbors) {
                    lapA += A[n.index];
                    lapB += B[n.index];
                }

                nextA[i] = a + (Da * lapA - a * b * b + f * (1 - a));
                nextB[i] = b + (Db * lapB + a * b * b - (k + f) * b);

                // Constrain values
                if (nextA[i] < 0) nextA[i] = 0;
                if (nextA[i] > 1) nextA[i] = 1;
                if (nextB[i] < 0) nextB[i] = 0;
                if (nextB[i] > 1) nextB[i] = 1;
            }

            // Swap buffers
            context.A = nextA;
            context.B = nextB;
            context.nextA = A;
            context.nextB = B;
        }

        context.iterations += iterationsPerFrame;

        // Visualize concentration
        for (let i = 0; i < grid.cellCount; i++) {
            if (context.A[i] > 0.5) {
                patches.push({ index: i, overlaySet: OverlayFlag.Current, overlayClear: OverlayFlag.Visited });
            } else {
                patches.push({ index: i, overlaySet: OverlayFlag.Visited, overlayClear: OverlayFlag.Current });
            }
        }

        if (context.iterations >= context.maxIterations) {
            context.phase = "threshold";
            // Clear visual overlays
            for (let i = 0; i < grid.cellCount; i++) {
                patches.push({ index: i, overlayClear: OverlayFlag.Current | OverlayFlag.Visited });
            }
        }

        return {
            done: false,
            patches,
            meta: {
                line: 1,
                visitedCount: context.iterations,
                frontierSize: 0,
            },
        };

    } else if (context.phase === "threshold") {
        // Threshold the continuous data into binary passages
        // Every cell with A > threshold is a passage, else a wall
        // To create passages, we carve between adjacent cells if both are "passage"

        const thresholded = new Uint8Array(grid.cellCount);
        for (let i = 0; i < grid.cellCount; i++) {
            thresholded[i] = context.A[i] > context.AThreshold ? 1 : 0;
        }

        for (let i = 0; i < grid.cellCount; i++) {
            if (thresholded[i] === 0) continue; // It's a wall block

            const currentNeighbors = neighbors(grid, i);
            for (const n of currentNeighbors) {
                // Only carve forward to avoid duplicate carving
                if (n.index > i && thresholded[n.index] === 1) {
                    patches.push(...carvePatch(i, n.index, n.direction.wall, n.direction.opposite));
                    union(i, n.index, context.parent, context.rank);
                    context.components--;
                } else if (thresholded[n.index] === 0) {
                    // Remember edges between passage and wall blocks for fixing unreachability
                    // Actually, just edges between disjoint sets
                    context.unconnectedEdges.push({
                        cellIndex: i,
                        neighborIndex: n.index,
                        dir: n.direction.wall,
                        opposite: n.direction.opposite
                    });
                }
            }

            patches.push({ index: i, overlaySet: OverlayFlag.Visited });
        }

        // Shuffle unconnected edges so we combine components randomly
        const arr = context.unconnectedEdges;
        for (let i = arr.length - 1; i > 0; i--) {
            const j = rng.nextInt(i + 1);
            const temp = arr[i]!;
            arr[i] = arr[j]!;
            arr[j] = temp;
        }

        context.phase = "connect";
        return {
            done: false,
            patches,
            meta: {
                line: 2,
                visitedCount: grid.cellCount,
                frontierSize: context.unconnectedEdges.length,
            }
        };

    } else if (context.phase === "connect") {
        // Connect disjoint components until components = 1
        let carvedCount = 0;

        while (context.currentEdgeIndex < context.unconnectedEdges.length && carvedCount < 50) {
            const edge = context.unconnectedEdges[context.currentEdgeIndex++];

            if (union(edge.cellIndex, edge.neighborIndex, context.parent, context.rank)) {
                context.components--;
                patches.push(...carvePatch(edge.cellIndex, edge.neighborIndex, edge.dir, edge.opposite));
                patches.push({ index: edge.neighborIndex, overlaySet: OverlayFlag.Visited });
                carvedCount++;
            }
        }

        if (context.components <= 1 || context.currentEdgeIndex >= context.unconnectedEdges.length) {
            context.phase = "done";

            // Clear all overlays for clean finish
            for (let i = 0; i < grid.cellCount; i++) {
                patches.push({ index: i, overlayClear: OverlayFlag.Visited | OverlayFlag.Current });
            }
        }

        return {
            done: context.phase === "done",
            patches,
            meta: {
                line: 3,
                visitedCount: grid.cellCount,
                frontierSize: Math.max(0, context.components - 1),
            }
        };

    }

    return { done: true, patches, meta: { line: 4, visitedCount: grid.cellCount, frontierSize: 0 } };
}

// Disjoint Set Union functions
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
    if (rootA === rootB) return false;

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
