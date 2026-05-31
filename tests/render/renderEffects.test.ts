import { describe, expect, it } from "vitest";

import { OverlayFlag, WallFlag } from "@/core/grid";
import {
  classifyPatchEffects,
  pruneTransientEffects,
  resolveRenderMotionMode,
  shouldRunLiveCanvasLoop,
  type RenderTransientEffect,
} from "@/render/renderEffects";

describe("resolveRenderMotionMode", () => {
  it("enables full effects for readable low-speed cells", () => {
    expect(
      resolveRenderMotionMode({
        cellSize: 16,
        dirtyCellCount: 12,
        reducedMotion: false,
        speed: 60,
      }),
    ).toBe("full");
  });

  it("degrades effects under high load", () => {
    expect(
      resolveRenderMotionMode({
        cellSize: 6,
        dirtyCellCount: 12,
        reducedMotion: false,
        speed: 60,
      }),
    ).toBe("off");

    expect(
      resolveRenderMotionMode({
        cellSize: 16,
        dirtyCellCount: 12,
        reducedMotion: false,
        speed: 2_500,
      }),
    ).toBe("lite");

    expect(
      resolveRenderMotionMode({
        cellSize: 16,
        dirtyCellCount: 900,
        reducedMotion: false,
        speed: 60,
      }),
    ).toBe("off");
  });

  it("disables effects for reduced-motion users", () => {
    expect(
      resolveRenderMotionMode({
        cellSize: 16,
        dirtyCellCount: 12,
        reducedMotion: true,
        speed: 60,
      }),
    ).toBe("off");
  });
});

describe("classifyPatchEffects", () => {
  it("classifies structural and overlay patches into transient effect kinds", () => {
    const effects = classifyPatchEffects(
      [
        { index: 1, wallClear: WallFlag.East },
        { index: 2, overlaySet: OverlayFlag.Visited },
        { index: 3, overlaySet: OverlayFlag.Frontier },
        { index: 4, overlaySet: OverlayFlag.Current },
        { index: 5, overlaySet: OverlayFlag.Path },
        { index: 6, overlaySet: OverlayFlag.VisitedB | OverlayFlag.CurrentB },
      ],
      250,
      "full",
    );

    expect(effects.map((effect) => effect.kind)).toEqual([
      "frontier-flash",
      "visited-tint",
      "frontier-flash",
      "frontier-flash",
      "path-pulse",
      "visited-tint",
      "frontier-flash",
    ]);
    expect(effects.map((effect) => effect.index)).toEqual([1, 2, 3, 4, 5, 6, 6]);
    expect(effects[0]).toMatchObject({
      bornAt: 250,
      durationMs: 280,
      role: "A",
    });
    expect(effects[5]).toMatchObject({
      role: "B",
    });
  });

  it("keeps lite mode to frontier flash and path pulse only", () => {
    const effects = classifyPatchEffects(
      [
        { index: 1, overlaySet: OverlayFlag.Visited },
        { index: 2, overlaySet: OverlayFlag.Frontier },
        { index: 3, overlaySet: OverlayFlag.Current },
        { index: 4, overlaySet: OverlayFlag.Path },
      ],
      0,
      "lite",
    );

    expect(effects.map((effect) => effect.kind)).toEqual([
      "frontier-flash",
      "frontier-flash",
      "path-pulse",
    ]);
  });
});

describe("pruneTransientEffects", () => {
  it("removes expired effects and retains the most recent entries under the cap", () => {
    const effects: RenderTransientEffect[] = [
      { id: 1, index: 1, kind: "visited-tint", role: "A", bornAt: 0, durationMs: 100 },
      { id: 2, index: 2, kind: "path-pulse", role: "A", bornAt: 70, durationMs: 200 },
      { id: 3, index: 3, kind: "frontier-flash", role: "B", bornAt: 80, durationMs: 200 },
      { id: 4, index: 4, kind: "frontier-flash", role: "A", bornAt: 90, durationMs: 200 },
    ];

    expect(pruneTransientEffects(effects, 125, 2)).toEqual([
      { id: 3, index: 3, kind: "frontier-flash", role: "B", bornAt: 80, durationMs: 200 },
      { id: 4, index: 4, kind: "frontier-flash", role: "A", bornAt: 90, durationMs: 200 },
    ]);
  });
});

describe("shouldRunLiveCanvasLoop", () => {
  it("runs endpoint and path pulse animation only for active phases", () => {
    expect(
      shouldRunLiveCanvasLoop({
        phase: "generating",
        paused: false,
        reducedMotion: false,
      }),
    ).toBe(true);

    expect(
      shouldRunLiveCanvasLoop({
        phase: "solving",
        paused: false,
        reducedMotion: false,
      }),
    ).toBe(true);

    expect(
      shouldRunLiveCanvasLoop({
        phase: "generated",
        paused: true,
        reducedMotion: false,
      }),
    ).toBe(false);

    expect(
      shouldRunLiveCanvasLoop({
        phase: "solving",
        paused: false,
        reducedMotion: true,
      }),
    ).toBe(false);
  });
});
