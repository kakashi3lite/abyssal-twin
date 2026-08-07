// IoRT-DT: State reconciliation and delta sync logic.
// Implements the partition-tolerant sync protocol between vessel and cloud.
//
// Key operations:
//   - kalmanReconcile(): Weighted fusion after partition heal
//   - computeDelta(): Efficient diff for bandwidth-limited sync
//   - mergeCRDTStates(): CRDT merge for each field type

import { VectorClock } from "./vector-clock";
import { MerkleTree } from "./merkle";
import { PoseCRDT } from "./crdt";
import type { FederatedDTState } from "./types";

// ─── Kalman Reconciliation ──────────────────────────────────────────────────
// Port of Rust FederationManager::kalman_reconcile() from lib.rs lines 313-360.

/**
 * Reconcile local and remote fleet states using inverse-covariance weighting.
 * Called when a partitioned vessel reconnects.
 *
 * For each AUV with both local and remote estimates:
 *   x_fused = (w_local * x_local + w_remote * x_remote) / (w_local + w_remote)
 *   w_i = 1 / (sigma^2_i + epsilon)
 */
export function kalmanReconcile(
  localStates: Map<number, FederatedDTState>,
  remoteStates: FederatedDTState[]
): FederatedDTState[] {
  const reconciled: FederatedDTState[] = [];
  const EPSILON = 1e-10;

  for (const remote of remoteStates) {
    const local = localStates.get(remote.auvId);

    if (!local) {
      // No local estimate: accept remote directly
      reconciled.push(remote);
      continue;
    }

    const wLocal = 1.0 / (local.positionVariance + EPSILON);
    const wRemote = 1.0 / (remote.positionVariance + EPSILON);
    const wTotal = wLocal + wRemote;

    // Merge vector clocks
    const mergedClock = ensureVectorClock(local.clock);
    mergedClock.merge(ensureVectorClock(remote.clock));

    const fused: FederatedDTState = {
      auvId: remote.auvId,
      timestamp: Math.max(local.timestamp, remote.timestamp),
      clock: mergedClock,
      x: (wLocal * local.x + wRemote * remote.x) / wTotal,
      y: (wLocal * local.y + wRemote * remote.y) / wTotal,
      z: (wLocal * local.z + wRemote * remote.z) / wTotal,
      yaw: (wLocal * local.yaw + wRemote * remote.yaw) / wTotal,
      positionVariance: 1.0 / wTotal,
      // Conservative anomaly propagation (OR logic)
      anomalyDetected: local.anomalyDetected || remote.anomalyDetected,
      anomalyDimension: remote.anomalyDetected
        ? remote.anomalyDimension
        : local.anomalyDimension,
      healthScore: Math.min(local.healthScore, remote.healthScore),
      missionPhase: remote.missionPhase,
    };

    reconciled.push(fused);
  }

  return reconciled;
}

// ─── Delta Computation ──────────────────────────────────────────────────────

/** Represents a state change for efficient satellite transmission. */
export interface StateDelta {
  auvId: number;
  changedFields: Partial<FederatedDTState>;
  merkleLeafHash: Uint8Array;
}

/**
 * Compute the delta between local and remote fleet states.
 * Only includes fields that have actually changed, reducing satellite bytes.
 */
export async function computeDelta(
  localStates: Map<number, FederatedDTState>,
  remoteStates: Map<number, FederatedDTState>
): Promise<StateDelta[]> {
  const deltas: StateDelta[] = [];

  // Build Merkle trees for efficient divergence detection
  const localArray = [...localStates.values()].sort((a, b) => a.auvId - b.auvId);
  const remoteArray = [...remoteStates.values()].sort((a, b) => a.auvId - b.auvId);

  const localTree = await MerkleTree.fromStates(localArray);
  const remoteTree = await MerkleTree.fromStates(remoteArray);

  if (localTree.rootEquals(remoteTree)) {
    return []; // States are identical, no sync needed
  }

  // Find divergent leaves
  const divergentIndices = localTree.diffLeaves(remoteTree);

  for (const idx of divergentIndices) {
    const localState = localArray[idx];
    if (!localState) continue;

    const remoteState = remoteStates.get(localState.auvId);

    if (!remoteState) {
      // New vehicle not known to remote — send full state
      deltas.push({
        auvId: localState.auvId,
        changedFields: localState,
        merkleLeafHash: localTree.leaves[idx]!,
      });
      continue;
    }

    // Compute field-level diff
    const changed: Partial<FederatedDTState> = {};
    if (localState.x !== remoteState.x) changed.x = localState.x;
    if (localState.y !== remoteState.y) changed.y = localState.y;
    if (localState.z !== remoteState.z) changed.z = localState.z;
    if (localState.yaw !== remoteState.yaw) changed.yaw = localState.yaw;
    if (localState.positionVariance !== remoteState.positionVariance) {
      changed.positionVariance = localState.positionVariance;
    }
    if (localState.anomalyDetected !== remoteState.anomalyDetected) {
      changed.anomalyDetected = localState.anomalyDetected;
    }
    if (localState.healthScore !== remoteState.healthScore) {
      changed.healthScore = localState.healthScore;
    }
    if (localState.missionPhase !== remoteState.missionPhase) {
      changed.missionPhase = localState.missionPhase;
    }

    if (Object.keys(changed).length > 0) {
      changed.auvId = localState.auvId;
      changed.timestamp = localState.timestamp;
      deltas.push({
        auvId: localState.auvId,
        changedFields: changed,
        merkleLeafHash: localTree.leaves[idx]!,
      });
    }
  }

  return deltas;
}

// ─── CRDT State Merge ───────────────────────────────────────────────────────

/**
 * Merge fleet states using CRDT semantics.
 * Each field type uses its appropriate CRDT:
 *   - Position: PoseCRDT (Kalman-weighted MVRegister)
 *   - Scalar fields: LWW by timestamp
 *   - Anomaly flags: OR-set (conservative)
 */
export function mergeCRDTStates(
  localStates: Map<number, FederatedDTState>,
  remoteStates: FederatedDTState[]
): Map<number, FederatedDTState> {
  const merged = new Map(localStates);

  for (const remote of remoteStates) {
    const local = merged.get(remote.auvId);

    if (!local) {
      merged.set(remote.auvId, remote);
      continue;
    }

    // Use PoseCRDT for position resolution
    const localClock = ensureVectorClock(local.clock);
    const remoteClock = ensureVectorClock(remote.clock);

    const poseCrdt = new PoseCRDT([
      {
        value: {
          x: local.x, y: local.y, z: local.z, yaw: local.yaw,
          positionVariance: local.positionVariance,
          timestamp: local.timestamp,
          source: "support" as const,
        },
        clock: localClock.toJSON(),
        source: "local",
      },
      {
        value: {
          x: remote.x, y: remote.y, z: remote.z, yaw: remote.yaw,
          positionVariance: remote.positionVariance,
          timestamp: remote.timestamp,
          source: "cloud" as const,
        },
        clock: remoteClock.toJSON(),
        source: "remote",
      },
    ]);

    const resolved = poseCrdt.resolve();

    // Merge vector clocks
    const mergedClock = localClock;
    mergedClock.merge(remoteClock);

    merged.set(remote.auvId, {
      auvId: remote.auvId,
      timestamp: Math.max(local.timestamp, remote.timestamp),
      clock: mergedClock,
      x: resolved.x,
      y: resolved.y,
      z: resolved.z,
      yaw: resolved.yaw,
      positionVariance: resolved.positionVariance,
      anomalyDetected: local.anomalyDetected || remote.anomalyDetected,
      anomalyDimension: remote.anomalyDetected
        ? remote.anomalyDimension
        : local.anomalyDimension,
      healthScore: Math.min(local.healthScore, remote.healthScore),
      missionPhase: remote.timestamp > local.timestamp
        ? remote.missionPhase
        : local.missionPhase,
    });
  }

  return merged;
}

// ─── Formation Coherence Error (RQ2 metric) ─────────────────────────────────

/**
 * Compute RMS position error vs ground truth.
 * Port of Rust formation_coherence_error() from lib.rs lines 378-403.
 */
export function formationCoherenceError(
  states: Map<number, FederatedDTState>,
  groundTruth: Map<number, { x: number; y: number; z: number }>
): number {
  const errors: number[] = [];

  for (const [id, state] of states) {
    const gt = groundTruth.get(id);
    if (!gt) continue;

    const dx = state.x - gt.x;
    const dy = state.y - gt.y;
    const dz = state.z - gt.z;
    errors.push(Math.sqrt(dx * dx + dy * dy + dz * dz));
  }

  if (errors.length === 0) return Infinity;

  const mse = errors.reduce((sum, e) => sum + e * e, 0) / errors.length;
  return Math.sqrt(mse);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Ensure a clock object is a proper VectorClock instance. */
function ensureVectorClock(clock: VectorClock | Record<string, number>): VectorClock {
  if (clock instanceof VectorClock) return clock;
  return VectorClock.fromJSON(clock as Record<string, number>);
}
