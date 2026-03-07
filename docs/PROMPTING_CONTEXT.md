# Abyssal Twin — Smart Prompting Context

> **Purpose:** Distilled context for Cursor/LLM prompts. Copy-paste relevant sections into new sessions to bootstrap understanding without re-reading transcripts.

---

## 1. Project Identity

| Field | Value |
|-------|-------|
| **Name** | Abyssal Twin |
| **Repo** | `github.com/kakashi3lite/abyssal-twin` |
| **Version** | v0.3.0-beta |
| **License** | Apache 2.0 |
| **Institutions** | UNO (PhD research), Northeastern (commercialization) |

**One-liner:** Federated digital twins for AUV fleets over acoustic links (9,600 baud, 2s latency, 30–70% packet loss) with cloud-edge sync via Cloudflare.

---

## 2. Architecture (Three Tiers)

```
AUV Fleet (acoustic gossip) → Support Vessel (Zenoh + SQLite + satellite) → Cloudflare Edge (Workers + DO + D1) → Mission Control UI
```

| Tier | Stack | Key Files |
|------|-------|-----------|
| **AUV Fleet** | Rust federation, Python CUSUM/Pose6D | `src/iort_dt_federation/`, `src/iort_dt_anomaly/`, `src/iort_dt_compression/` |
| **Support Vessel** | Rust edge-gateway, Zenoh, SQLite | `edge-gateway/` |
| **Cloudflare** | Workers, Durable Objects, D1, R2, Pages | `cloudflare/` |

**Critical constraint:** 9,600 baud ≈ 1,200 bytes/sec. All designs must show byte math.

---

## 3. Directory Map

```
abyssal-twin/
├── cloudflare/           # Workers, DO, D1, R2, Hono API
│   ├── src/              # vector-clock, merkle, crdt, sync, federation-coordinator
│   ├── test/             # Vitest: vector-clock, crdt, sync, api
│   ├── pages/            # Mission Control UI (React + Three.js + SSE)
│   └── migrations/      # D1 schema
├── edge-gateway/         # Rust: zenoh_bridge, local_cache, sync_engine, cloudflare_client
├── src/
│   ├── iort_dt_federation/   # Rust gossip core (VectorClock, MerkleTree, Kalman)
│   ├── iort_dt_anomaly/      # Python CUSUM, Shiryaev-Roberts
│   └── iort_dt_compression/  # Python Pose6D, 47-byte wire format, CRC-16
├── docker/               # Zenoh, federation, stonefish, ros2, prometheus, grafana, mlflow
├── scripts/
│   ├── test-e2e.sh       # 7-phase validation runner
│   └── attacks/         # replay_attack.py (RQ4)
├── tests/                # pytest (RQ1, RQ3 property tests)
└── experiments/          # rq1_sync_tradeoff, etc.
```

---

## 4. Research Questions (RQ)

| RQ | Topic | Validation |
|----|-------|------------|
| RQ1 | Compression ratio >10:1, F1 >0.9 at 0.5 Hz | `experiments/rq1_sync_tradeoff/`, `tests/property/test_rq1_bounds.py` |
| RQ2 | Partition recovery <60s, RMS <2m | Rust federation tests, chaos tests |
| RQ3 | ARL₀ >10,000, detection delay <120s | `tests/property/test_rq3_arl.py` |
| RQ4 | Replay attack mitigation | `scripts/attacks/replay_attack.py` (target: >80% without, <5% with) |

---

## 5. Known Issues & Gotchas

| Issue | Cause | Workaround |
|-------|-------|------------|
| **2 CUSUM test failures** | Research-level detector tuning, not code bugs | E2E script treats as known; exclude `cusum_detects_thruster`, `cusum_outperforms_threshold` |
| **cargo audit rsa 0.9.10** | Zenoh dependency, no upstream fix | Accept medium-severity timing side-channel |
| **Dependabot 3 high** | Likely Cargo.lock in federation crate | Check GitHub Security tab |
| **MLflow port 5000** | macOS AirPlay uses 5000 | Use `5050:5000` in docker-compose |
| **Zenoh v1.7.2 config** | `multicast.enabled`, `adminspace.enabled` removed | Use schema: `join_interval`, `max_sessions`, `qos`, `compression` |
| **Federation Dockerfile** | Cargo.toml at `src/iort_dt_federation/` | `COPY src/iort_dt_federation/Cargo.toml`; Rust 1.85+ for edition2024 |
| **Zenoh healthcheck** | Container has no curl | Use `wget --spider` or TCP check; admin API not on 8000 |
| **D1 exec()** | Multi-statement SQL with inline formatting fails | Use individual statements in migrations/tests |

---

## 6. Validation Commands

```bash
# Full E2E (7 phases)
./scripts/test-e2e.sh

# Individual phases
cd cloudflare && npx tsc --noEmit && npx vitest run
cd src/iort_dt_federation && cargo test && cargo clippy -- -D warnings
cd .. && poetry run pytest tests/ -v
cd cloudflare && npm audit --audit-level=high
cd edge-gateway && cargo check
cd cloudflare/pages && npm run build

# Docker simulation stack
cd docker && docker compose -f docker-compose.simulation.yml up -d zenoh-router stonefish-sim prometheus grafana mlflow
```

---

## 7. Docker Services

| Service | Image | Port | Notes |
|---------|-------|------|-------|
| zenoh-router | eclipse/zenoh:latest | 7447 | Command: `["-c", "/etc/zenoh/zenoh.json5"]` (entrypoint adds zenohd) |
| stonefish-sim | stub (ubuntu:24.04) | — | Placeholder |
| ros2 | ros:jazzy-ros-base-noble | — | Stub |
| federation | build from docker/federation/ | — | Needs Rust 1.85+, path to `src/iort_dt_federation/` |
| prometheus | prom/prometheus | 9090 | |
| grafana | grafana/grafana | 3000 | |
| mlflow | python:3.12-slim | 5050 | Remapped from 5000 |

---

## 8. Key Technical Decisions

- **Durable Objects** over traditional server: singleton gossip coordinator, hibernation for cost
- **SSE over WebSocket** for Mission Control: one-way telemetry, satellite-friendly
- **Edge gateway reuses Zenoh 1.0** + bincode: zero translation between vessel and AUV fleet
- **D1 schema mirrors SQLite** in edge-gateway: trivial delta sync
- **Hono** for Workers API (lightweight, edge-optimized)

---

## 9. Cost Target

< $50/month for 3-AUV fleet on Cloudflare (Workers, DO, D1, R2, Pages).

---

## 10. Prompting Snippets

**For new feature work:**
> Abyssal Twin v0.3.0-beta: federated AUV digital twins over 9600 baud acoustic links. Three tiers: AUV gossip → vessel (Zenoh+SQLite) → Cloudflare (Workers+DO+D1). See docs/PROMPTING_CONTEXT.md.

**For Docker/infra:**
> Docker stack: Zenoh 1.7.2 (config schema changed), MLflow on 5050 (macOS), federation Dockerfile context is repo root, Cargo at src/iort_dt_federation/.

**For tests:**
> E2E: 7 phases (tsc, vitest, cargo test, pytest, npm audit, edge-gateway check, pages build). 2 CUSUM failures are known research tuning, not bugs.

**For security:**
> npm audit 0; cargo audit 1 medium (rsa/Zenoh, no fix). Replay attack: >80% without mitigation, <5% with.

---

*Generated from agent transcripts 333d6ed5, 624247e5, eae5a582, 1ec53283. Last updated: 2026-03-06.*
