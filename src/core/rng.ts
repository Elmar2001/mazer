export interface RandomSource {
  next(): number;
  nextInt(maxExclusive: number): number;
  pick<T>(items: readonly T[]): T;
}

export function hashStringToSeed(input: string): number {
  let h = 2166136261 >>> 0;

  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }

  return h >>> 0;
}

export function createMulberry32(seed: number): RandomSource {
  let state = seed >>> 0;

  return {
    next() {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    nextInt(maxExclusive: number) {
      if (maxExclusive <= 0) {
        return 0;
      }

      return Math.floor(this.next() * maxExclusive);
    },
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) {
        throw new Error("Cannot pick from an empty list.");
      }

      return items[this.nextInt(items.length)] as T;
    },
  };
}

export function createSeededRandom(seedText: string): RandomSource {
  return createMulberry32(hashStringToSeed(seedText));
}
