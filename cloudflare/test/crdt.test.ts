// Integration tests for CRDT implementations — partition-tolerant fleet state sync.
// Validates LWWRegister, MVRegister, GCounter, PNCounter, and PoseCRDT.

import { describe, it, expect } from "vitest";
import {
  LWWRegister,
  MVRegister,
  GCounter,
  PNCounter,
  PoseCRDT,
} from "../src/crdt";

// ─── LWWRegister ─────────────────────────────────────────────────────────────

describe("LWWRegister", () => {
  it("merge keeps the value with higher timestamp", () => {
    const a = new LWWRegister("old", 100, "auv-1");
    const b = new LWWRegister("new", 200, "auv-2");
    const merged = a.merge(b);

    expect(merged.value).toBe("new");
    expect(merged.timestamp).toBe(200);
  });

  it("merge uses source ID for tie-breaking", () => {
    const a = new LWWRegister("from-a", 100, "auv-1");
    const b = new LWWRegister("from-b", 100, "auv-2");
    const merged = a.merge(b);

    // "auv-2" > "auv-1" lexicographically → b wins
    expect(merged.value).toBe("from-b");
  });

  it("serializes to/from JSON", () => {
    const original = new LWWRegister("active", 42, "support-1");
    const json = original.toJSON();
    const restored = LWWRegister.fromJSON(json);

    expect(restored.value).toBe("active");
    expect(restored.timestamp).toBe(42);
    expect(restored.source).toBe("support-1");
  });
});

// ─── GCounter ────────────────────────────────────────────────────────────────

describe("GCounter", () => {
  it("increments per-node counters", () => {
    const gc = new GCounter();
    gc.increment("auv-1", 3);
    gc.increment("auv-2", 7);

    expect(gc.value()).toBe(10);
  });

  it("merge takes component-wise maximum", () => {
    const a = new GCounter(new Map([["auv-1", 5], ["auv-2", 3]]));
    const b = new GCounter(new Map([["auv-1", 3], ["auv-2", 7], ["auv-3", 2]]));
    const merged = a.merge(b);

    expect(merged.value()).toBe(14); // max(5,3) + max(3,7) + 2
    expect(merged.counts.get("auv-1")).toBe(5);
    expect(merged.counts.get("auv-2")).toBe(7);
    expect(merged.counts.get("auv-3")).toBe(2);
  });

  it("serializes to/from JSON", () => {
    const original = new GCounter(new Map([["a", 1], ["b", 2]]));
    const json = original.toJSON();
    const restored = GCounter.fromJSON(json);

    expect(restored.value()).toBe(original.value());
  });
});

// ─── PNCounter ───────────────────────────────────────────────────────────────

describe("PNCounter", () => {
  it("tracks increments and decrements", () => {
    const pn = new PNCounter();
    pn.increment("auv-1", 10);
    pn.decrement("auv-1", 3);

    expect(pn.value()).toBe(7);
  });

  it("merge preserves both positive and negative counters", () => {
    const a = new PNCounter();
    a.increment("auv-1", 5);
    a.decrement("auv-1", 2);

    const b = new PNCounter();
    b.increment("auv-1", 3);
    b.increment("auv-2", 4);

    const merged = a.merge(b);
    // positive: max(5,3) + 4 = 9, negative: 2
    expect(merged.value()).toBe(7);
  });

  it("serializes to/from JSON", () => {
    const pn = new PNCounter();
    pn.increment("x", 10);
    pn.decrement("x", 3);

    const json = pn.toJSON();
    const restored = PNCounter.fromJSON(json);
    expect(restored.value()).toBe(7);
  });
});

// ─── MVRegister ──────────────────────────────────────────────────────────────

describe("MVRegister", () => {
  it("keeps concurrent (non-dominated) values", () => {
    const reg = new MVRegister<number>([]);

    // Two concurrent updates from different sources
    const r1 = reg.set(10, { "auv-1": 1 }, "source-a");
    const r2 = reg.set(20, { "auv-2": 1 }, "source-b");

    const merged = r1.merge(r2);
    // Both entries should survive (neither dominates the other)
    expect(merged.entries.length).toBe(2);
  });

  it("removes dominated values", () => {
    const reg = new MVRegister<number>([]);
    const r1 = reg.set(10, { "auv-1": 1, "auv-2": 0 }, "source-a");
    // This clock dominates the previous one
    const r2 = r1.set(20, { "auv-1": 2, "auv-2": 1 }, "source-a");

    expect(r2.entries.length).toBe(1);
    expect(r2.entries[0]!.value).toBe(20);
  });

  it("resolve returns single value when only one entry", () => {
    const reg = new MVRegister<string>([
      { value: "hello", clock: { a: 1 }, source: "s" },
    ]);
    const resolved = reg.resolve(() => "conflict");
    expect(resolved).toBe("hello");
  });
});

// ─── PoseCRDT ────────────────────────────────────────────────────────────────

describe("PoseCRDT", () => {
  it("resolves single pose directly", () => {
    const crdt = new PoseCRDT([
      {
        value: { x: 1, y: 2, z: 3, yaw: 0.5, positionVariance: 0.1, timestamp: 100, source: "auv" },
        clock: { "1": 1 },
        source: "auv-1",
      },
    ]);
    const resolved = crdt.resolve();
    expect(resolved.x).toBe(1);
    expect(resolved.y).toBe(2);
    expect(resolved.z).toBe(3);
  });

  it("fuses concurrent poses using inverse-covariance weighting", () => {
    // AUV has low variance (high certainty), support has high variance
    const crdt = new PoseCRDT([
      {
        value: { x: 10, y: 0, z: 0, yaw: 0, positionVariance: 0.01, timestamp: 100, source: "auv" },
        clock: { "1": 1 },
        source: "auv",
      },
      {
        value: { x: 20, y: 0, z: 0, yaw: 0, positionVariance: 1.0, timestamp: 100, source: "support" },
        clock: { "2": 1 },
        source: "support",
      },
    ]);

    const resolved = crdt.resolve();

    // The fused position should be much closer to the AUV estimate (low variance)
    // w_auv = 1/0.01 = 100, w_support = 1/1.0 = 1
    // x_fused = (100*10 + 1*20) / 101 ≈ 10.099
    expect(resolved.x).toBeCloseTo(10.099, 2);
    expect(resolved.positionVariance).toBeCloseTo(1 / 101, 4);
  });

  it("merge combines entries from two partitioned views", () => {
    const a = new PoseCRDT([
      {
        value: { x: 1, y: 0, z: 0, yaw: 0, positionVariance: 0.1, timestamp: 100, source: "auv" },
        clock: { "1": 1 },
        source: "a",
      },
    ]);

    const b = new PoseCRDT([
      {
        value: { x: 2, y: 0, z: 0, yaw: 0, positionVariance: 0.1, timestamp: 100, source: "support" },
        clock: { "2": 1 },
        source: "b",
      },
    ]);

    const merged = a.merge(b);
    const resolved = merged.resolve();
    // Equal variance → average
    expect(resolved.x).toBeCloseTo(1.5, 1);
  });
});
