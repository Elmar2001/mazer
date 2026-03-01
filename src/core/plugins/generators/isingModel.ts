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

interface IsingModelContext {
    grid: Grid;
    spins: Int8Array;
    temperature: number;
    coolingRate: number;
    phase: "annealing" | "finalize" | "done";
    iterations: number;
    maxIterations: number;
    parent: Int32Array;
    rank: Uint8Array;
    edges: { a: number; b: number; weight: number; dir: number; opp: number }[];
    edgeCursor: number;
}

export const isingModelGenerator: GeneratorPlugin<
    GeneratorRunOptions,
    AlgorithmStepMeta
> = {
    id: "ising-model",
    label: "Magnetic Spin Crystallization",
    create({ grid, rng }) {
        const context: IsingModelContext = {
            grid,
            spins: new Int8Array(grid.cellCount),
            temperature: 5.0, // High starting temp
            coolingRate: 0.99,
            phase: "annealing",
            iterations: 0,
            maxIterations: Math.floor(grid.cellCount * 2), // Annealing steps proportional to size
            parent: new Int32Array(grid.cellCount),
            rank: new Uint8Array(grid.cellCount),
            edges: [],
            edgeCursor: 0,
        };

        // Hot random start
        for (let i = 0; i < grid.cellCount; i++) {
            context.spins[i] = rng.next() > 0.5 ? 1 : -1;
            context.parent[i] = i;
        }

        return {
            step: () => stepIsingModel(context, rng),
        };
    },
};

function calculateEnergy(grid: Grid, spins: Int8Array, index: number, spinValue: number): number {
    const nbrs = neighbors(grid, index);
    let sameSpins = 0;
    for (const n of nbrs) {
        if (spins[n.index] === spinValue) {
            sameSpins++;
        }
    }
    // We want strings to form, so having exactly 2 neighbors of the same spin is lowest energy
    // E = (sameSpins - 2)^2
    return (sameSpins - 2) * (sameSpins - 2);
}

function stepIsingModel(context: IsingModelContext, rng: RandomSource) {
    const { grid, spins } = context;
    const patches: CellPatch[] = [];

    if (context.phase === "annealing") {
        // Do many spin flip attempts per frame for visual speed
        const attemptsPerFrame = Math.max(10, Math.floor(grid.cellCount * 0.05));

        for (let step = 0; step < attemptsPerFrame; step++) {
            const idx = rng.nextInt(grid.cellCount);
            const currentSpin = spins[idx];
            const newSpin = -currentSpin;

            // Local energy before and after
            let currentE = calculateEnergy(grid, spins, idx, currentSpin);
            let newE = calculateEnergy(grid, spins, idx, newSpin);

            // We also must consider how this flip affects neighbors' energy to be a true Hamiltonian
            const nbrs = neighbors(grid, idx);
            for (const n of nbrs) {
                const nSpin = spins[n.index];

                // Energy of neighbor with our CURRENT spin
                spins[idx] = currentSpin; // Ensure it's original
                currentE += calculateEnergy(grid, spins, n.index, nSpin);

                // Energy of neighbor with our NEW spin
                spins[idx] = newSpin;
                newE += calculateEnergy(grid, spins, n.index, nSpin);
            }

            // Revert spin back so we only apply it if accepted
            spins[idx] = currentSpin;

            const deltaE = newE - currentE;

            let accept = false;
            if (deltaE <= 0) {
                accept = true;
            } else {
                const prob = Math.exp(-deltaE / context.temperature);
                if (rng.next() < prob) {
                    accept = true;
                }
            }

            if (accept) {
                spins[idx] = newSpin as 1 | -1;

                // Visualize spins. +1 = Current, -1 = Visited.
                if (newSpin === 1) {
                    patches.push({ index: idx, overlaySet: OverlayFlag.Current, overlayClear: OverlayFlag.Visited });
                } else {
                    patches.push({ index: idx, overlaySet: OverlayFlag.Visited, overlayClear: OverlayFlag.Current });
                }
            }
        }

        context.temperature *= context.coolingRate;
        context.iterations++;

        if (context.iterations >= context.maxIterations) {
            context.phase = "finalize";

            // Cool down complete, prepare Kruskal's to carve the final maze
            // Weight edges: connecting two +1 spins is very cheap, connecting +1 and -1 is expensive, -1 and -1 is medium.

            // Clear overlays
            for (let i = 0; i < grid.cellCount; i++) {
                patches.push({ index: i, overlayClear: OverlayFlag.Visited | OverlayFlag.Current });
            }

            for (let i = 0; i < grid.cellCount; i++) {
                for (const n of neighbors(grid, i)) {
                    if (n.index > i) {
                        let weight = rng.next() * 0.1; // Baseline noise
                        if (spins[i] === 1 && spins[n.index] === 1) {
                            weight += 0.0; // Best path
                        } else if (spins[i] === -1 && spins[n.index] === -1) {
                            weight += 1.0; // Suboptimal
                        } else {
                            weight += 2.0; // Avoid border crossing to keep shapes distinct
                        }

                        context.edges.push({
                            a: i,
                            b: n.index,
                            weight: weight,
                            dir: n.direction.wall,
                            opp: n.direction.opposite
                        });
                    }
                }
            }

            // Sort edges by weight
            context.edges.sort((e1, e2) => e1.weight - e2.weight);
        }

        return {
            done: false,
            patches,
            meta: {
                line: 1,
                visitedCount: context.iterations,
                frontierSize: Math.floor(context.temperature * 10), // Abuse frontier size to pass temperature visibly
            },
        };

    } else if (context.phase === "finalize") {
        // Kruskal's algorithm constrained by the Ising spin weights
        let carvedThisStep = 0;

        while (context.edgeCursor < context.edges.length && carvedThisStep < 20) {
            const edge = context.edges[context.edgeCursor++];

            if (union(edge.a, edge.b, context.parent, context.rank)) {
                patches.push(...carvePatch(edge.a, edge.b, edge.dir, edge.opp));
                patches.push({ index: edge.a, overlaySet: OverlayFlag.Visited });
                patches.push({ index: edge.b, overlaySet: OverlayFlag.Visited });
                carvedThisStep++;
            }
        }

        const done = context.edgeCursor >= context.edges.length;

        if (done) {
            // Clean up
            for (let i = 0; i < grid.cellCount; i++) {
                patches.push({ index: i, overlayClear: OverlayFlag.Visited | OverlayFlag.Current });
            }
        }

        return {
            done,
            patches,
            meta: {
                line: 2,
                visitedCount: grid.cellCount,
                frontierSize: context.edges.length - context.edgeCursor,
            },
        };
    }

    return { done: true, patches, meta: { line: 3, visitedCount: grid.cellCount, frontierSize: 0 } };
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
