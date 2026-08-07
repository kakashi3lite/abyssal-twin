# Gossip Protocol — 4-Phase State Machine

## Overview

The federation gossip protocol synchronizes fleet state between the support vessel (Rust edge gateway) and the Cloudflare FederationCoordinator Durable Object. It uses Merkle tree anti-entropy to minimize bandwidth: only divergent state is transmitted.

## State Machine

```
                     ┌─────────────┐
                     │   IDLE      │
                     └──────┬──────┘
                            │ timer/event
                            ▼
                     ┌─────────────┐
          ┌──────────│ MERKLE_ROOT │◄──────────────┐
          │          └──────┬──────┘               │
          │ roots match     │ roots differ          │
          │ (no action)     ▼                       │
          │          ┌─────────────┐               │
          │          │REQUEST_LEAVES│               │
          │          └──────┬──────┘               │
          │                 │                      │
          │                 ▼                      │
          │          ┌─────────────┐               │
          │          │ STATE_UPDATE│───────────────┤
          │          └──────┬──────┘               │
          │                 │                      │
          │          ┌──────▼──────┐               │
          │          │ MERGE/DONE  │               │
          │          └──────┬──────┘               │
          │                 │ partition detected    │
          │                 ▼                      │
          │          ┌─────────────┐               │
          └──────────│PARTITION_HEAL│──────────────┘
                     └─────────────┘
```

## Message Formats

### Phase 1: MerkleRoot

Purpose: Compare fleet state with minimal data (32 bytes).

```rust
GossipMessage::MerkleRoot {
    from_auv: u8,           // Sender's AUV/vessel ID
    root: [u8; 32],         // SHA-256 Merkle root of all known AUV states
    n_auvs: u8,             // Number of AUVs in the tree
}
```

Wire size: 1 + 32 + 1 = 34 bytes + bincode overhead.

### Phase 2: RequestLeaves

Purpose: Request specific AUV states where Merkle leaves differ.

```rust
GossipMessage::RequestLeaves {
    from_auv: u8,
    requested_auv_ids: Vec<u8>,  // AUV IDs whose states are needed
}
```

### Phase 3: StateUpdate

Purpose: Provide requested states. Merge uses timestamp ordering (newer wins).

```rust
GossipMessage::StateUpdate {
    from_auv: u8,
    states: Vec<FederatedDTState>,
}
```

### Phase 4: PartitionHeal

Purpose: Full Kalman-weighted fusion after reconnection. Uses inverse-covariance weighting.

```rust
GossipMessage::PartitionHeal {
    from_auv: u8,
    states: Vec<FederatedDTState>,
    disconnection_duration_s: f64,  // How long the partition lasted
}
```

## Kalman Fusion (PartitionHeal)

When two or more agents have conflicting state for the same AUV (after a partition), fusion resolves conflicts via inverse-covariance weighting:

```
w_i = 1 / (σ²_i + ε)        where ε = 1e-6 (prevents division by zero)
x_fused = Σ(w_i · x_i) / Σ(w_i)
σ²_fused = 1 / Σ(w_i)       (harmonic mean of variances)
```

Conservative merge rules:
- `anomaly_detected`: OR (if ANY agent detected anomaly → fused state has anomaly)
- `health_score`: MIN (use the most pessimistic health estimate)
- `mission_phase`: remote wins (newer timestamp)
- `position_variance`: harmonic mean (as above)

## Merkle Tree Construction

```typescript
// From cloudflare/src/merkle.ts
MerkleTree.fromStates(states: FederatedDTState[]): MerkleTree {
    // 1. Hash each state: SHA-256(auvId || timestamp || x || y || z || clock.toBytes())
    //    Total per leaf: 1 + 8 + 4 + 4 + 4 + (n_entries × 9) bytes → 32-byte hash
    // 2. Build tree bottom-up: pair leaves, SHA-256(left || right)
    // 3. If odd number of leaves, duplicate the last one
}
```

- Empty tree root: 32 zero bytes (`ZERO_HASH`)
- Single leaf: leaf hash = root hash
- `diffLeaves(other)`: O(n) comparison of leaf hashes → returns indices where they differ
- `rootEquals(other)`: Constant-time XOR accumulator comparison

## Vector Clock (May Be Replaced by Zenoh HLC)

The custom VectorClock tracks causality across the AUV fleet:

```typescript
class VectorClock {
    clocks: Map<auvId, logicalTime>;
    tick(auvId): increment local counter;
    merge(other): component-wise max;
    happensBefore(other): ∀k this[k] ≤ other[k] ∧ this ≠ other;
    toBytes(): sorted by auvId, each = 1B id + 8B f64le time;
}
```

**Evaluation note**: Zenoh's built-in Hybrid Logical Clocks (HLC) provide happens-before ordering without consensus. If HLC can replace VectorClock, approximately 300 lines of code can be removed across TypeScript and Rust. Test by replacing VectorClock with Zenoh HLC timestamps and verifying that all CRDT merge tests still pass.

## Durable Object Integration

The `FederationCoordinator` DO (`cloudflare/src/federation-coordinator.ts`) implements the server side:

- `handleWebSocketUpgrade()`: Accepts WebSocket, stores `{vesselId, connectedAt, lastHeartbeat}` in DO storage
- `handleGetState()`: Returns current `fleetStates` as JSON
- `handleIngest()`: Merges incoming states via timestamp ordering, then broadcasts
- `alarm()` (every 30s): Persists fleetStates to DO storage, detects partitioned vessels (no heartbeat >2 min), checkpoints to D1
- `broadcastState()`: Sends StateUpdate to all connected WebSockets

## Rust Gateway Integration

The Rust sync engine (`edge-gateway/src/sync_engine.rs`) implements the client side:

- REST: `POST /api/v1/ingest` with zstd-compressed payload (primary sync path)
- WebSocket: `wss://.../ws/live?vesselId={id}` — future/optional Full-tier sync path
- Retry: exponential backoff 1s → 2s → 4s → 8s → ... → 300s cap, 5 attempts max
- Offline: rows remain `synced=0` in SQLite, retried next cycle

## Testing the Gossip Protocol

```bash
# DO gossip integration tests
cd cloudflare && npm test -- --testPathPattern="sync.test"

# Rust federation unit tests
cargo test --manifest-path src/iort_dt_federation/Cargo.toml

# Manual: connect two simulated vessels via wscat
wscat -c ws://localhost:8787/ws/live?vesselId=1
wscat -c ws://localhost:8787/ws/live?vesselId=2
# Send merkle_root message, observe state_update response
```
