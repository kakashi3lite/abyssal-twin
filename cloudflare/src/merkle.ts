// IoRT-DT: Merkle tree over fleet DT state.
// Port of Rust MerkleTree from src/iort_dt_federation/src/lib.rs (lines 127-173).
//
// Used for efficient anti-entropy gossip: nodes compare root hashes first,
// then drill down to find divergent leaves — minimizing acoustic traffic.
// Uses Web Crypto SHA-256 (available in Cloudflare Workers and modern browsers).

import type { FederatedDTState } from "./types";

/** 32-byte SHA-256 hash represented as Uint8Array. */
type Hash = Uint8Array;

const ZERO_HASH = new Uint8Array(32);

export class MerkleTree {
  public leaves: Hash[];
  public root: Hash;

  private constructor(leaves: Hash[], root: Hash) {
    this.leaves = leaves;
    this.root = root;
  }

  /** Build a Merkle tree from fleet states (mirrors Rust from_states). */
  static async fromStates(states: FederatedDTState[]): Promise<MerkleTree> {
    const leaves = await Promise.all(states.map(merkleHash));
    const root = await computeRoot(leaves);
    return new MerkleTree(leaves, root);
  }

  /** Identify divergent leaf indices between two trees. */
  diffLeaves(other: MerkleTree): number[] {
    const divergent: number[] = [];
    const len = Math.min(this.leaves.length, other.leaves.length);

    for (let i = 0; i < len; i++) {
      if (!hashEquals(this.leaves[i]!, other.leaves[i]!)) {
        divergent.push(i);
      }
    }

    // Any extra leaves in either tree are also divergent
    for (let i = len; i < Math.max(this.leaves.length, other.leaves.length); i++) {
      divergent.push(i);
    }
    return divergent;
  }

  /** Check if two trees have the same root. */
  rootEquals(other: MerkleTree): boolean {
    return hashEquals(this.root, other.root);
  }
}

// ─── Hashing helpers ────────────────────────────────────────────────────────

/**
 * Compute the Merkle hash of a single FederatedDTState.
 * Mirrors Rust FederatedDTState::merkle_hash() — hashes auv_id, timestamp,
 * x, y, z, and vector clock bytes using SHA-256.
 */
async function merkleHash(state: FederatedDTState): Promise<Hash> {
  const buf = new ArrayBuffer(1 + 8 + 4 + 4 + 4);
  const view = new DataView(buf);

  // Match Rust's to_le_bytes() ordering
  view.setUint8(0, state.auvId);
  view.setFloat64(1, state.timestamp, true); // little-endian
  view.setFloat32(9, state.x, true);
  view.setFloat32(13, state.y, true);
  view.setFloat32(17, state.z, true);

  const clockBytes = state.clock.toBytes();

  // Concatenate state bytes + clock bytes
  const combined = new Uint8Array(buf.byteLength + clockBytes.length);
  combined.set(new Uint8Array(buf), 0);
  combined.set(clockBytes, buf.byteLength);

  const digest = await crypto.subtle.digest("SHA-256", combined);
  return new Uint8Array(digest);
}

/**
 * Compute Merkle root from leaf hashes.
 * Mirrors Rust MerkleTree::compute_root() — pairs leaves bottom-up,
 * duplicating the last leaf if the count is odd.
 */
async function computeRoot(leaves: Hash[]): Promise<Hash> {
  if (leaves.length === 0) return ZERO_HASH;
  if (leaves.length === 1) return leaves[0]!;

  let currentLevel = [...leaves];

  while (currentLevel.length > 1) {
    const nextLevel: Hash[] = [];

    for (let i = 0; i < currentLevel.length; i += 2) {
      const left = currentLevel[i]!;
      // If odd number of nodes, duplicate the last one (matches Rust behavior)
      const right = i + 1 < currentLevel.length ? currentLevel[i + 1]! : left;

      const combined = new Uint8Array(64);
      combined.set(left, 0);
      combined.set(right, 32);

      const digest = await crypto.subtle.digest("SHA-256", combined);
      nextLevel.push(new Uint8Array(digest));
    }

    currentLevel = nextLevel;
  }

  return currentLevel[0]!;
}

/** Constant-time comparison of two 32-byte hashes. */
function hashEquals(a: Hash, b: Hash): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return result === 0;
}
