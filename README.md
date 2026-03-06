<p align="center">
  <strong>A B Y S S A L &nbsp; T W I N</strong>
  <br/>
  <em>Federated Digital Twins for Autonomous Underwater Vehicle Fleets</em>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache_2.0-0969da?style=flat-square" alt="License" /></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.7-3178c6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" /></a>
  <a href="https://www.rust-lang.org/"><img src="https://img.shields.io/badge/Rust-1.79-dea584?style=flat-square&logo=rust&logoColor=black" alt="Rust" /></a>
  <a href="https://www.python.org/"><img src="https://img.shields.io/badge/Python-3.12-3776ab?style=flat-square&logo=python&logoColor=white" alt="Python" /></a>
  <a href="https://workers.cloudflare.com/"><img src="https://img.shields.io/badge/Cloudflare-Workers-f38020?style=flat-square&logo=cloudflare&logoColor=white" alt="Cloudflare Workers" /></a>
  <br/>
  <img src="https://img.shields.io/badge/tests-99%2F101_passing-2da44e?style=flat-square" alt="Tests" />
  <img src="https://img.shields.io/badge/npm_audit-0_vulnerabilities-2da44e?style=flat-square" alt="Security" />
  <img src="https://img.shields.io/badge/version-0.3.0--beta-7c4dff?style=flat-square" alt="Version" />
</p>

---

Autonomous underwater vehicles operate in one of the most hostile networking environments on Earth. Acoustic links deliver **9,600 baud** with **2-second latency** and **30--70% packet loss**. Traditional digital twin architectures assume broadband connectivity and fail here.

Abyssal Twin solves this through a three-tier architecture: AUVs gossip over acoustic links, a support vessel bridges to satellite, and Cloudflare's global edge network serves as the federation coordinator — giving operators real-time fleet awareness from anywhere on Earth.

---

## Architecture

```
                                                  Operators Worldwide
                                                         |
                                              HTTPS / WebSocket
                                                         |
                          ┌──────────────────────────────────────────────────────┐
                          │              CLOUDFLARE  EDGE                        │
                          │                                                      │
                          │   Workers          Durable Objects         D1 / R2   │
                          │   (Hono API)       (Federation            (Fleet DB  │
                          │                     Coordinator)           Missions)  │
                          │         │                 │                    │      │
                          │         └────── SSE ──────┘                   │      │
                          │                   │                           │      │
                          │            Mission Control UI                 │      │
                          │         (React · Three.js · Recharts)        │      │
                          └──────────────────────┬───────────────────────┘      │
                                                 │                              │
                                        Satellite Uplink                        │
                                    (Iridium 2.4 kbps ─ 22 kbps)               │
                                                 │                              │
                          ┌──────────────────────┴──────────────────────┐
                          │           SUPPORT  VESSEL                   │
                          │                                             │
                          │   Zenoh Bridge ─── Local Cache (SQLite)     │
                          │        │               │                    │
                          │        │         Sync Engine ─── Bandwidth  │
                          │        │         (Delta + zstd)   Monitor   │
                          │   Edge Gateway (Rust)                       │
                          └────────┬────────────────────────────────────┘
                                   │
                            9,600 baud
                       Acoustic Modem Links
                         (2s latency, 30-70% loss)
                                   │
                    ┌──────────────┼──────────────┐
                    │              │              │
               ┌─────────┐  ┌─────────┐  ┌─────────┐
               │  AUV  0  │  │  AUV  1  │  │  AUV  N  │
               │─────────│  │─────────│  │─────────│
               │ Gossip   │  │ Gossip   │  │ Gossip   │
               │ CUSUM    │  │ CUSUM    │  │ CUSUM    │
               │ Pose6D   │  │ Pose6D   │  │ Pose6D   │
               └─────────┘  └─────────┘  └─────────┘
                    └───── Peer-to-Peer Gossip ─────┘
```

**Three tiers, one coherent fleet view.**

| Tier | Role | Stack |
|------|------|-------|
| **AUV Fleet** | Acoustic gossip, local anomaly detection, compressed state vectors | Rust, Python |
| **Support Vessel** | Satellite bridge, local SQLite cache, bandwidth-adaptive sync | Rust (Edge Gateway) |
| **Cloudflare Edge** | Global coordinator, CRDT merge, fleet API, operator UI | TypeScript (Hono + Durable Objects) |

---

## Research Questions

This system investigates four open problems for underwater fleet coordination:

| | Question | Approach | Target |
|---|----------|----------|--------|
| **RQ1** | Minimum sync rate that preserves anomaly detection? | Pose6D compression to 47-byte wire format, adaptive rate control | Compression >10:1, F1 >0.90 at 0.5 Hz |
| **RQ2** | Fleet coherence through network partitions? | Merkle-tree gossip + Kalman fusion reconciliation | Convergence <60s after partition |
| **RQ3** | Formal false-alarm guarantees under packet loss? | CUSUM + Shiryaev-Roberts with ARL bounds (Siegmund 1985) | ARL₀ >10,000 steps |
| **RQ4** | DDS-Security within acoustic bandwidth? | ECDSA P-256 (89% smaller than RSA), AES-128-GCM (28 bytes overhead) | Handshake <30s, overhead <15% |

---

## Components

### Cloudflare Workers — Global Coordinator

The cloud tier runs on Cloudflare's edge network. A singleton Durable Object manages fleet-wide state through the WebSocket Hibernation API, minimizing cost during idle ocean missions.

| Module | Lines | Purpose |
|--------|------:|---------|
| `federation-coordinator.ts` | 511 | Gossip protocol, Kalman fusion, WebSocket Hibernation |
| `crdt.ts` | 303 | LWW-Register, MV-Register, GCounter, PNCounter, PoseCRDT |
| `sync.ts` | 268 | Delta computation, Merkle comparison, CRDT state merge |
| `merkle.ts` | 125 | SHA-256 Merkle tree for anti-entropy gossip |
| `vector-clock.ts` | 82 | Causality tracking across the fleet |
| Routes | 777 | Fleet status, missions, anomalies, ingest, metrics export |
| Middleware | 325 | JWT auth, data residency, request metrics |

**Bindings:** D1 (fleet database), R2 (mission logs), Durable Objects (coordinator singleton)

### Edge Gateway — Support Vessel

The Rust gateway runs on the support vessel (Jetson Orin), bridging the acoustic fleet to satellite uplink.

| Module | Lines | Purpose |
|--------|------:|---------|
| `zenoh_bridge.rs` | 125 | Subscribes to AUV telemetry via Zenoh peer-to-peer |
| `local_cache.rs` | 249 | SQLite cache mirroring D1 schema for 72h autonomy |
| `sync_engine.rs` | 167 | Priority queue, zstd compression, exponential backoff |
| `bandwidth_monitor.rs` | 104 | Three-tier adaptive bandwidth management |
| `cloudflare_client.rs` | 134 | HTTP + WebSocket client for Cloudflare Workers |

### Federation Core — Gossip Protocol

The Rust gossip engine runs on each AUV and the support vessel.

| Capability | Implementation |
|------------|----------------|
| Anti-entropy gossip | Merkle root comparison (32 bytes), leaf exchange on divergence |
| Causality | Vector clocks with component-wise merge |
| Partition recovery | Inverse-covariance Kalman fusion |
| State format | 47-byte compressed Pose6D wire format |

### Mission Control — Operator Dashboard

React 19 + Three.js single-page application served via Cloudflare Pages.

- **3D Fleet Map** — Real-time AUV positions via Server-Sent Events
- **Anomaly Panel** — Live CUSUM/S-R alerts with severity indicators
- **Metrics Charts** — RQ1-RQ3 performance tracking (Recharts)
- **Status Cards** — Fleet connectivity, partition state, health scores

### Anomaly Detection — Sequential Detectors

Python implementations of CUSUM and Shiryaev-Roberts with formal guarantees.

- Operates on DT state residuals (predicted vs. received)
- ARL bounds derived from Siegmund (1985) and Hypothesis-verified
- Detects thruster degradation, gyroscope drift, depth sensor faults

---

## Quick Start

```bash
git clone https://github.com/kakashi3lite/abyssal-twin.git
cd abyssal-twin
```

**Cloudflare Workers** (requires Node.js 18+):

```bash
cd cloudflare
npm install
npx tsc --noEmit              # type check
npx vitest run                # 53 integration tests
npx wrangler dev              # local dev server at localhost:8787
```

**Rust Federation Core:**

```bash
cargo test --manifest-path src/iort_dt_federation/Cargo.toml   # 26 tests
cargo clippy --manifest-path src/iort_dt_federation/Cargo.toml -- -D warnings
```

**Edge Gateway:**

```bash
cd edge-gateway
cargo check                   # verify compilation
```

**Python Anomaly Detection** (requires Poetry):

```bash
poetry install
poetry run pytest tests/ -v   # 20/22 pass (2 CUSUM sensitivity tuning)
poetry run ruff check src/
```

**Full E2E Validation:**

```bash
./scripts/test-e2e.sh         # runs all 7 validation phases
```

---

## Test Results

```
Phase 1: TypeScript Type Safety     ✓  zero errors
Phase 2: Vitest Integration Tests   ✓  53/53 pass
Phase 3: Rust Federation Core       ✓  26/26 pass, clippy clean
Phase 4: Python Anomaly Detection   ✓  20/22 pass (2 known CUSUM tuning)
Phase 5: Security Audit             ✓  0 npm vulnerabilities
Phase 6: Edge Gateway Compilation   ✓  compiles
Phase 7: Mission Control Build      ✓  Vite production build
```

| Suite | Tests | Coverage |
|-------|------:|----------|
| VectorClock | 10 | Merge, causality, serialization, deterministic encoding |
| CRDT | 13 | LWW, MV, GCounter, PNCounter, PoseCRDT Kalman fusion |
| Sync | 15 | Kalman reconciliation, Merkle tree, delta computation, RMS error |
| API | 8 | Health, fleet status/history, ingest, anomalies, WebSocket |
| Rust Federation | 26 | Gossip protocol, vector clocks, Merkle tree, state merge |
| Python Property | 22 | Compression bounds, ARL guarantees, detection delay |

---

## Repository Structure

```
abyssal-twin/
│
├── cloudflare/                     Cloudflare Workers edge infrastructure
│   ├── src/
│   │   ├── index.ts                Hono REST API entry point
│   │   ├── federation-coordinator.ts   Durable Object: gossip + Kalman fusion
│   │   ├── crdt.ts                 CRDT implementations (LWW, MV, PoseCRDT)
│   │   ├── sync.ts                 Delta computation + state reconciliation
│   │   ├── merkle.ts               SHA-256 Merkle tree
│   │   ├── vector-clock.ts         Causality tracking
│   │   ├── types.ts                Shared type definitions
│   │   ├── routes/                 Fleet, missions, anomalies, ingest, metrics
│   │   └── middleware/             Auth (CF Access JWT), data residency, metrics
│   ├── test/                       53 Vitest integration tests
│   ├── pages/                      Mission Control UI (React + Three.js)
│   ├── migrations/                 D1 schema (vehicles, state_vectors, anomalies)
│   └── wrangler.toml               D1, R2, Durable Objects, env config
│
├── edge-gateway/                   Rust support vessel gateway
│   ├── src/                        Zenoh bridge, local cache, sync, bandwidth
│   ├── systemd/                    Service files for vessel deployment
│   └── tunnel/                     Cloudflared tunnel config
│
├── src/
│   ├── iort_dt_federation/         Rust gossip protocol (26 tests)
│   ├── iort_dt_anomaly/            Python CUSUM + Shiryaev-Roberts detectors
│   └── iort_dt_compression/        Python Pose6D codec + rate controller
│
├── tests/property/                 Hypothesis property-based tests
├── scripts/
│   ├── test-e2e.sh                 7-phase validation runner
│   ├── ci/generate_certs.sh        ECDSA P-256 DDS certificate generation
│   └── attacks/replay_attack.py    RQ4 red-team replay attack simulation
│
├── .github/workflows/              CI: lint, test, provenance, RQ validation
├── docker/                         Docker Compose + Zenoh acoustic config
├── configs/security/               DDS-Security governance templates
└── docs/                           Threat model, simulation limitations
```

**46 source files, ~8,400 lines of code** across TypeScript, Rust, and Python.

---

## Validation Scope

This project is transparent about the limits of simulation-only validation.

**Validated through testing and emulation:**

- CRDT convergence properties (53 integration tests)
- Kalman fusion correctness (inverse-covariance weighting verified)
- Merkle-tree anti-entropy gossip (divergence detection, leaf exchange)
- API correctness (D1 queries, ingest pipeline, SSE streaming)
- CUSUM ARL bounds (mathematically proven, Hypothesis-verified)
- Compression ratio (47-byte wire format, >10:1 reduction)

**Requires hardware validation (planned):**

- Performance on real acoustic modems (EvoLogics S2C R)
- Detection delay on embedded hardware (Jetson Orin Nano)
- Behavior under real ocean conditions (multipath, thermoclines)
- Satellite link performance (Iridium Certus / Starlink Mini)

---

## Roadmap

| Version | Status | Highlights |
|---------|--------|------------|
| **v0.1.0** | Done | Rust gossip protocol, Python CUSUM/compression, DDS certs, CI pipeline |
| **v0.2.0** | Done | Docker infrastructure, Rust tests, observability config, README rewrite |
| **v0.3.0-beta** | **Current** | Cloudflare Workers, Durable Objects, Mission Control UI, Edge Gateway, 99/101 tests |
| **v0.3.0-stable** | Next | Chaos engineering, performance benchmarks, security hardening, cost optimization |
| **v1.0.0** | Planned | Hardware-in-the-loop, ARM64 images, tank testing, dissertation Chapter 4 figures |

---

## Cost Model

The Cloudflare deployment is designed for cost-effective research operations.

| Service | Usage | Estimated Cost |
|---------|-------|----------------|
| Workers | 10M requests/month | $5 |
| Durable Objects | ~1M requests/month | $0.12 |
| D1 | Fleet DB reads/writes | Free (alpha) |
| R2 | Mission log storage | $0.015/GB-month |
| Pages | Mission Control UI | Free |
| **Total** | **3-AUV fleet** | **<$50/month** |

---

## Related Work

- Yu, Sakaguchi, Saad. *Internet of Federated Digital Twins (IoFDT).* IEEE IoT Magazine, 2024.
- Yan et al. *Digital Twin-Driven Swarm of AUVs.* Nature Communications Engineering, 2026.
- Deng et al. *On the (In)Security of Secure ROS2.* ACM CCS, 2022.
- Grimaldi et al. *Stonefish: Supporting ML Research in Marine Robotics.* IEEE ICRA, 2025.
- Buchholz et al. *AURA: Collaborative Reasoning for Anomaly Diagnostics in Underwater Robotics.* arXiv:2511.03075, 2025.

---

## License

[Apache License 2.0](LICENSE) — Copyright 2026 Swanand Tanavade, University of Nebraska at Omaha.

## Citation

```bibtex
@software{tanavade2026abyssal,
  author    = {Tanavade, Swanand},
  title     = {Abyssal Twin: Federated Digital Twins for AUV Fleets},
  year      = {2026},
  url       = {https://github.com/kakashi3lite/abyssal-twin},
  license   = {Apache-2.0}
}
```
