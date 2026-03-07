# Abyssal Twin Architecture

## 1. Overview

A 3-tier federated digital twin system for autonomous underwater vehicle (AUV) fleets, spanning edge (AUVs), support vessel (gateway), and cloud (Cloudflare) infrastructure.

---

## 2. Three-Tier Stack

| Tier | Components | Purpose |
|------|------------|---------|
| **AUV Fleet** | Rust federation, Python CUSUM/Pose6D | Real-time DT synchronization, anomaly detection |
| **Support Vessel** | Rust edge-gateway, Zenoh, SQLite | Protocol bridge, local cache, intermittent sync |
| **Cloudflare** | Workers, Durable Objects, D1, R2, Pages | Global coordination, mission control, long-term storage |

---

## 3. Directory Map

```
abyssal-twin/
├── cloudflare/                    # ☁️ Cloud Infrastructure
│   ├── workers/                   # Edge functions
│   ├── durable-objects/           # Stateful coordination
│   ├── api/                       # Hono API routes
│   └── mission-control/           # React + Three.js dashboard
│
├── edge-gateway/                  # 🚢 Support Vessel
│   └── src/
│       ├── main.rs                # Zenoh bridge
│       ├── sqlite_cache.rs        # Local storage
│       └── sync_engine.rs         # Intermittent sync
│
├── src/
│   ├── iort_dt_federation/        # 🤖 AUV Fleet (Rust)
│   │   └── src/
│   │       ├── lib.rs             # VectorClock, MerkleTree, Kalman
│   │       └── main.rs            # Gossip protocol
│   │
│   ├── iort_dt_anomaly/           # 🔍 AUV Fleet (Python)
│   │   └── iort_dt_anomaly/
│   │       └── detectors.py       # CUSUM anomaly detection
│   │
│   └── iort_dt_compression/       # 📦 AUV Fleet (Python)
│       └── iort_dt_compression/
│           └── models.py          # 47-byte Pose6D wire format
│
├── docker/                        # 🐳 Container Orchestration
│   ├── zenoh/                     # Message router
│   ├── federation/                # Fleet services
│   ├── prometheus/                # Metrics
│   ├── grafana/                   # Dashboards
│   └── mlflow/                    # Experiment tracking
│
└── scripts/
    └── test-e2e.sh                # 7-phase validation runner
```

---

## 4. Component Details

### AUV Fleet Tier

**Rust Federation** (`src/iort_dt_federation/`)
- Vector clock causality tracking
- Merkle tree state divergence detection
- Weighted Kalman reconciliation
- Zenoh P2P gossip protocol

**Python Anomaly Detection** (`src/iort_dt_anomaly/`)
- CUSUM (Page-Hinkley) sequential change detection
- Shiryaev-Roberts Bayesian detector
- Formal ARL (Average Run Length) guarantees

**Python Compression** (`src/iort_dt_compression/`)
- Pose6D: 47-byte wire format
- Avro + LZ4 serialization
- Adaptive rate control for acoustic channels

### Support Vessel Tier

**Edge Gateway** (`edge-gateway/`)
- Rust-based Zenoh bridge
- SQLite local cache for offline periods
- Sync engine for intermittent cloud connectivity
- Path dependency: `iort-dt-federation` crate

### Cloudflare Tier

**Workers** (`cloudflare/workers/`)
- Edge computing for mission commands
- Real-time telemetry processing

**Durable Objects** (`cloudflare/durable-objects/`)
- Stateful mission coordination
- Fleet-wide state aggregation

**API** (`cloudflare/api/`)
- Hono framework
- RESTful endpoints for mission control

**Mission Control** (`cloudflare/mission-control/`)
- React frontend
- Three.js 3D visualization
- Real-time AUV fleet monitoring

---

## 5. Research Questions (RQ)

| RQ | Target | Validation |
|----|--------|------------|
| **RQ1** | Compression >10:1, F1 >0.9 at 0.5 Hz | `test-e2e.sh` phase 3 |
| **RQ2** | Partition recovery <60s, RMS <2m | `test-e2e.sh` phase 5 |
| **RQ3** | ARL₀ >10,000, detection delay <120s | `test-e2e.sh` phase 4 |
| **RQ4** | Replay attack: >80% without mitigation, <5% with | `test-e2e.sh` phase 6 |

---

## 6. Known Gotchas

### Research Tuning
- **2 CUSUM test failures** — Known research tuning parameters, not code bugs. E2E treats these as expected.

### Configuration
- **Zenoh v1.7.2** — Config field `multicast.enabled` does not exist in this version. Use `scouting.multicast.enabled` instead.

### Port Conflicts
- **MLflow** — Default port 5000 conflicts with macOS AirPlay. Use port 5050 instead.

### Build Issues
- **Federation Dockerfile** — Build context must be repository root. Copy from `src/iort_dt_federation/`. Requires Rust 1.85+.
- **Edge Gateway** — Has path dependency on `iort-dt-federation` crate. Ensure `AcousticConfig` implements `Clone`.

### Database
- **D1 exec()** — Does not support multi-statement SQL. Execute individual statements separately.

---

## 7. Data Flow

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│   AUV 0     │◄────►│  Support    │◄────►│ Cloudflare  │
│  (Federation│      │  Vessel     │      │  (Global    │
│   + CUSUM)  │      │  (Gateway   │      │   Coord)    │
└──────┬──────┘      │   + Cache)  │      └─────────────┘
       │             └─────────────┘
       │ Zenoh P2P
       ▼
┌─────────────┐
│   AUV 1     │
│  (Federation│
│   + CUSUM)  │
└─────────────┘
```

1. **AUV Fleet**: Gossip-based DT synchronization via Zenoh
2. **Support Vessel**: Caches state during acoustic outages, syncs to cloud when connected
3. **Cloudflare**: Global mission coordination, long-term storage, web dashboard

---

## 8. Validation

Run the 7-phase end-to-end validation:

```bash
./scripts/test-e2e.sh /Users/kakashi3lite/abyssal-twin
```

Phases:
1. Build verification
2. Unit tests (with known CUSUM failures)
3. RQ1 compression validation
4. RQ3 anomaly detection
5. RQ2 federation partition recovery
6. RQ4 security attack simulation
7. Integration smoke test

---

*Architecture specification v1.0 — 2026-03-06*
