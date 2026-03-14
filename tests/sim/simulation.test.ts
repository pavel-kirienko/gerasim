import { describe, it, expect } from "vitest";
import { Simulation, subjectId } from "../../src/sim.js";
import type { EventRecord, NetworkConfig } from "../../src/types.js";
import {
  DEFAULT_SHARD_COUNT,
  DEFAULT_GOSSIP_STARTUP_DELAY,
  DEFAULT_GOSSIP_PERIOD,
  DEFAULT_GOSSIP_DITHER,
  DEFAULT_GOSSIP_BROADCAST_FRACTION,
  DEFAULT_GOSSIP_URGENT_DELAY,
  SUBJECT_ID_MODULUS,
} from "../../src/constants.js";

function makeNet(
  overrides: {
    delay?: [number, number];
    lossProbability?: number;
    protocol?: Partial<NetworkConfig["protocol"]>;
  } = {},
): NetworkConfig {
  const protocol = {
    subjectIdModulus: SUBJECT_ID_MODULUS,
    shardCount: DEFAULT_SHARD_COUNT,
    gossipStartupDelay: DEFAULT_GOSSIP_STARTUP_DELAY,
    gossipPeriod: DEFAULT_GOSSIP_PERIOD,
    gossipDither: DEFAULT_GOSSIP_DITHER,
    gossipBroadcastFraction: DEFAULT_GOSSIP_BROADCAST_FRACTION,
    gossipUrgentDelay: DEFAULT_GOSSIP_URGENT_DELAY,
    ...overrides.protocol,
  };
  return {
    delay: overrides.delay ?? [0, 0],
    lossProbability: overrides.lossProbability ?? 0,
    protocol,
  };
}

function makeSim(seed = 42, net = makeNet()): Simulation {
  return new Simulation(net, seed);
}

function invokeMsgArrive(sim: Simulation, payload: Record<string, unknown>): EventRecord[] {
  const out: EventRecord[] = [];
  (sim as any).handleMsgArrive(payload, (r: EventRecord) => out.push(r));
  return out;
}

describe("Simulation", () => {
  describe("addNode", () => {
    it("auto-increments IDs", () => {
      const sim = makeSim();
      const n0 = sim.addNode();
      const n1 = sim.addNode();
      expect(n0.nodeId).toBe(0);
      expect(n1.nodeId).toBe(1);
    });

    it("node starts offline and joins after stepping", () => {
      const sim = makeSim();
      const n = sim.addNode();
      expect(n.online).toBe(false);
      sim.stepUntil(1);
      expect(n.online).toBe(true);
    });
  });

  describe("topic scheduling", () => {
    it("does not schedule gossip before first local topic", () => {
      const sim = makeSim();
      sim.addNode(0);
      sim.stepUntil(1);
      sim.stepUntil(30_000_000);
      const events = sim.stepUntil(sim.nowUs);
      expect(events.filter((e) => e.event === "broadcast" || e.event === "shard").length).toBe(0);
    });

    it("first gossip is jittered in [0, startup_delay]", () => {
      const sim = makeSim(
        123,
        makeNet({
          protocol: { gossipStartupDelay: 1 },
        }),
      );
      sim.addNode(0);
      sim.stepUntil(1);
      const t0 = sim.nowUs;
      const topic = sim.addTopicToNode(0, "topic/a")!;
      const schedule = sim.nodes.get(0)!.topicScheduleByHash.get(topic.hash)!;
      expect(schedule.nextGossipUs).toBeGreaterThanOrEqual(t0);
      expect(schedule.nextGossipUs).toBeLessThanOrEqual(t0 + 1_000_000);
    });

    it("first periodic emission is forced broadcast, then shard", () => {
      const sim = makeSim(
        7,
        makeNet({
          protocol: {
            gossipStartupDelay: 0,
            gossipPeriod: 0.000001,
            gossipDither: 0,
            gossipBroadcastFraction: 0.1,
          },
        }),
      );
      sim.addNode(0);
      sim.addNode(1);
      sim.stepUntil(1);
      sim.addTopicToNode(0, "topic/x#1")!;
      sim.addTopicToNode(1, "topic/listener#7c1")!; // same shard as hash=1 with shard_count=1984

      const events = sim.stepUntil(sim.nowUs + 5);
      const sends = events.filter((e) => e.src === 0 && (e.event === "broadcast" || e.event === "shard"));
      expect(sends.length).toBeGreaterThanOrEqual(2);
      expect(sends[0].event).toBe("broadcast");
      expect(sends[1].event).toBe("shard");
    });

    it("broadcast cadence is every 10th periodic emission", () => {
      const sim = makeSim(
        11,
        makeNet({
          protocol: {
            gossipStartupDelay: 0,
            gossipPeriod: 0.000001,
            gossipDither: 0,
            gossipBroadcastFraction: 0.1,
          },
        }),
      );
      sim.addNode(0);
      sim.stepUntil(1);
      sim.addTopicToNode(0, "topic/x#2");

      const events = sim.stepUntil(sim.nowUs + 30);
      const sends = events.filter((e) => e.src === 0 && (e.event === "broadcast" || e.event === "shard"));
      expect(sends.length).toBeGreaterThanOrEqual(20);
      expect(events.some((e) => e.event === "unicast" || e.event === "forward" || e.event === "periodic_unicast")).toBe(
        false,
      );
      expect(sends[0].event).toBe("broadcast");
      expect(sends[9].event).toBe("broadcast");
      expect(sends[19].event).toBe("broadcast");
      expect(sends[1].event).toBe("shard");
      expect(sends[2].event).toBe("shard");
    });

    it("known-topic receive applies duplicate suppression [6s,15s]", () => {
      const sim = makeSim(
        17,
        makeNet({
          protocol: {
            gossipStartupDelay: 0,
            gossipPeriod: 5,
            gossipDither: 1,
          },
        }),
      );
      sim.addNode(0);
      sim.addNode(1);
      sim.stepUntil(1);
      const topic = sim.addTopicToNode(0, "topic/shared")!;
      sim.addTopicToNode(1, "topic/shared");

      // Prevent node 1 from self-sending first; we want it to reschedule on receive.
      sim.nodes.get(1)!.topicScheduleByHash.get(topic.hash)!.nextGossipUs = Number.MAX_SAFE_INTEGER;

      const events = sim.stepUntil(sim.nowUs + 10);
      const received = events.find((e) => e.event === "received" && e.src === 1 && e.topicHash === topic.hash);
      expect(received).toBeDefined();

      const n1Schedule = sim.nodes.get(1)!.topicScheduleByHash.get(topic.hash)!;
      expect(n1Schedule.nextGossipUs).toBeGreaterThanOrEqual(received!.timeUs + 6_000_000);
      expect(n1Schedule.nextGossipUs).toBeLessThanOrEqual(received!.timeUs + 15_000_000);
    });
  });

  describe("shard transport", () => {
    it("shard send targets listening nodes", () => {
      const sim = makeSim(
        19,
        makeNet({
          protocol: {
            gossipStartupDelay: 0,
            gossipPeriod: 0.000001,
            gossipDither: 0,
          },
        }),
      );
      sim.addNode(0);
      sim.addNode(1);
      sim.addNode(2);
      sim.stepUntil(1);
      sim.addTopicToNode(0, "topic/sender#1");
      sim.addTopicToNode(2, "topic/listener#7c1");

      const events = sim.stepUntil(sim.nowUs + 5);
      const shard = events.find((e) => e.event === "shard" && e.src === 0);
      expect(shard).toBeDefined();
      expect(shard!.details.listeners as number[]).toEqual([2]);
    });

    it("shard send with no listeners is still logged", () => {
      const sim = makeSim(
        23,
        makeNet({
          protocol: {
            gossipStartupDelay: 0,
            gossipPeriod: 0.000001,
            gossipDither: 0,
          },
        }),
      );
      sim.addNode(0);
      sim.stepUntil(1);
      sim.addTopicToNode(0, "topic/sender#3");

      const events = sim.stepUntil(sim.nowUs + 5);
      const shard = events.find((e) => e.event === "shard" && e.src === 0);
      expect(shard).toBeDefined();
      expect((shard!.details.listeners as number[]).length).toBe(0);
    });
  });

  describe("urgent repair scheduling", () => {
    it("known-topic local-win divergence schedules urgent shard gossip", () => {
      const sim = makeSim(29);
      sim.addNode(0);
      sim.addNode(1);
      sim.stepUntil(1);

      const local = sim.addTopicToNode(0, "topic/divergence", undefined, 3, 6)!;
      const events = invokeMsgArrive(sim, {
        src: 1,
        dst: 0,
        topic_hash: local.hash,
        evictions: 0,
        lage: 0,
        name: local.name,
        msg_type: "shard",
        shard_index: 0,
        send_time_us: sim.nowUs,
      });

      const conflict = events.find(
        (e) =>
          e.event === "conflict" &&
          (e.details as Record<string, unknown>)["type"] === "divergence" &&
          (e.details as Record<string, unknown>)["local_won"] === true,
      );
      expect(conflict).toBeDefined();
      const pending = sim.nodes.get(0)!.pendingUrgentByHash.get(local.hash);
      expect(pending).toBeDefined();
      expect(pending!.scope).toBe("shard");
      expect(pending!.deadlineUs).toBeGreaterThanOrEqual(sim.nowUs);
      expect(pending!.deadlineUs).toBeLessThanOrEqual(sim.nowUs + Math.round(DEFAULT_GOSSIP_URGENT_DELAY * 1_000_000));
    });

    it("unknown-topic local-win collision schedules urgent broadcast gossip", () => {
      const sim = makeSim(31);
      sim.addNode(0);
      sim.addNode(1);
      sim.stepUntil(1);

      const sid = 900;
      const local = sim.addTopicToNode(0, undefined, sid, 0, 6)!;
      const remote = sim.addTopicToNode(1, undefined, sid, 0, 0)!;
      expect(local.hash).not.toBe(remote.hash);

      invokeMsgArrive(sim, {
        src: 1,
        dst: 0,
        topic_hash: remote.hash,
        evictions: remote.evictions,
        lage: 0,
        name: remote.name,
        msg_type: "shard",
        shard_index: 0,
        send_time_us: sim.nowUs,
      });

      const pending = sim.nodes.get(0)!.pendingUrgentByHash.get(local.hash);
      expect(pending).toBeDefined();
      expect(pending!.scope).toBe("broadcast");
    });

    it("known-topic local-loss with local collision schedules urgent broadcast for displaced local topic", () => {
      const sim = makeSim(37);
      sim.addNode(0);
      sim.addNode(1);
      sim.stepUntil(1);

      const mine = sim.addTopicToNode(0, "topic/known-loss", undefined, 0, 0)!;
      const collisionSid = subjectId(mine.hash, 1, SUBJECT_ID_MODULUS);
      const localOther = sim.addTopicToNode(0, undefined, collisionSid, 0, 0)!;

      invokeMsgArrive(sim, {
        src: 1,
        dst: 0,
        topic_hash: mine.hash,
        evictions: 1,
        lage: 6,
        name: mine.name,
        msg_type: "shard",
        shard_index: 0,
        send_time_us: sim.nowUs,
      });

      const pending = sim.nodes.get(0)!.pendingUrgentByHash.get(localOther.hash);
      expect(pending).toBeDefined();
      expect(pending!.scope).toBe("broadcast");
    });

    it("unknown-topic local-loss schedules urgent broadcast gossip", () => {
      const sim = makeSim(41);
      sim.addNode(0);
      sim.addNode(1);
      sim.stepUntil(1);

      const sid = 902;
      const local = sim.addTopicToNode(0, undefined, sid, 0, 0)!;
      const remote = sim.addTopicToNode(1, undefined, sid, 0, 6)!;
      expect(local.hash).not.toBe(remote.hash);

      invokeMsgArrive(sim, {
        src: 1,
        dst: 0,
        topic_hash: remote.hash,
        evictions: remote.evictions,
        lage: 6,
        name: remote.name,
        msg_type: "shard",
        shard_index: 0,
        send_time_us: sim.nowUs,
      });

      const pending = sim.nodes.get(0)!.pendingUrgentByHash.get(local.hash);
      expect(pending).toBeDefined();
      expect(pending!.scope).toBe("broadcast");
    });

    it("pending urgent is not canceled by stale-lage gossip", () => {
      const sim = makeSim(43);
      sim.addNode(0);
      sim.addNode(1);
      sim.stepUntil(1);

      const local = sim.addTopicToNode(0, "topic/stale-lage", undefined, 0, 3)!;
      sim.nodes.get(0)!.pendingUrgentByHash.set(local.hash, {
        deadlineUs: sim.nowUs + 10_000,
        scope: "shard",
      });

      invokeMsgArrive(sim, {
        src: 1,
        dst: 0,
        topic_hash: local.hash,
        evictions: 0,
        lage: 1,
        name: local.name,
        msg_type: "shard",
        shard_index: 0,
        send_time_us: sim.nowUs,
      });

      expect(sim.nodes.get(0)!.pendingUrgentByHash.has(local.hash)).toBe(true);
    });

    it("pending urgent cancellation follows divergence arbitration", () => {
      const sim = makeSim(47);
      sim.addNode(0);
      sim.addNode(1);
      sim.stepUntil(1);

      const local = sim.addTopicToNode(0, "topic/cancel-arb", undefined, 1, 3)!;
      sim.nodes.get(0)!.pendingUrgentByHash.set(local.hash, {
        deadlineUs: sim.nowUs + 10_000,
        scope: "shard",
      });

      // Same lage, higher remote evictions: local loses divergence arbitration, pending is canceled.
      invokeMsgArrive(sim, {
        src: 1,
        dst: 0,
        topic_hash: local.hash,
        evictions: 2,
        lage: 3,
        name: local.name,
        msg_type: "shard",
        shard_index: 0,
        send_time_us: sim.nowUs,
      });
      expect(sim.nodes.get(0)!.pendingUrgentByHash.has(local.hash)).toBe(false);

      sim.nodes.get(0)!.pendingUrgentByHash.set(local.hash, {
        deadlineUs: sim.nowUs + 10_000,
        scope: "shard",
      });

      // Same lage, lower remote evictions: local wins divergence arbitration, pending is retained.
      invokeMsgArrive(sim, {
        src: 1,
        dst: 0,
        topic_hash: local.hash,
        evictions: 1,
        lage: 3,
        name: local.name,
        msg_type: "shard",
        shard_index: 0,
        send_time_us: sim.nowUs,
      });
      expect(sim.nodes.get(0)!.pendingUrgentByHash.has(local.hash)).toBe(true);
    });
  });

  describe("snapshot/state", () => {
    it("snapshot exposes shard IDs and next topic", () => {
      const sim = makeSim();
      sim.addNode(0);
      sim.stepUntil(1);
      const topic = sim.addTopicToNode(0, "topic/a#11")!;
      const snap = sim.snapshot().get(0)!;
      expect(snap.shardIds.length).toBe(1);
      expect(snap.nextTopicHash).toBe(topic.hash);
      expect(snap.pendingUrgentCount).toBe(0);
    });

    it("saveState/loadState round-trips", () => {
      const sim = makeSim();
      sim.addNode(0);
      sim.stepUntil(1);
      sim.addTopicToNode(0, "topic/a");
      sim.stepUntil(5_000_000);
      const state = sim.saveState();
      const sim2 = makeSim();
      sim2.loadState(state);
      expect(sim2.nowUs).toBe(sim.nowUs);
      expect(sim2.nodes.size).toBe(sim.nodes.size);
      expect(sim2.snapshot().get(0)?.topics.length).toBe(1);
    });
  });
});
