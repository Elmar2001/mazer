import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// maze.worker.ts registers itself on globalThis when imported.
// We mock postMessage before import so the emit callback doesn't throw.

describe("maze worker bootstrap", () => {
  beforeEach(() => {
    vi.stubGlobal("postMessage", vi.fn());
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("registers onmessage handler on the global scope", async () => {
    // Dynamic import ensures the module runs in this test context
    await import("@/engine/maze.worker");

    expect(typeof (globalThis as Record<string, unknown>).onmessage).toBe("function");
  });

  it("forwards postMessage events to the worker runtime", async () => {
    const postMessage = vi.fn();
    vi.stubGlobal("postMessage", postMessage);

    await import("@/engine/maze.worker");

    const scope = globalThis as unknown as {
      onmessage: (event: { data: unknown }) => void;
    };

    // Sending an init command should trigger postMessage (gridRebuilt event)
    scope.onmessage({
      data: {
        type: "init",
        options: {
          width: 4,
          height: 4,
          speed: 60,
          seed: "worker-bootstrap-test",
          generatorId: "dfs-backtracker",
          solverId: "bfs",
          battleMode: false,
          solverBId: "astar",
        },
      },
    });

    expect(postMessage).toHaveBeenCalled();

    const calls = postMessage.mock.calls.map((c: unknown[]) => c[0] as { type: string });
    const eventTypes = calls.map((e) => e.type);
    expect(eventTypes).toContain("gridRebuilt");
  });
});
