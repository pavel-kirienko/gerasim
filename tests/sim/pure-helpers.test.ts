import { describe, it, expect } from "vitest";
import {
  topicHash, subjectId, leftWins, gossipDedupHash, topicLage,
} from "../../src/sim.js";
import {
  SUBJECT_ID_PINNED_MAX, SUBJECT_ID_MODULUS, LAGE_MIN, LAGE_MAX,
} from "../../src/constants.js";

describe("topicHash", () => {
  it("empty string is deterministic", () => {
    expect(topicHash("")).toBe(topicHash(""));
  });

  it("is deterministic", () => {
    expect(topicHash("hello")).toBe(topicHash("hello"));
  });

  it("different inputs produce different hashes", () => {
    expect(topicHash("foo")).not.toBe(topicHash("bar"));
  });

  it("supports #hex hash override suffix", () => {
    expect(topicHash("topic/x#10")).toBe(0x10n);
    expect(topicHash("topic/x#1a2b")).toBe(0x1a2bn);
  });
});

describe("subjectId", () => {
  it("pinned range: hash <= 0x1FFF returns Number(hash)", () => {
    expect(subjectId(0n, 0, SUBJECT_ID_MODULUS)).toBe(0);
    expect(subjectId(100n, 0, SUBJECT_ID_MODULUS)).toBe(100);
    expect(subjectId(BigInt(SUBJECT_ID_PINNED_MAX), 0, SUBJECT_ID_MODULUS)).toBe(SUBJECT_ID_PINNED_MAX);
  });

  it("non-pinned: modular arithmetic", () => {
    const hash = topicHash("topic/a");
    const sid = subjectId(hash, 0, SUBJECT_ID_MODULUS);
    expect(sid).toBeGreaterThanOrEqual(SUBJECT_ID_PINNED_MAX + 1);
    // Verify formula
    const expected = SUBJECT_ID_PINNED_MAX + 1 + Number(hash % BigInt(SUBJECT_ID_MODULUS));
    expect(sid).toBe(expected);
  });

  it("evictions change the result (squared effect)", () => {
    const hash = topicHash("topic/a");
    const sid0 = subjectId(hash, 0, SUBJECT_ID_MODULUS);
    const sid1 = subjectId(hash, 1, SUBJECT_ID_MODULUS);
    const sid2 = subjectId(hash, 2, SUBJECT_ID_MODULUS);
    // At least some should differ
    expect(sid0 === sid1 && sid1 === sid2).toBe(false);
  });
});

describe("leftWins", () => {
  it("higher lage wins", () => {
    expect(leftWins(5, 100n, 3, 200n)).toBe(true);
  });

  it("lower lage loses", () => {
    expect(leftWins(3, 100n, 5, 200n)).toBe(false);
  });

  it("equal lage: lower hash wins", () => {
    expect(leftWins(5, 10n, 5, 20n)).toBe(true);
    expect(leftWins(5, 20n, 5, 10n)).toBe(false);
  });

  it("equal lage and hash: returns false", () => {
    expect(leftWins(5, 10n, 5, 10n)).toBe(false);
  });
});

describe("gossipDedupHash", () => {
  it("different evictions produce different hashes", () => {
    const h = topicHash("test");
    expect(gossipDedupHash(h, 0, 5)).not.toBe(gossipDedupHash(h, 1, 5));
  });

  it("different lage values produce different hashes", () => {
    const h = topicHash("test");
    expect(gossipDedupHash(h, 0, 3)).not.toBe(gossipDedupHash(h, 0, 5));
  });

  it("clamps lage at LAGE_MIN and LAGE_MAX", () => {
    const h = topicHash("test");
    expect(gossipDedupHash(h, 0, LAGE_MIN - 10)).toBe(gossipDedupHash(h, 0, LAGE_MIN));
    expect(gossipDedupHash(h, 0, LAGE_MAX + 10)).toBe(gossipDedupHash(h, 0, LAGE_MAX));
  });
});

describe("topicLage", () => {
  it("age=0 returns LAGE_MIN", () => {
    expect(topicLage(1000, 1000)).toBe(LAGE_MIN);
  });

  it("age=1s returns 0", () => {
    expect(topicLage(0, 1_000_000)).toBe(0);
  });

  it("age=2s returns 1", () => {
    expect(topicLage(0, 2_000_000)).toBe(1);
  });

  it("age=8s returns 3", () => {
    expect(topicLage(0, 8_000_000)).toBe(3);
  });

  it("very large age clamped to LAGE_MAX", () => {
    expect(topicLage(0, 1e18)).toBe(LAGE_MAX);
  });
});
