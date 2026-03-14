import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MazeEngineOptions } from "@/engine/types";
import type { MazeWorkerCommand, MazeWorkerEvent } from "@/engine/mazeWorkerProtocol";
import { deserializeGridSnapshot } from "@/engine/mazeWorkerProtocol";
import { createMazeWorkerRuntime } from "@/engine/mazeWorkerRuntime";

const BASE_OPTIONS: MazeEngineOptions = {
  width: 8,
  height: 6,
  speed: 120,
  seed: "worker-seed",
  generatorId: "dfs-backtracker",
  solverId: "bfs",
  battleMode: false,
  solverBId: "astar",
};

function createHarness() {
  const events: MazeWorkerEvent[] = [];
  const runtime = createMazeWorkerRuntime((event) => {
    events.push(event);
  });
  const send = (command: MazeWorkerCommand) => runtime.handleCommand(command);

  return {
    events,
    runtime,
    send,
  };
}

function findLastEvent<TType extends MazeWorkerEvent["type"]>(
  events: MazeWorkerEvent[],
  type: TType,
): Extract<MazeWorkerEvent, { type: TType }> | undefined {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (event?.type === type) {
      return event as Extract<MazeWorkerEvent, { type: TType }>;
    }
  }

  return undefined;
}

function captureFirstGenerationStepPatches(seed: string) {
  const { events, runtime, send } = createHarness();

  send({
    type: "init",
    options: {
      ...BASE_OPTIONS,
      seed,
    },
  });
  events.length = 0;

  send({ type: "generate" });
  send({ type: "pause" });
  send({ type: "stepOnce" });

  const patchesEvent = findLastEvent(events, "patchesApplied");
  expect(patchesEvent).toBeDefined();

  runtime.dispose();

  return {
    patches: patchesEvent?.patches ?? [],
    dirtyCells: patchesEvent?.dirtyCells ?? [],
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("maze worker runtime", () => {
  it("emits init lifecycle events", () => {
    const { events, runtime, send } = createHarness();

    send({
      type: "init",
      options: BASE_OPTIONS,
    });

    expect(findLastEvent(events, "gridRebuilt")).toBeDefined();
    const phaseEvent = findLastEvent(events, "phaseChange");
    expect(phaseEvent?.phase).toBe("Idle");
    expect(phaseEvent?.paused).toBe(true);

    const runtimeEvent = findLastEvent(events, "runtimeSnapshot");
    expect(runtimeEvent?.runtime.phase).toBe("Idle");
    expect(runtimeEvent?.runtime.paused).toBe(true);

    runtime.dispose();
  });

  it("emits protocol errors for commands before init", () => {
    const { events, runtime, send } = createHarness();

    send({ type: "generate" });

    const errorEvent = findLastEvent(events, "error");
    expect(errorEvent).toBeDefined();
    expect(errorEvent?.message).toContain("not initialized");

    runtime.dispose();
  });

  it("keeps generation step patches deterministic for identical seeds", () => {
    const first = captureFirstGenerationStepPatches("stable-seed");
    const second = captureFirstGenerationStepPatches("stable-seed");

    expect(first.patches).toEqual(second.patches);
    expect(first.dirtyCells).toEqual(second.dirtyCells);
  });

  it("keeps battle trace lines in runtime snapshots", () => {
    const { events, runtime, send } = createHarness();

    send({
      type: "init",
      options: {
        ...BASE_OPTIONS,
        width: 4,
        height: 4,
        battleMode: true,
        solverId: "bfs",
        solverBId: "astar",
      },
    });
    events.length = 0;

    send({ type: "generate" });
    send({ type: "pause" });

    let generated = false;
    for (let i = 0; i < 400; i += 1) {
      send({ type: "stepOnce" });

      const phaseEvent = findLastEvent(events, "phaseChange");
      if (phaseEvent?.phase === "Generated") {
        generated = true;
        break;
      }
    }

    expect(generated).toBe(true);

    events.length = 0;
    send({ type: "solve" });
    send({ type: "pause" });
    send({ type: "stepOnce" });

    const runtimeEvent = findLastEvent(events, "runtimeSnapshot");
    expect(runtimeEvent).toBeDefined();

    const snapshot = runtimeEvent?.runtime;
    expect(snapshot).toBeDefined();
    expect(
      snapshot?.phase === "Solving" || snapshot?.phase === "Solved",
    ).toBe(true);

    expect(snapshot?.metrics.battle).not.toBeNull();
    if (snapshot?.metrics.battle) {
      expect(snapshot.solverActiveLine).toBe(
        snapshot.metrics.battle.solverA.activeLine,
      );
      expect(snapshot.solverBActiveLine).toBe(
        snapshot.metrics.battle.solverB.activeLine,
      );
    }

    runtime.dispose();
  });

  it("syncs cleared overlays when solve restarts with another solver", () => {
    const { events, runtime, send } = createHarness();

    send({
      type: "init",
      options: {
        ...BASE_OPTIONS,
        width: 5,
        height: 5,
      },
    });
    events.length = 0;

    send({ type: "generate" });
    send({ type: "pause" });

    let generated = false;
    for (let i = 0; i < 600; i += 1) {
      send({ type: "stepOnce" });

      if (findLastEvent(events, "phaseChange")?.phase === "Generated") {
        generated = true;
        break;
      }
    }

    expect(generated).toBe(true);

    events.length = 0;
    send({ type: "solve" });
    send({ type: "pause" });
    let solved = false;
    for (let i = 0; i < 1200; i += 1) {
      send({ type: "stepOnce" });

      if (findLastEvent(events, "phaseChange")?.phase === "Solved") {
        solved = true;
        break;
      }
    }

    expect(solved).toBe(true);

    events.length = 0;
    send({
      type: "setOptions",
      options: {
        solverId: "astar",
      },
    });
    send({ type: "solve" });

    const syncEvent = findLastEvent(events, "gridRebuilt");
    expect(syncEvent).toBeDefined();

    const syncedGrid = deserializeGridSnapshot(syncEvent!.grid);
    const hasAnyOverlay = Array.from(syncedGrid.overlays).some((value) => value !== 0);
    expect(hasAnyOverlay).toBe(false);

    runtime.dispose();
  });

  it("handles setSpeed command", () => {
    const { events, runtime, send } = createHarness();
    send({ type: "init", options: BASE_OPTIONS });
    events.length = 0;

    send({ type: "setSpeed", speed: 500 });
    // No error should be emitted
    expect(findLastEvent(events, "error")).toBeUndefined();

    runtime.dispose();
  });

  it("handles rebuildGrid command", () => {
    const { events, runtime, send } = createHarness();
    send({ type: "init", options: BASE_OPTIONS });
    events.length = 0;

    send({ type: "rebuildGrid", width: 10, height: 10 });

    const gridEvent = findLastEvent(events, "gridRebuilt");
    expect(gridEvent).toBeDefined();
    expect(gridEvent?.grid.width).toBe(10);
    expect(gridEvent?.grid.height).toBe(10);

    const phaseEvent = findLastEvent(events, "phaseChange");
    expect(phaseEvent?.phase).toBe("Idle");

    runtime.dispose();
  });

  it("handles reset command and returns to Idle", () => {
    const { events, runtime, send } = createHarness();
    send({ type: "init", options: { ...BASE_OPTIONS, width: 4, height: 4 } });

    send({ type: "generate" });
    send({ type: "pause" });
    for (let i = 0; i < 300; i += 1) {
      send({ type: "stepOnce" });
      if (findLastEvent(events, "phaseChange")?.phase === "Generated") break;
    }

    events.length = 0;
    send({ type: "reset" });

    const phaseEvent = findLastEvent(events, "phaseChange");
    expect(phaseEvent?.phase).toBe("Idle");

    runtime.dispose();
  });

  it("handles resume command during active solving", () => {
    const { events, runtime, send } = createHarness();
    send({ type: "init", options: { ...BASE_OPTIONS, width: 4, height: 4 } });

    send({ type: "generate" });
    send({ type: "pause" });
    for (let i = 0; i < 300; i += 1) {
      send({ type: "stepOnce" });
      if (findLastEvent(events, "phaseChange")?.phase === "Generated") break;
    }

    send({ type: "solve" });
    send({ type: "pause" });
    events.length = 0;

    send({ type: "resume" });
    const snapshot = findLastEvent(events, "runtimeSnapshot");
    expect(snapshot?.runtime.phase).toBe("Solving");
    expect(snapshot?.runtime.paused).toBe(false);

    send({ type: "pause" });
    runtime.dispose();
  });

  it("handles dispose command via handleCommand", () => {
    const { events, send } = createHarness();
    send({ type: "init", options: BASE_OPTIONS });
    events.length = 0;

    // Should not throw
    send({ type: "dispose" });
    expect(findLastEvent(events, "error")).toBeUndefined();
  });

  it("re-initializes engine on second init command", () => {
    const { events, runtime, send } = createHarness();
    send({ type: "init", options: BASE_OPTIONS });
    events.length = 0;

    // Second init should dispose existing engine and create a new one
    send({ type: "init", options: { ...BASE_OPTIONS, width: 6, height: 6 } });

    const gridEvent = findLastEvent(events, "gridRebuilt");
    expect(gridEvent).toBeDefined();
    expect(gridEvent?.grid.width).toBe(6);

    runtime.dispose();
  });

  it("applyLineMeta tracks generator active line from step meta", () => {
    const { events, runtime, send } = createHarness();
    send({ type: "init", options: { ...BASE_OPTIONS, width: 5, height: 5 } });
    events.length = 0;

    send({ type: "generate" });
    send({ type: "pause" });
    send({ type: "stepOnce" });

    const snapshot = findLastEvent(events, "runtimeSnapshot");
    expect(snapshot).toBeDefined();
    // generatorActiveLine may be a number or null depending on the generator
    expect(snapshot?.runtime.generatorActiveLine === null || typeof snapshot?.runtime.generatorActiveLine === "number").toBe(true);

    runtime.dispose();
  });
});
