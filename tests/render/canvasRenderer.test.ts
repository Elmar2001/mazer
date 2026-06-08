import { describe, expect, it } from "vitest";

import {
  CANVAS_MAX_BACKING_DIMENSION,
  CANVAS_MAX_BACKING_PIXELS,
} from "@/config/limits";
import { computeSafeDpr } from "@/render/CanvasRenderer";

describe("computeSafeDpr", () => {
  it("returns the native dpr unchanged on a small canvas", () => {
    expect(computeSafeDpr(640, 400, 2)).toBe(2);
    expect(computeSafeDpr(800, 600, 1)).toBe(1);
  });

  it("clamps below native dpr on a huge canvas", () => {
    const dpr = computeSafeDpr(20_000, 20_000, 2);
    expect(dpr).toBeLessThan(2);
  });

  it("binds the per-axis 16384 cap when a single axis is huge", () => {
    // Tall and narrow: height drives the per-axis cap, total-pixel cap stays loose.
    const widthPx = 100;
    const heightPx = 40_000;
    const expected = CANVAS_MAX_BACKING_DIMENSION / heightPx;
    expect(computeSafeDpr(widthPx, heightPx, 2)).toBeCloseTo(expected, 10);
  });

  it("binds the total-pixel sqrt cap when area is the limiting factor", () => {
    // A square large enough that the area cap is tighter than the per-axis caps.
    const side = 8_000;
    const maxByPixels = Math.sqrt(CANVAS_MAX_BACKING_PIXELS / (side * side));
    const maxByAxis = CANVAS_MAX_BACKING_DIMENSION / side;
    expect(maxByPixels).toBeLessThan(maxByAxis);
    expect(maxByPixels).toBeLessThan(2);
    expect(computeSafeDpr(side, side, 2)).toBeCloseTo(maxByPixels, 10);
  });

  it("never returns less than the 0.1 floor for finite positive inputs", () => {
    // Absurdly large canvas would push every cap toward 0, but the floor holds.
    expect(computeSafeDpr(1_000_000, 1_000_000, 2)).toBe(0.1);
  });

  it("never returns NaN or Infinity for finite positive inputs", () => {
    const samples: Array<[number, number, number]> = [
      [1, 1, 1],
      [640, 400, 2],
      [16_384, 16_384, 3],
      [20_000, 5, 2],
      [1_000_000, 1_000_000, 4],
    ];

    for (const [widthPx, heightPx, nativeDpr] of samples) {
      const dpr = computeSafeDpr(widthPx, heightPx, nativeDpr);
      expect(Number.isFinite(dpr)).toBe(true);
      expect(dpr).toBeGreaterThanOrEqual(0.1);
    }
  });
});
