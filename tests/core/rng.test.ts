import { describe, expect, it } from "vitest";

import { createMulberry32, hashStringToSeed } from "@/core/rng";

describe("rng", () => {
  it("hashes seed strings deterministically", () => {
    const a = hashStringToSeed("maze-seed");
    const b = hashStringToSeed("maze-seed");
    const c = hashStringToSeed("maze-seed-2");

    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("produces deterministic random sequences", () => {
    const first = createMulberry32(123456789);
    const second = createMulberry32(123456789);

    const seqA = Array.from({ length: 8 }, () => first.next());
    const seqB = Array.from({ length: 8 }, () => second.next());

    expect(seqA).toEqual(seqB);
  });

  it("keeps values within [0, 1)", () => {
    const rng = createMulberry32(42);
    for (let i = 0; i < 100; i += 1) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});
