// Integration tests for VectorClock — causality tracking for the AUV fleet.
// Validates the TypeScript port matches Rust VectorClock behavior.

import { describe, it, expect } from "vitest";
import { VectorClock } from "../src/vector-clock";

describe("VectorClock", () => {
  it("initializes with empty clocks", () => {
    const vc = new VectorClock();
    expect(vc.clocks.size).toBe(0);
  });

  it("tick increments the correct AUV counter", () => {
    const vc = new VectorClock();
    vc.tick(1);
    vc.tick(1);
    vc.tick(2);

    expect(vc.clocks.get(1)).toBe(2);
    expect(vc.clocks.get(2)).toBe(1);
  });

  it("merge takes component-wise maximum", () => {
    const a = new VectorClock(new Map([[1, 3], [2, 1]]));
    const b = new VectorClock(new Map([[1, 1], [2, 5], [3, 2]]));

    a.merge(b);
    expect(a.clocks.get(1)).toBe(3); // max(3,1)
    expect(a.clocks.get(2)).toBe(5); // max(1,5)
    expect(a.clocks.get(3)).toBe(2); // new entry from b
  });

  it("happensBefore detects strict causal ordering", () => {
    const a = new VectorClock(new Map([[1, 1], [2, 2]]));
    const b = new VectorClock(new Map([[1, 2], [2, 3]]));

    expect(a.happensBefore(b)).toBe(true);
    expect(b.happensBefore(a)).toBe(false);
  });

  it("happensBefore returns false for concurrent clocks", () => {
    // Concurrent: a has higher clock for AUV 1, b has higher for AUV 2
    const a = new VectorClock(new Map([[1, 3], [2, 1]]));
    const b = new VectorClock(new Map([[1, 1], [2, 5]]));

    expect(a.happensBefore(b)).toBe(false);
    expect(b.happensBefore(a)).toBe(false);
  });

  it("happensBefore returns false for equal clocks", () => {
    const a = new VectorClock(new Map([[1, 2]]));
    const b = new VectorClock(new Map([[1, 2]]));

    expect(a.happensBefore(b)).toBe(false);
  });

  it("equals checks deep equality", () => {
    const a = new VectorClock(new Map([[1, 2], [2, 3]]));
    const b = new VectorClock(new Map([[1, 2], [2, 3]]));
    const c = new VectorClock(new Map([[1, 2]]));

    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
  });

  it("serializes to/from JSON roundtrip", () => {
    const original = new VectorClock(new Map([[1, 5], [42, 100]]));
    const json = original.toJSON();
    const restored = VectorClock.fromJSON(json);

    expect(restored.equals(original)).toBe(true);
  });

  it("toBytes produces deterministic output sorted by AUV ID", () => {
    const a = new VectorClock(new Map([[2, 1], [1, 2]]));
    const b = new VectorClock(new Map([[1, 2], [2, 1]]));

    // Same logical state → same bytes regardless of insertion order
    const bytesA = a.toBytes();
    const bytesB = b.toBytes();
    expect(bytesA).toEqual(bytesB);
  });

  it("toBytes encodes each entry as 1+8 bytes", () => {
    const vc = new VectorClock(new Map([[1, 1], [2, 2], [3, 3]]));
    const bytes = vc.toBytes();
    // 3 entries × 9 bytes each = 27 bytes
    expect(bytes.length).toBe(27);
  });
});
