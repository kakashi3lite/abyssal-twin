# Abyssal Twin — Context One-Pager

**Paste this into new prompts when you need fast context.**

---

## What
Federated digital twins for AUV fleets. Acoustic links: 9600 baud, 2s latency, 30–70% loss. Three tiers: AUV gossip → vessel (Zenoh+SQLite+satellite) → Cloudflare (Workers+DO+D1) → Mission Control UI.

## Where
- `cloudflare/` — Workers, Durable Object, Hono API, Mission Control (React+Three.js)
- `edge-gateway/` — Rust: Zenoh bridge, SQLite cache, sync engine
- `src/iort_dt_federation/` — Rust gossip (VectorClock, MerkleTree, Kalman)
- `src/iort_dt_anomaly/` — Python CUSUM
- `src/iort_dt_compression/` — 47-byte Pose6D wire format
- `docker/` — Zenoh, federation, prometheus, grafana, mlflow

## Validate
`./scripts/test-e2e.sh` — 7 phases. 2 CUSUM failures = known research tuning.

## Gotchas
- Zenoh 1.7.2: no `multicast.enabled` in config
- MLflow: use port 5050 (macOS AirPlay uses 5000)
- Federation Dockerfile: context root, copy from `src/iort_dt_federation/`, Rust 1.85+
- Edge gateway: path dep `iort-dt-federation`, `AcousticConfig` needs `Clone`

## RQ Targets
RQ1: compression >10:1, F1>0.9 @ 0.5Hz | RQ2: partition recovery <60s | RQ3: ARL₀>10k | RQ4: replay <5% with mitigation

---
Full context: `docs/PROMPTING_CONTEXT.md`
