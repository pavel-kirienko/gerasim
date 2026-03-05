import { describe, it, expect } from "vitest";
import {
  GOSSIP_PERIOD, GOSSIP_PEER_STALE, GOSSIP_PEER_ELIGIBLE,
  SUBJECT_ID_PINNED_MAX, LAGE_MIN, LAGE_MAX,
} from "../src/constants.js";

describe("constants", () => {
  it("GOSSIP_PEER_STALE === 2 * GOSSIP_PERIOD", () => {
    expect(GOSSIP_PEER_STALE).toBe(2 * GOSSIP_PERIOD);
  });

  it("GOSSIP_PEER_ELIGIBLE === 3 * GOSSIP_PERIOD", () => {
    expect(GOSSIP_PEER_ELIGIBLE).toBe(3 * GOSSIP_PERIOD);
  });

  it("SUBJECT_ID_PINNED_MAX === 0x1FFF", () => {
    expect(SUBJECT_ID_PINNED_MAX).toBe(0x1FFF);
  });

  it("LAGE_MIN < LAGE_MAX", () => {
    expect(LAGE_MIN).toBeLessThan(LAGE_MAX);
  });
});
