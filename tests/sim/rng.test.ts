import { describe, it, expect } from "vitest";
import { Rng } from "../../src/sim.js";

describe("Rng", () => {
  it("is deterministic: same seed produces same sequence", () => {
    const a = new Rng(123);
    const b = new Rng(123);
    for (let i = 0; i < 100; i++) {
      expect(a.random()).toBe(b.random());
    }
  });

  it("different seeds produce different sequences", () => {
    const a = new Rng(1);
    const b = new Rng(2);
    const seqA = Array.from({ length: 10 }, () => a.random());
    const seqB = Array.from({ length: 10 }, () => b.random());
    expect(seqA).not.toEqual(seqB);
  });

  it("random() returns values in [0, 1)", () => {
    const rng = new Rng(42);
    for (let i = 0; i < 1000; i++) {
      const v = rng.random();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("randint(lo, hi) returns values in [lo, hi]", () => {
    const rng = new Rng(42);
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) {
      const v = rng.randint(3, 7);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(7);
      seen.add(v);
    }
    // Should cover the full range
    expect(seen).toEqual(new Set([3, 4, 5, 6, 7]));
  });

  it("randint(x, x) always returns x", () => {
    const rng = new Rng(99);
    for (let i = 0; i < 100; i++) {
      expect(rng.randint(5, 5)).toBe(5);
    }
  });

  it("randrange(n) returns values in [0, n)", () => {
    const rng = new Rng(42);
    for (let i = 0; i < 1000; i++) {
      const v = rng.randrange(10);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(10);
    }
  });

  it("choice(arr) returns an element from the array", () => {
    const rng = new Rng(42);
    const arr = ["a", "b", "c"];
    for (let i = 0; i < 100; i++) {
      expect(arr).toContain(rng.choice(arr));
    }
  });

  it("getState()/setState() round-trip preserves sequence", () => {
    const rng = new Rng(42);
    // Advance a bit
    for (let i = 0; i < 10; i++) rng.random();
    const state = rng.getState();
    const expected = Array.from({ length: 10 }, () => rng.random());
    rng.setState(state);
    const actual = Array.from({ length: 10 }, () => rng.random());
    expect(actual).toEqual(expected);
  });
});
