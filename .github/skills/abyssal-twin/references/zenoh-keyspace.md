# Zenoh Keyspace & Topic Hierarchy

## Topic Structure

```
iort/                              # Root namespace (Internet of Robotic Things — Digital Twin)
├── dt/                            # Digital Twin data
│   ├── {auv_id}/state             # AUV state vectors (47-byte compressed)
│   ├── {auv_id}/anomaly           # Anomaly alert events
│   └── {auv_id}/health            # Health status (future)
├── federation/                    # Federation protocol messages
│   └── *                          # Gossip messages (merkle_root, state_update, etc.)
├── mission/                       # Mission control commands (future)
│   ├── {mission_id}/start
│   ├── {mission_id}/abort
│   └── {mission_id}/waypoint
└── config/                        # Configuration updates (future)
    └── {auv_id}/params
```

## Key Expression Patterns

| Pattern | Matches | Subscribers |
|---|---|---|
| `iort/dt/*/state` | State from any AUV | Rust gateway (zenoh_bridge.rs) |
| `iort/dt/*/anomaly` | Anomalies from any AUV | Rust gateway (zenoh_bridge.rs) |
| `iort/federation/*` | Any federation message | Rust gateway + other AUVs |
| `iort/dt/1/state` | State from AUV-01 only | Specific vehicle monitor |

## HLC Timestamp Behavior

Zenoh automatically attaches a Hybrid Logical Clock (HLC) timestamp to every publication:

```
Timestamp = {
    ntp64: u64,    // Upper 32 bits: seconds since 1970. Lower 32 bits: fraction + counter
    node_uuid: u128  // UUID of the Zenoh router that generated the timestamp
}
```

Properties:
- **Uniqueness**: No two timestamps are identical (counter guarantees)
- **Happens-before**: If event A causally precedes event B, then `timestamp(A) < timestamp(B)`
- **No consensus required**: HLC is a local clock protocol, not a distributed agreement protocol
- **Resolution**: ~3.5 nanoseconds theoretical

### HLC vs Custom VectorClock

The codebase's `VectorClock` provides happens-before ordering via a `HashMap<u8, u64>`. Zenoh HLC timestamps provide equivalent ordering without the HashMap — a single 64-bit value. This is the basis for the Phase 2.4 evaluation of replacing VectorClock with HLC.

**Advantages of HLC**:
- Single 64-bit value vs per-node HashMap
- Generated automatically by Zenoh — no manual `tick()` calls
- Consistent across the entire Zenoh network, not just the federation group

**Advantages of VectorClock**:
- Partial ordering: can detect concurrent (non-comparable) events, not just happens-before
- No dependency on Zenoh infrastructure
- Explicit AUV-level granularity

## QoS & Reliability

Zenoh provides configurable reliability per publisher/subscriber:

```
Reliability:
- Reliable: all messages delivered, in order (TCP-like)
- BestEffort: fire-and-forget, may drop (UDP-like)

CongestionControl:
- Block: backpressure — slow down publisher when network congested
- Drop: drop oldest messages when buffer full
- DropNewest: drop newest messages when buffer full
```

**Acoustic link configuration** (from `docker/zenoh/acoustic.json5`):
- Reliability: BestEffort (acoustic links can't guarantee delivery)
- CongestionControl: Drop (old state is stale — newer state is more valuable)
- Multicast: disabled (point-to-point acoustic)
- Peer mode: enabled for direct AUV-to-AUV communication

## Security Zones

```
┌─────────────────────────────────────────┐
│ Zone: Acoustic (untrusted)              │
│ - Topics: iort/dt/*                     │
│ - Auth: HMAC-8 per-message (optional)   │
│ - Encrypt: Zenoh TLS if modem supports  │
│ - Rate limit: ~23 msg/s at 9600 baud    │
└──────────────┬──────────────────────────┘
               │ Zenoh Router (vessel)
┌──────────────▼──────────────────────────┐
│ Zone: Vessel LAN (trusted)              │
│ - Topics: iort/federation/*             │
│ - Auth: Zenoh user-password             │
│ - Encrypt: Zenoh TLS                    │
│ - Rate: unlimited (wired/wifi)          │
└──────────────┬──────────────────────────┘
               │ Sync Engine (zstd + HTTPS)
┌──────────────▼──────────────────────────┐
│ Zone: Cloudflare (authenticated)         │
│ - API: REST + WebSocket                 │
│ - Auth: Bearer token + JWT (dashboard)  │
│ - Encrypt: HTTPS/WSS                    │
│ - ITAR: CF-IPCountry enforcement        │
└─────────────────────────────────────────┘
```

## Gateway Topic Subscriptions

From `edge-gateway/src/zenoh_bridge.rs`:

```rust
// State subscriber — bincode encoded
let state_sub = session
    .declare_subscriber(&config.acoustic.state_topic)  // "iort/dt/*/state"
    .await?;

// Anomaly subscriber — JSON encoded
let anomaly_sub = session
    .declare_subscriber(&config.acoustic.anomaly_topic)  // "iort/dt/*/anomaly"
    .await?;

// Process both concurrently via tokio::select!
```

## Adding a New Topic

1. Define the key expression under the appropriate namespace (`iort/dt/`, `iort/federation/`, etc.)
2. Update `edge-gateway/src/zenoh_bridge.rs` with a new subscriber if the gateway needs to consume it
3. Update `config.toml` with the new topic string if configurable
4. Document the message format (bincode vs JSON vs raw bytes)
5. Update this reference file
