import { describe, it, expect } from "vitest";
import { makeNode, nodeAddTopic, nodeFindBySubjectId, topicHash, subjectId } from "../../src/sim.js";
import { SUBJECT_ID_MODULUS } from "../../src/constants.js";
import type { Topic } from "../../src/types.js";

function makeTopic(name: string): Topic {
  const hash = topicHash(name);
  return { name, hash, evictions: 0, tsCreatedUs: 0, sortOrder: 0 };
}

describe("makeNode", () => {
  it("has multicast-gossip defaults", () => {
    const node = makeNode(7);
    expect(node.nodeId).toBe(7);
    expect(node.online).toBe(false);
    expect(node.topics.size).toBe(0);
    expect(node.topicScheduleByHash.size).toBe(0);
    expect(node.pendingUrgentByHash.size).toBe(0);
    expect(node.partitionSet).toBe("A");
  });
});

describe("nodeAddTopic", () => {
  it("adds to local topic map", () => {
    const node = makeNode(0);
    const topic = makeTopic("topic/a");
    nodeAddTopic(node, topic);
    expect(node.topics.get(topic.hash)).toBe(topic);
  });

  it("overwrites same hash", () => {
    const node = makeNode(0);
    const first = makeTopic("topic/a");
    const second = { ...first, evictions: 3 };
    nodeAddTopic(node, first);
    nodeAddTopic(node, second);
    expect(node.topics.get(first.hash)?.evictions).toBe(3);
  });
});

describe("nodeFindBySubjectId", () => {
  it("returns null on empty node", () => {
    const node = makeNode(0);
    expect(nodeFindBySubjectId(node, 100)).toBeNull();
  });

  it("finds matching topic", () => {
    const node = makeNode(0);
    const topic = makeTopic("topic/a");
    nodeAddTopic(node, topic);
    const sid = subjectId(topic.hash, topic.evictions, SUBJECT_ID_MODULUS);
    expect(nodeFindBySubjectId(node, sid)).toBe(topic);
  });

  it("returns null when no match", () => {
    const node = makeNode(0);
    const topic = makeTopic("topic/a");
    nodeAddTopic(node, topic);
    expect(nodeFindBySubjectId(node, 999999)).toBeNull();
  });
});
