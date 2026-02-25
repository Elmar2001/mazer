export type AlgorithmKind = "Generator" | "Solver";

export interface AlgorithmDoc {
  id: string;
  name: string;
  kind: AlgorithmKind;
  summary: string;
  howItWorks: string[];
  timeComplexity: string;
  spaceComplexity: string;
  pros: string[];
  cons: string[];
  bestFor: string;
  interestingFact: string;
}

export const ALGORITHM_DOCS: AlgorithmDoc[] = [
  {
    id: "dfs-backtracker",
    name: "Recursive Backtracker (DFS)",
    kind: "Generator",
    summary: "Grows a maze by walking deeply until stuck, then backtracks.",
    howItWorks: [
      "Start at one cell, mark it visited, and push it on a stack.",
      "Move to a random unvisited neighbor and carve the wall.",
      "If no unvisited neighbors remain, pop and continue from the previous cell.",
      "Stop when the stack becomes empty.",
    ],
    timeComplexity: "O(V)",
    spaceComplexity: "O(V)",
    pros: ["Fast", "Simple", "Produces long winding corridors"],
    cons: ["Can create low branching", "Less uniform than Wilson/Aldous-Broder"],
    bestFor: "Fast visual generation with dramatic backtracking behavior.",
    interestingFact:
      "This is one of the most common textbook maze generators because it is easy to animate step-by-step.",
  },
  {
    id: "prim",
    name: "Randomized Prim",
    kind: "Generator",
    summary: "Expands a frontier set by attaching random frontier cells.",
    howItWorks: [
      "Start from one cell and mark adjacent cells as frontier.",
      "Pick a random frontier cell.",
      "Connect it to one random visited neighbor.",
      "Mark its unvisited neighbors as new frontier.",
    ],
    timeComplexity: "O(V)",
    spaceComplexity: "O(V)",
    pros: ["Good branching", "Natural wavefront animation"],
    cons: ["Needs frontier bookkeeping", "Can look noisy at high randomness"],
    bestFor: "Balanced mazes with lots of local choices.",
    interestingFact:
      "It is inspired by Prim's minimum spanning tree method, but with randomized edge selection.",
  },
  {
    id: "kruskal",
    name: "Randomized Kruskal",
    kind: "Generator",
    summary: "Carves walls by joining disjoint sets while avoiding cycles.",
    howItWorks: [
      "Treat each cell as its own set.",
      "Shuffle candidate walls (edges) between neighboring cells.",
      "If an edge connects two different sets, carve it and union the sets.",
      "Stop when all cells are in one connected set.",
    ],
    timeComplexity: "O(E α(V))",
    spaceComplexity: "O(V)",
    pros: ["Strong theoretical guarantees", "Uniform spanning-tree style behavior"],
    cons: ["Needs union-find", "Less intuitive than DFS/Prim"],
    bestFor: "When you want explicit disjoint-set control and predictable correctness.",
    interestingFact:
      "Union-find path compression makes practical performance very fast even on large grids.",
  },
  {
    id: "binary-tree",
    name: "Binary Tree",
    kind: "Generator",
    summary: "Each cell carves toward one of two preferred directions.",
    howItWorks: [
      "Visit cells in scan order.",
      "For each cell, carve either north or west when available.",
      "Edge cells carve only when the direction exists.",
      "Continue until all cells are processed.",
    ],
    timeComplexity: "O(V)",
    spaceComplexity: "O(1)",
    pros: ["Extremely fast", "Tiny memory footprint"],
    cons: ["Directional bias", "Predictable patterns"],
    bestFor: "High-speed generation and teaching directional bias effects.",
    interestingFact:
      "Its directional rule creates obvious diagonal flow patterns that are easy to recognize visually.",
  },
  {
    id: "sidewinder",
    name: "Sidewinder",
    kind: "Generator",
    summary: "Builds horizontal runs and occasionally links them upward.",
    howItWorks: [
      "Move across each row while extending a run to the east.",
      "Randomly decide to close the run.",
      "When closing, carve one north connection from a random cell in the run.",
      "Repeat per row.",
    ],
    timeComplexity: "O(V)",
    spaceComplexity: "O(1)",
    pros: ["Very fast", "Distinct corridor aesthetics"],
    cons: ["Visible row bias", "Less organic appearance"],
    bestFor: "Fast generation with intentional horizontal character.",
    interestingFact:
      "It is often paired with Binary Tree to show how tiny local rules create global maze style.",
  },
  {
    id: "aldous-broder",
    name: "Aldous-Broder",
    kind: "Generator",
    summary: "Uses a pure random walk and carves only on first visits.",
    howItWorks: [
      "Start from a random cell.",
      "Walk to a random neighbor each step.",
      "If that neighbor is unvisited, carve the edge and mark it visited.",
      "Stop after all cells are visited.",
    ],
    timeComplexity: "Expected O(V^2)",
    spaceComplexity: "O(V)",
    pros: ["Uniform spanning tree", "Conceptually minimal"],
    cons: ["Can be very slow", "Many non-carving steps"],
    bestFor: "Demonstrating random-walk behavior and uniform spanning tree theory.",
    interestingFact:
      "Despite being simple, it converges slowly because random walks revisit cells many times.",
  },
  {
    id: "hunt-and-kill",
    name: "Hunt-and-Kill",
    kind: "Generator",
    summary: "Alternates random walking with linear hunts for a new branch point.",
    howItWorks: [
      "Walk randomly until reaching a dead end.",
      "Scan for an unvisited cell adjacent to visited territory.",
      "Connect there and resume random walking.",
      "Finish when the scan finds no valid unvisited cell.",
    ],
    timeComplexity: "O(V^2) worst-case",
    spaceComplexity: "O(V)",
    pros: ["Interesting phase changes", "Good organic structure"],
    cons: ["Scanning phase can be expensive", "Slightly more bookkeeping"],
    bestFor: "Visual demos where algorithm phases should feel very different.",
    interestingFact:
      "The switch between hunt and kill phases is very visible and makes this algorithm great for education.",
  },
  {
    id: "growing-tree",
    name: "Growing Tree",
    kind: "Generator",
    summary:
      "Generalized family that blends DFS-like and Prim-like behavior via selection policy.",
    howItWorks: [
      "Keep a list of active cells.",
      "Select one active cell using a strategy (newest, random, or mixed).",
      "Carve to one unvisited neighbor if possible; otherwise remove the active cell.",
      "Continue until no active cells remain.",
    ],
    timeComplexity: "O(V)",
    spaceComplexity: "O(V)",
    pros: ["Highly tunable style", "Good compromise between long corridors and branching"],
    cons: ["Selection policy impacts style heavily", "Less canonical than pure DFS/Prim"],
    bestFor: "When you want one algorithm knob to dial corridor-vs-branch behavior.",
    interestingFact:
      "Using newest-only turns it into recursive backtracker; random-only makes it feel close to Prim.",
  },
  {
    id: "bfs-tree",
    name: "Randomized BFS Tree",
    kind: "Generator",
    summary: "Builds a spanning tree layer-by-layer from a queue frontier.",
    howItWorks: [
      "Choose a start cell and enqueue it.",
      "Pop cells in BFS order and inspect neighbors.",
      "For each unvisited neighbor, carve to it and enqueue it.",
      "Continue until queue is exhausted.",
    ],
    timeComplexity: "O(V + E)",
    spaceComplexity: "O(V)",
    pros: ["Very stable progression", "Naturally broad, wave-like growth"],
    cons: ["Can look less organic than DFS variants", "Needs queue/frontier bookkeeping"],
    bestFor: "Clear breadth-first generation visuals and predictable expansion fronts.",
    interestingFact:
      "Unlike Prim, this variant commits tree parents by discovery order, creating BFS-depth layers.",
  },
  {
    id: "bfs",
    name: "Breadth-First Search (BFS)",
    kind: "Solver",
    summary: "Expands in layers and guarantees shortest path in unweighted mazes.",
    howItWorks: [
      "Push start cell into a queue.",
      "Pop in FIFO order and visit neighbors.",
      "Record each neighbor's parent when first discovered.",
      "When goal is reached, reconstruct path via parents.",
    ],
    timeComplexity: "O(V + E)",
    spaceComplexity: "O(V)",
    pros: ["Optimal path for unit weights", "Simple and robust"],
    cons: ["Can explore many irrelevant nodes", "Large frontier on wide-open maps"],
    bestFor: "Reliable shortest path on unweighted grids.",
    interestingFact:
      "BFS is equivalent to Dijkstra when every edge has identical weight.",
  },
  {
    id: "dfs",
    name: "Depth-First Search (DFS)",
    kind: "Solver",
    summary: "Follows one branch deeply before backing up.",
    howItWorks: [
      "Push start cell onto a stack.",
      "Pop and explore a neighbor branch deeply.",
      "Track discovery parents for reconstruction.",
      "Backtrack naturally when stack unwinds.",
    ],
    timeComplexity: "O(V + E)",
    spaceComplexity: "O(V)",
    pros: ["Very low overhead", "Strong step-by-step visual clarity"],
    cons: ["No shortest-path guarantee", "Can take long detours"],
    bestFor: "Showing exploratory behavior rather than shortest paths.",
    interestingFact:
      "On tree mazes (perfect mazes), DFS still finds the unique path but may explore much more first.",
  },
  {
    id: "astar",
    name: "A* Search",
    kind: "Solver",
    summary: "Combines actual cost and heuristic distance to guide exploration.",
    howItWorks: [
      "Maintain open set prioritized by f(n)=g(n)+h(n).",
      "Expand the cell with lowest estimated total cost.",
      "Relax neighbors if a better g-cost is found.",
      "Stop at goal and reconstruct via parents.",
    ],
    timeComplexity: "O(E) to O(E log V), depending on priority structure",
    spaceComplexity: "O(V)",
    pros: ["Usually much faster than BFS", "Optimal with admissible heuristic"],
    cons: ["Needs heuristic tuning", "Bookkeeping heavier than BFS/DFS"],
    bestFor: "Fast near-optimal routing on grid mazes.",
    interestingFact:
      "Manhattan distance is a natural heuristic for 4-directional grids.",
  },
  {
    id: "astar-euclidean",
    name: "A* (Euclidean)",
    kind: "Solver",
    summary: "A* variant using straight-line distance heuristic.",
    howItWorks: [
      "Score candidates with f(n)=g(n)+h(n), where h is Euclidean distance.",
      "Expand the lowest f-score node.",
      "Relax neighbors with improved g-cost and update parents.",
      "Stop and reconstruct when reaching goal.",
    ],
    timeComplexity: "O(E) to O(E log V), depending on queue",
    spaceComplexity: "O(V)",
    pros: ["Admissible and consistent on grid movement", "Often smooth directional guidance"],
    cons: ["Can expand more than Manhattan A* on 4-neighbor grids", "Still more bookkeeping than BFS"],
    bestFor: "Comparing heuristic behavior and exploring geometric distance cues.",
    interestingFact:
      "Euclidean is tighter for continuous geometry, while Manhattan better matches axis-only moves.",
  },
  {
    id: "weighted-astar",
    name: "Weighted A*",
    kind: "Solver",
    summary: "Biases A* harder toward the heuristic for more aggressive search.",
    howItWorks: [
      "Use f(n)=g(n)+w*h(n) with w>1.",
      "Expand the node with smallest weighted estimate.",
      "Continue relaxing neighbors and updating parents.",
      "Return reconstructed path when goal is dequeued.",
    ],
    timeComplexity: "Often faster than A* in practice",
    spaceComplexity: "O(V)",
    pros: ["Lower exploration count", "Good speed at high grid sizes"],
    cons: ["Can lose optimality", "Quality depends on weight"],
    bestFor: "When responsiveness matters more than guaranteed shortest path.",
    interestingFact:
      "Weighted A* is common in games and robotics where near-optimal is acceptable for speed.",
  },
  {
    id: "dijkstra",
    name: "Dijkstra",
    kind: "Solver",
    summary: "Uniform-cost expansion from the source, optimal for nonnegative weights.",
    howItWorks: [
      "Initialize start with distance 0 and others with infinity.",
      "Expand the currently known minimum-distance node.",
      "Relax each outgoing neighbor distance.",
      "Stop when goal is finalized.",
    ],
    timeComplexity: "O(E) to O(E log V), depending on queue",
    spaceComplexity: "O(V)",
    pros: ["Optimal", "Generalizes to weighted edges"],
    cons: ["More work than BFS on unit weights", "No heuristic acceleration"],
    bestFor: "Reference optimal solver and weighted-path baselines.",
    interestingFact:
      "Dijkstra published his algorithm in 1956 and reportedly designed it in about twenty minutes.",
  },
  {
    id: "greedy-best-first",
    name: "Greedy Best-First",
    kind: "Solver",
    summary: "Chooses nodes closest to goal by heuristic only.",
    howItWorks: [
      "Keep frontier ordered by heuristic h(n).",
      "Expand the most goal-looking node.",
      "Add newly discovered neighbors.",
      "Reconstruct once goal is found.",
    ],
    timeComplexity: "Highly input-dependent",
    spaceComplexity: "O(V)",
    pros: ["Very fast in easy layouts", "Small control overhead"],
    cons: ["Not optimal", "Can be misled by local geometry"],
    bestFor: "Quick approximate solving and heuristic demonstrations.",
    interestingFact:
      "Greedy best-first can outperform optimal methods on easy maps but degrade sharply on deceptive ones.",
  },
  {
    id: "bidirectional-bfs",
    name: "Bidirectional BFS",
    kind: "Solver",
    summary: "Runs two BFS waves from start and goal until they meet.",
    howItWorks: [
      "Initialize one queue at start and another at goal.",
      "Alternate expanding the smaller frontier.",
      "Detect when a node is seen by both searches.",
      "Stitch both parent chains into one path.",
    ],
    timeComplexity: "Often far less than single-source BFS",
    spaceComplexity: "O(V)",
    pros: ["Big practical speedups on long corridors", "Still optimal on unweighted graphs"],
    cons: ["More bookkeeping", "Path merge logic is trickier"],
    bestFor: "Large mazes with distant start/goal pairs.",
    interestingFact:
      "Meeting in the middle can reduce explored states exponentially in branching factor terms.",
  },
  {
    id: "dead-end-filling",
    name: "Dead-End Filling",
    kind: "Solver",
    summary: "Prunes leaves iteratively until only solution corridor remains.",
    howItWorks: [
      "Compute each cell degree in the maze graph.",
      "Queue non-start/non-goal dead ends (degree <= 1).",
      "Remove dead ends and update neighbor degrees.",
      "Remaining cells form the final path corridor.",
    ],
    timeComplexity: "O(V + E)",
    spaceComplexity: "O(V)",
    pros: ["Very different visual style", "No heuristic needed"],
    cons: ["Less intuitive to users expecting search waves", "Best suited to perfect mazes"],
    bestFor: "Teaching maze topology and pruning-based solving.",
    interestingFact:
      "This method solves by elimination, not by explicitly chasing the goal first.",
  },
  {
    id: "wall-follower",
    name: "Wall Follower (Right-Hand)",
    kind: "Solver",
    summary: "Follows one wall consistently to eventually find the goal in simply connected mazes.",
    howItWorks: [
      "Keep a heading and prefer right turn, then straight, then left, then back.",
      "Move through open passages while maintaining wall contact.",
      "Record discovery parents for path reconstruction.",
      "When goal is reached, reconstruct and display the route.",
    ],
    timeComplexity: "Input-dependent, typically O(E) in tree mazes",
    spaceComplexity: "O(V) with parent tracking",
    pros: ["Very intuitive", "Great for demonstrating local decision rules"],
    cons: ["Not generally optimal", "Can fail in non-simply-connected wall topologies"],
    bestFor: "Educational demos of local navigation strategies.",
    interestingFact:
      "In perfect mazes (tree mazes), wall following always reaches the goal because there are no isolated loops.",
  },
];

export const GENERATOR_DOCS = ALGORITHM_DOCS.filter(
  (algorithm) => algorithm.kind === "Generator",
);

export const SOLVER_DOCS = ALGORITHM_DOCS.filter(
  (algorithm) => algorithm.kind === "Solver",
);
