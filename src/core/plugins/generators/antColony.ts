import {
    carvePatch,
    neighbors,
    OverlayFlag,
    type Grid,
} from "@/core/grid";
import type { CellPatch } from "@/core/patches";
import type { RandomSource } from "@/core/rng";
import type { GeneratorPlugin } from "@/core/plugins/GeneratorPlugin";
import type {
    AlgorithmStepMeta,
    GeneratorRunOptions,
} from "@/core/plugins/types";

interface Ant {
    index: number;
    hasPheromone: boolean;
    age: number;
}

interface AntColonyContext {
    grid: Grid;
    ants: Ant[];
    pheromones: Float32Array;
    parent: Int32Array;
    rank: Uint8Array;
    visitedCount: number;
    components: number;
    evaporationRate: number;
    depositAmount: number;
    maxAntAge: number;
}

export const antColonyGenerator: GeneratorPlugin<
    GeneratorRunOptions,
    AlgorithmStepMeta
> = {
    id: "ant-colony",
    label: "Ant Colony Excavation",
    create({ grid, rng }) {
        const context: AntColonyContext = {
            grid,
            ants: [],
            pheromones: new Float32Array(grid.cellCount),
            parent: new Int32Array(grid.cellCount),
            rank: new Uint8Array(grid.cellCount),
            visitedCount: 0,
            components: grid.cellCount,
            evaporationRate: 0.99, // Multiply pheromones by this each step
            depositAmount: 1.0,
            maxAntAge: Math.floor(grid.cellCount / 2),
        };

        for (let i = 0; i < grid.cellCount; i++) {
            context.parent[i] = i;
        }

        // Spawn initial ants (e.g., 5% of grid size)
        const numAnts = Math.max(1, Math.floor(grid.cellCount * 0.05));
        for (let i = 0; i < numAnts; i++) {
            context.ants.push({
                index: rng.nextInt(grid.cellCount),
                hasPheromone: true,
                age: 0,
            });
        }

        return {
            step: () => stepAntColony(context, rng),
        };
    },
};

function stepAntColony(context: AntColonyContext, rng: RandomSource) {
    const { grid, ants, pheromones, parent, rank } = context;
    const patches: CellPatch[] = [];

    if (context.components <= 1) {
        // Clear ant overlays
        for (const ant of ants) {
            patches.push({ index: ant.index, overlayClear: OverlayFlag.Current | OverlayFlag.Visited });
        }
        return {
            done: true,
            patches,
            meta: { line: 1, visitedCount: context.visitedCount, frontierSize: 0 },
        };
    }

    // Process ants
    for (let i = ants.length - 1; i >= 0; i--) {
        const ant = ants[i];
        ant.age++;

        // Ant dies of old age and respawns at a random unvisited location to keep components connecting
        if (ant.age > context.maxAntAge) {
            patches.push({ index: ant.index, overlayClear: OverlayFlag.Current });

            // Find mostly disconnected area
            const respawnIndex = rng.nextInt(grid.cellCount);
            ant.index = respawnIndex;
            ant.age = 0;
            patches.push({ index: ant.index, overlaySet: OverlayFlag.Current });
            continue;
        }

        const availableNeighbors = neighbors(grid, ant.index);
        if (availableNeighbors.length === 0) continue;

        // Ants prefer moving towards higher pheromones, but also explore
        // Pick next move via weighted randomness based on pheromones
        let totalWeight = 0;
        const weights = availableNeighbors.map(n => {
            // Base weight + pheromone weight.
            // Reduce weight if already in same component to encourage spanning tree.
            const inSameComp = find(ant.index, parent) === find(n.index, parent);
            let w = 1.0 + pheromones[n.index] * 10;
            if (inSameComp) w *= 0.1; // heavily discourage loops
            totalWeight += w;
            return w;
        });

        let r = rng.next() * totalWeight;
        let selectedNeighbor = availableNeighbors[0];
        for (let j = 0; j < weights.length; j++) {
            r -= weights[j];
            if (r <= 0) {
                selectedNeighbor = availableNeighbors[j];
                break;
            }
        }

        patches.push({ index: ant.index, overlayClear: OverlayFlag.Current });

        // Carve logic
        if (union(ant.index, selectedNeighbor.index, parent, rank)) {
            context.components--;
            context.visitedCount++;
            patches.push(...carvePatch(ant.index, selectedNeighbor.index, selectedNeighbor.direction.wall, selectedNeighbor.direction.opposite));
            patches.push({ index: ant.index, overlaySet: OverlayFlag.Visited });
            patches.push({ index: selectedNeighbor.index, overlaySet: OverlayFlag.Visited });
        }

        // Move ant
        ant.index = selectedNeighbor.index;
        pheromones[ant.index] += context.depositAmount;

        patches.push({ index: ant.index, overlaySet: OverlayFlag.Current });
    }

    // Evaporate pheromones
    for (let i = 0; i < grid.cellCount; i++) {
        pheromones[i] *= context.evaporationRate;
    }

    return {
        done: context.components <= 1,
        patches,
        meta: {
            line: 2,
            visitedCount: Math.min(grid.cellCount, context.visitedCount),
            frontierSize: ants.length,
        }
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
