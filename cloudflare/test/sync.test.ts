// Integration tests for the sync engine — delta computation, Kalman reconciliation,
// and CRDT state merge. These validate RQ2 (partition tolerance) at the cloud tier.

import { describe, it, expect } from "vitest";
import { VectorClock } from "../src/vector-clock";
import { MerkleTree } from "../src/merkle";
import type { FederatedDTState } from "../src/types";
import {
  kalmanReconcile,
  computeDelta,
  mergeCRDTStates,
  formationCoherenceError,
} from "../src/sync";

// ─── Test Fixtures ───────────────────────────────────────────────────────────

function makeState(
  auvId: number,
  overrides: Partial<FederatedDTState> = {}
): FederatedDTState {
  const clock = new VectorClock(new Map([[auvId, 1]]));
  return {
    auvId,
    timestamp: Date.now() / 1000,
    clock,
    x: 0, y: 0, z: -10,
    yaw: 0,
    positionVariance: 0.1,
    anomalyDetected: false,
    anomalyDimension: 0,
    healthScore: 200,
    missionPhase: 2,
    ...overrides,
  };
}

// ─── Kalman Reconciliation ───────────────────────────────────────────────────

describe("kalmanReconcile", () => {
  it("accepts remote state when no local exists", () => {
    const local = new Map<number, FederatedDTState>();
    const remote = [makeState(1, { x: 5, y: 3 })];

    const result = kalmanReconcile(local, remote);
    expect(result).toHaveLength(1);
    expect(result[0]!.x).toBe(5);
  });

  it("fuses local and remote using inverse-covariance weighting", () => {
    const local = new Map<number, FederatedDTState>([
      [1, makeState(1, { x: 10, positionVariance: 0.1 })],
    ]);
    const remote = [makeState(1, { x: 20, positionVariance: 1.0 })];

    const result = kalmanReconcile(local, remote);
    // w_local = 10, w_remote = 1 → x ≈ (10*10 + 1*20)/11 ≈ 10.909
    expect(result[0]!.x).toBeCloseTo(10.909, 2);
    expect(result[0]!.positionVariance).toBeCloseTo(1 / 11, 4);
  });

  it("propagates anomaly with OR logic (conservative)", () => {
    const local = new Map<number, FederatedDTState>([
      [1, makeState(1, { anomalyDetected: false })],
    ]);
    const remote = [makeState(1, { anomalyDetected: true, anomalyDimension: 3 })];

    const result = kalmanReconcile(local, remote);
    expect(result[0]!.anomalyDetected).toBe(true);
    expect(result[0]!.anomalyDimension).toBe(3);
  });

  it("takes minimum health score (most conservative)", () => {
    const local = new Map<number, FederatedDTState>([
      [1, makeState(1, { healthScore: 200 })],
    ]);
    const remote = [makeState(1, { healthScore: 50 })];

    const result = kalmanReconcile(local, remote);
    expect(result[0]!.healthScore).toBe(50);
  });

  it("merges vector clocks during reconciliation", () => {
    const localClock = new VectorClock(new Map([[1, 5], [2, 3]]));
    const remoteClock = new VectorClock(new Map([[1, 3], [2, 7]]));

    const local = new Map<number, FederatedDTState>([
      [1, makeState(1, { clock: localClock })],
    ]);
    const remote = [makeState(1, { clock: remoteClock })];

    const result = kalmanReconcile(local, remote);
    const fused = result[0]!.clock as VectorClock;
    expect(fused.clocks.get(1)).toBe(5);
    expect(fused.clocks.get(2)).toBe(7);
  });
});

// ─── Merkle Tree ─────────────────────────────────────────────────────────────

describe("MerkleTree", () => {
  it("produces identical root for identical states", async () => {
    const states = [makeState(1), makeState(2)];
    const tree1 = await MerkleTree.fromStates(states);
    const tree2 = await MerkleTree.fromStates(states);

    expect(tree1.rootEquals(tree2)).toBe(true);
  });

  it("produces different root for different states", async () => {
    const states1 = [makeState(1, { x: 0 })];
    const states2 = [makeState(1, { x: 100 })];

    const tree1 = await MerkleTree.fromStates(states1);
    const tree2 = await MerkleTree.fromStates(states2);

    expect(tree1.rootEquals(tree2)).toBe(false);
  });

  it("diffLeaves identifies divergent leaf indices", async () => {
    const base = [makeState(1), makeState(2), makeState(3)];
    const modified = [makeState(1), makeState(2, { x: 999 }), makeState(3)];

    const tree1 = await MerkleTree.fromStates(base);
    const tree2 = await MerkleTree.fromStates(modified);

    const divergent = tree1.diffLeaves(tree2);
    expect(divergent).toContain(1); // AUV 2 changed (index 1)
    expect(divergent).not.toContain(0);
  });

  it("handles empty state array", async () => {
    const tree = await MerkleTree.fromStates([]);
    expect(tree.root.length).toBe(32); // ZERO_HASH
    expect(tree.leaves.length).toBe(0);
  });

  it("handles single state (root = leaf hash)", async () => {
    const tree = await MerkleTree.fromStates([makeState(1)]);
    expect(tree.leaves.length).toBe(1);
    expect(tree.root).toEqual(tree.leaves[0]);
  });
});

// ─── Delta Computation ───────────────────────────────────────────────────────

describe("computeDelta", () => {
  it("returns empty delta for identical states", async () => {
    const state = makeState(1);
    const local = new Map<number, FederatedDTState>([[1, state]]);
    const remote = new Map<number, FederatedDTState>([[1, { ...state }]]);

    const deltas = await computeDelta(local, remote);
    expect(deltas).toHaveLength(0);
  });

  it("detects changed fields and returns partial delta", async () => {
    const local = new Map<number, FederatedDTState>([
      [1, makeState(1, { x: 10, y: 20, z: 30 })],
    ]);
    const remote = new Map<number, FederatedDTState>([
      [1, makeState(1, { x: 10, y: 20, z: 0 })], // z changed
    ]);

    const deltas = await computeDelta(local, remote);
    expect(deltas.length).toBeGreaterThan(0);
  });

  it("includes full state for new vehicles unknown to remote", async () => {
    const local = new Map<number, FederatedDTState>([
      [1, makeState(1)],
      [2, makeState(2)],
    ]);
    const remote = new Map<number, FederatedDTState>([
      [1, makeState(1)],
    ]);

    const deltas = await computeDelta(local, remote);
    expect(deltas.length).toBeGreaterThan(0);
  });
});

// ─── CRDT State Merge ────────────────────────────────────────────────────────

describe("mergeCRDTStates", () => {
  it("adds new remote states not in local", () => {
    const local = new Map<number, FederatedDTState>();
    const remote = [makeState(1), makeState(2)];

    const merged = mergeCRDTStates(local, remote);
    expect(merged.size).toBe(2);
  });

  it("preserves local state when remote is absent", () => {
    const local = new Map<number, FederatedDTState>([
      [1, makeState(1, { x: 42 })],
    ]);
    const remote: FederatedDTState[] = [];

    const merged = mergeCRDTStates(local, remote);
    expect(merged.get(1)!.x).toBe(42);
  });

  it("fuses overlapping states using PoseCRDT", () => {
    const local = new Map<number, FederatedDTState>([
      [1, makeState(1, { x: 10, positionVariance: 0.1 })],
    ]);
    const remote = [makeState(1, { x: 20, positionVariance: 0.1 })];

    const merged = mergeCRDTStates(local, remote);
    const state = merged.get(1)!;
    // Equal variance → weighted average ≈ 15
    expect(state.x).toBeCloseTo(15, 0);
  });

  it("applies OR-logic for anomaly flags", () => {
    const local = new Map<number, FederatedDTState>([
      [1, makeState(1, { anomalyDetected: true })],
    ]);
    const remote = [makeState(1, { anomalyDetected: false })];

    const merged = mergeCRDTStates(local, remote);
    expect(merged.get(1)!.anomalyDetected).toBe(true);
  });
});

// ─── Formation Coherence Error (RQ2 metric) ──────────────────────────────────

describe("formationCoherenceError", () => {
  it("returns 0 when states match ground truth exactly", () => {
    const states = new Map<number, FederatedDTState>([
      [1, makeState(1, { x: 5, y: 3, z: -10 })],
    ]);
    const gt = new Map<number, { x: number; y: number; z: number }>([
      [1, { x: 5, y: 3, z: -10 }],
    ]);

    expect(formationCoherenceError(states, gt)).toBeCloseTo(0, 10);
  });

  it("computes RMS error correctly for known offset", () => {
    const states = new Map<number, FederatedDTState>([
      [1, makeState(1, { x: 4, y: 0, z: 0 })],
    ]);
    const gt = new Map<number, { x: number; y: number; z: number }>([
      [1, { x: 1, y: 0, z: 0 }],
    ]);

    // sqrt((4-1)^2) = 3.0
    expect(formationCoherenceError(states, gt)).toBeCloseTo(3.0, 5);
  });

  it("returns Infinity for empty state map", () => {
    const states = new Map<number, FederatedDTState>();
    const gt = new Map<number, { x: number; y: number; z: number }>();
    expect(formationCoherenceError(states, gt)).toBe(Infinity);
  });
});
