---
name: abyssal-twin
description: "Domain knowledge for the Abyssal Twin federated digital twin infrastructure for autonomous underwater exploration. Load when working on: 47-byte acoustic compression, CRDT-based state synchronization, Durable Object gossip protocols, CUSUM anomaly detection, bandwidth-adaptive sync engines, Mapbox fleet visualization, Zenoh P2P networking, ROS2 underwater simulation, Kalman filter fusion, Merkle tree anti-entropy, offline-first architecture, point-of-no-return safety calculations, ITAR-compliant data residency, or any code in cloudflare/src/, edge-gateway/src/, src/iort_dt_compression/, src/iort_dt_anomaly/, src/iort_dt_federation/, mission-control/src/, or cloudflare/pages/src/. Provides wire format specs, protocol state machines, D1 schema, SSE contracts, verification procedures, and known issues with workarounds."
argument-hint: "Which reference? wire-format, gossip-protocol, cusum-reference, d1-schema, sse-contract, zenoh-keyspace, known-issues, verification, deployment-checklist"
user-invocable: true
disable-model-invocation: false
---

# Abyssal Twin — Domain Knowledge Skill

## When This Skill Loads

This skill loads automatically when you work on any file or task related to the Abyssal Twin infrastructure. It provides:
- Exact specifications (not summaries — byte-level detail)
- Procedural verification steps
- Known bugs with workarounds
- Cross-tier type mapping tables

**How to use**: The SKILL.md body (<200 lines) gives you the architecture overview and quick reference. For deep detail on a specific domain, load the corresponding reference file from `./references/`. Reference files are loaded only when you explicitly read them — they don't burn context on every invocation.

---

## Architecture at a Glance

```
FLEET TIER (AUV — underwater)     EDGE TIER (Vessel — surface)      CLOUD TIER (Cloudflare — internet)
├── Python: 47-byte compression   ├── Rust: Zenoh bridge (bincode)  ├── TypeScript: Hono REST API
│   AUVStateVector (models.py)    │   zenoh_bridge.rs               │   Durable Object (singleton)
├── Python: CUSUM detection       ├── Rust: SQLite cache (WAL)      │   D1: fleet state, anomalies
│   detectors.py (CUSUM+Shiryaev) │   local_cache.rs (synced flag)  │   R2: ROS2 bags, audit trail
├── Python: PID rate controller   ├── Rust: Bandwidth-adaptive sync │   Pages: React dashboard (SSE)
│   rate_controller.py            │   sync_engine.rs (P0/P1/P2)     │   Mission Control: Mapbox + PNR
├── Rust: Federation protocol     ├── Rust: Replay detector         │
│   VectorClock, MerkleTree       │   Cloudflare REST + WS client   │
│   GossipMessage, Kalman fusion  │   Bandwidth monitor (EMA)       │
│   lib.rs (shared crate)         │   main.rs (tokio::select!)      │
└─────────────────────────────────┴─────────────────────────────────┴────────────────────────────────────┘

Data Flow:
  AUV sensors → 47-byte AUVStateVector → Zenoh pub (iort/dt/{id}/state)
    → Rust Zenoh bridge (bincode deserialize → FederatedDTState)
    → SQLite cache (synced=0)
    → Sync engine (zstd compress → POST /api/v1/ingest)
    → Cloudflare Worker (decompress → D1 insert + DO forward)
    → FederationCoordinator DO (merge → broadcast via WebSocket)
    → Dashboard SSE (poll DO state every 5s → React render)
```

---

## Reference Files (Load on Demand)

| Reference | When to Load | Key Content |
|---|---|---|
| [wire-format](./references/wire-format.md) | Changing compression, adding fields, debugging serialization | Exact byte layout, field ranges, CRC-16 spec, precision bounds |
| [gossip-protocol](./references/gossip-protocol.md) | Modifying DO federation, sync, CRDT | 4-phase state machine, message formats, Kalman fusion math, Merkle tree construction |
| [cusum-reference](./references/cusum-reference.md) | Tuning detection, fixing test failures, validating ARL₀ | Algorithm definition, Siegmund approximation (with caveats), recalibration procedure, Shiryaev-Roberts alternative |
| [d1-schema](./references/d1-schema.md) | Changing DB schema, adding tables/columns, debugging queries | D1 table definitions, indexes (with EXPLAIN), SQLite cache mapping, sync flag semantics |
| [sse-contract](./references/sse-contract.md) | Modifying dashboard data flow, SSE parsing, reconnection | Message formats (DO vs API), reconnection behavior, exponential backoff spec, packet loss testing |
| [zenoh-keyspace](./references/zenoh-keyspace.md) | Adding Zenoh topics, changing key hierarchy, debugging pub/sub | Topic hierarchy, key expression patterns, HLC timestamp semantics, QoS settings |
| [known-issues](./references/known-issues.md) | Encountering bugs, test failures, unexpected behavior | Current bugs with workarounds, test failure explanations, deprecated API usage |
| [verification](./references/verification.md) | Verifying changes, running E2E tests, debugging | Per-subsystem verification procedures, expected outputs, common failure modes |
| [deployment-checklist](./references/deployment-checklist.md) | Preparing for deployment, CI/CD, production release | Pre-deployment checks, environment variables, migration verification, rollback procedure |

---

## Quick Reference: Critical Constraints

| Constraint | Value | Where Enforced |
|---|---|---|
| Wire format size | 47 bytes (52 with Zenoh header) | `models.py:AUVStateVector.to_bytes()` |
| Max messages/sec | ~23 at 9600 baud | `rate_controller.py:AdaptiveRateController` |
| Acoustic latency | 2000ms RTT typical | `rate_controller.py:ChannelMetrics` |
| Packet loss | 30-70% (Markov-modeled) | `rate_controller.py:AcousticChannelSimulator` |
| Partition recovery target | <45 seconds (MEASURED 8–20s, RQ2 sim, all loss levels) | `experiments/rq2_federation/` |
| Fleet coherence target | >95% (MEASURED 99.7% @30% / 96% @50% / 85% @70% loss) | `experiments/rq2_federation/` |
| Compression target | >10:1 (25.5:1 achieved) | `models.py:AUVStateVector` |
| ARL₀ target | >10,000 (12,400 claimed) | `detectors.py:CUSUMDetector` |
| Detection latency target | <120s (<90s claimed) | `detectors.py:ARLBounds.verify_guarantees()` |
| DO CPU limit | 30s per request | `wrangler.toml:limits.cpu_ms` |
| DO alarm interval | ≥30 seconds | `federation-coordinator.ts:alarm()` |
| DO SQL storage | 10GB per object | Cloudflare platform limit |
| DO request rate | 1,000 req/s soft limit | Cloudflare platform limit |

---

## Key File Index

### Cloudflare Workers (TypeScript)
| File | Purpose | ~LOC |
|---|---|---|
| `cloudflare/src/index.ts` | Hono app entry, route registration, simulation SSE | ~150 |
| `cloudflare/src/federation-coordinator.ts` | Singleton DO: gossip, Kalman fusion, alarm, broadcast | ~300 |
| `cloudflare/src/crdt.ts` | LWWRegister, MVRegister, PoseCRDT, GCounter, PNCounter | ~200 |
| `cloudflare/src/sync.ts` | kalmanReconcile, computeDelta, mergeCRDTStates | ~100 |
| `cloudflare/src/merkle.ts` | Merkle tree: fromStates, diffLeaves, rootEquals | ~80 |
| `cloudflare/src/vector-clock.ts` | VectorClock: happensBefore, merge, tick, toBytes | ~80 |
| `cloudflare/src/simulation-engine.ts` | Synthetic AUV telemetry (4 vehicles, 2s interval) | ~100 |
| `cloudflare/src/routes/ingest.ts` | Batch ingest: zstd decompress → D1 + DO forward | ~100 |
| `cloudflare/src/routes/fleet.ts` | GET /fleet/status (5s cache), /fleet/history | ~80 |
| `cloudflare/src/routes/anomalies.ts` | Anomaly list + acknowledge | ~80 |
| `cloudflare/src/routes/metrics-export.ts` | CSV export for RQ1/RQ2/RQ3 | ~100 |
| `cloudflare/src/middleware/auth.ts` | JWT RS256 — **BROKEN**: decodes but never verifies | ~120 |
| `cloudflare/src/middleware/data-residency.ts` | ITAR: CF-IPCountry check, R2 audit | ~80 |
| `cloudflare/src/middleware/metrics.ts` | In-memory Prometheus-compatible metrics | ~100 |

### Edge Gateway (Rust)
| File | Purpose | ~LOC |
|---|---|---|
| `edge-gateway/src/main.rs` | Entry: config parse, env resolution, tokio::select! | ~120 |
| `edge-gateway/src/zenoh_bridge.rs` | Zenoh sub: bincode state + JSON anomaly | ~120 |
| `edge-gateway/src/local_cache.rs` | SQLite: WAL mode, synced flag, partial indexes | ~220 |
| `edge-gateway/src/sync_engine.rs` | Priority upload: P0 anomalies, P1 states, retry | ~150 |
| `edge-gateway/src/bandwidth_monitor.rs` | EMA smoothing, 3-tier — **BUG**: Emergency <50 not <10 | ~100 |
| `edge-gateway/src/cloudflare_client.rs` | REST (zstd upload) + WebSocket client | ~120 |

### Python (Compression + Anomaly)
| File | Purpose | ~LOC |
|---|---|---|
| `src/iort_dt_compression/iort_dt_compression/models.py` | Pose6D (12B), AUVStateVector (47B), CRC-16 | ~200 |
| `src/iort_dt_compression/iort_dt_compression/rate_controller.py` | PID rate control, acoustic channel simulator | ~200 |
| `src/iort_dt_anomaly/iort_dt_anomaly/detectors.py` | CUSUM, Shiryaev-Roberts, ARLBounds, calibrator | ~300 |

### Federation (Rust)
| File | Purpose | ~LOC |
|---|---|---|
| `src/iort_dt_federation/src/lib.rs` | VectorClock, FederatedDTState, MerkleTree, GossipMessage, FederationManager, Kalman | ~400 |

---

## Cross-Tier Type Mapping

| Concept | Python | Rust (bincode) | TypeScript | D1 Column |
|---|---|---|---|---|
| Vehicle ID | `auv_id: uint8` | `auv_id: u8` | `id: number` | `vehicles.id INTEGER` |
| Position (mm) | `x_mm: int16` | `x: f32` (meters) | `poseX: number` | `pose_x REAL` |
| Position variance | — | `position_variance: f32` | `positionVariance: number` | `position_variance REAL` |
| Health | `flags: uint8` (1 bit) | `health_score: u8` (0-255) | `healthScore: number` | `health_score INTEGER` |
| Mission phase | `flags: uint8` (2 bits) | `mission_phase: u8` (0-3) | `missionPhase: number` | `mission_phase INTEGER` |
| Anomaly detected | `flags: uint8` (1 bit) | `anomaly_detected: bool` | `anomalyDetected: boolean` | `anomaly_detected INTEGER` |
| Timestamp | `timestamp: float64` | `timestamp: f64` | `timestamp: number` | `timestamp TEXT` (ISO 8601) |

**Precision warning**: Python `int16` (mm) → Rust `f32` (meters) conversion loses sub-mm precision. Roundtrip: `f32(int16_mm / 1000.0)` → `int16(f32_m * 1000.0)`. Error <1mm at 95th percentile for values within ±32.7m range.

---

## Verification Commands

```bash
# Full test suite
make test-all                        # Rust + Python + E2E
npm test                             # TypeScript (from cloudflare/)

# Per-subsystem
cargo test --manifest-path edge-gateway/Cargo.toml          # Rust edge gateway
cargo test --manifest-path src/iort_dt_federation/Cargo.toml # Rust federation
poetry run pytest                                             # Python compression
poetry run pytest src/iort_dt_anomaly/                        # Python CUSUM

# Integration
scripts/test-e2e.sh                  # 7-phase validation
scripts/validate-infrastructure.sh   # Project structure + dependencies

# Docker
docker compose -f docker/docker-compose.simulation.yml up    # Full stack

# Dashboard dev
cd cloudflare && npm run dev            # API (localhost:8787)
cd mission-control && npm run dev       # Dashboard (localhost:3000)
```

---

## Quick Start: Common Tasks

### "I need to add a new field to the state vector"
1. Load [wire-format](./references/wire-format.md) — understand current byte budget
2. Propose: which existing field shrinks or is removed?
3. Update: `models.py:AUVStateVector` → `lib.rs:FederatedDTState` → `types.ts:VehicleStatus` → D1 migration
4. Run: `make test-all` — ALL tests must pass, including cross-tier roundtrip

### "I need to fix a failing CUSUM test"
1. Load [cusum-reference](./references/cusum-reference.md) — understand Siegmund caveat
2. Run empirical calibration: `ARLBounds.compute_threshold_for_arl0(target=10000)`
3. Update `threshold_h` in test or mark as `@pytest.mark.xfail` with documented reason
4. Run: `poetry run pytest src/iort_dt_anomaly/ -v`

### "I need to verify the dashboard shows live data"
1. Load [sse-contract](./references/sse-contract.md) — understand message formats
2. Load [verification](./references/verification.md) — follow dashboard verification procedure
3. Start: `cd cloudflare && npm run dev` + `cd mission-control && npm run dev`
4. Check: simulation SSE at `/api/v1/simulate`, dashboard at `localhost:3000`

### "I need to deploy to Cloudflare"
1. Load [deployment-checklist](./references/deployment-checklist.md)
2. Run: `scripts/validate-infrastructure.sh`
3. Run: `scripts/test-e2e.sh`
4. Deploy: `cd cloudflare && npx wrangler deploy`
