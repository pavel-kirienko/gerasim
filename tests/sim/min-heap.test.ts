import { describe, it, expect } from "vitest";
import { MinHeap, SimEvent, Rng } from "../../src/sim.js";

function ev(timeUs: number, seq: number): SimEvent {
  return { timeUs, seq, type: "TEST", payload: {} };
}

describe("MinHeap", () => {
  it("empty heap: pop/peek return undefined, length=0", () => {
    const h = new MinHeap();
    expect(h.length).toBe(0);
    expect(h.peek()).toBeUndefined();
    expect(h.pop()).toBeUndefined();
  });

  it("single element push/pop", () => {
    const h = new MinHeap();
    const e = ev(100, 0);
    h.push(e);
    expect(h.length).toBe(1);
    expect(h.peek()).toBe(e);
    expect(h.pop()).toBe(e);
    expect(h.length).toBe(0);
  });

  it("ordering by timeUs", () => {
    const h = new MinHeap();
    h.push(ev(30, 0));
    h.push(ev(10, 1));
    h.push(ev(20, 2));
    expect(h.pop()!.timeUs).toBe(10);
    expect(h.pop()!.timeUs).toBe(20);
    expect(h.pop()!.timeUs).toBe(30);
  });

  it("tie-breaking by seq number", () => {
    const h = new MinHeap();
    h.push(ev(10, 5));
    h.push(ev(10, 2));
    h.push(ev(10, 8));
    expect(h.pop()!.seq).toBe(2);
    expect(h.pop()!.seq).toBe(5);
    expect(h.pop()!.seq).toBe(8);
  });

  it("100 random events pop in sorted order", () => {
    const rng = new Rng(42);
    const h = new MinHeap();
    for (let i = 0; i < 100; i++) {
      h.push(ev(rng.randint(0, 10000), i));
    }
    let prev: SimEvent | undefined;
    while (h.length > 0) {
      const cur = h.pop()!;
      if (prev) {
        const ok = cur.timeUs > prev.timeUs ||
          (cur.timeUs === prev.timeUs && cur.seq > prev.seq);
        expect(ok).toBe(true);
      }
      prev = cur;
    }
  });

  it("toArray()/fromArray() round-trip", () => {
    const h = new MinHeap();
    h.push(ev(30, 0));
    h.push(ev(10, 1));
    h.push(ev(20, 2));
    const arr = h.toArray();
    const h2 = MinHeap.fromArray(arr);
    expect(h2.pop()!.timeUs).toBe(10);
    expect(h2.pop()!.timeUs).toBe(20);
    expect(h2.pop()!.timeUs).toBe(30);
  });

  it("interleaved push/pop maintains ordering", () => {
    const h = new MinHeap();
    h.push(ev(50, 0));
    h.push(ev(20, 1));
    expect(h.pop()!.timeUs).toBe(20);
    h.push(ev(10, 2));
    h.push(ev(30, 3));
    expect(h.pop()!.timeUs).toBe(10);
    expect(h.pop()!.timeUs).toBe(30);
    expect(h.pop()!.timeUs).toBe(50);
  });
});
