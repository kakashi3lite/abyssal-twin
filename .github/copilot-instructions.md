# Abyssal Twin — Project Guidelines

## Quick Context
Three-tier federated digital twin for AUV fleets: **Cloudflare Workers (TS)** → **Rust Edge Gateway** → **Python Compression/CUSUM**. Acoustic links operate at bytes-per-second with 30-70% packet loss. Every design decision must account for: 47-byte wire format, acoustic latency, offline-first architecture, DO limits, and Zenoh HLC timestamps.

## Architecture at a Glance
- **Cloud tier**: `cloudflare/src/` — Hono API, Durable Objects (singleton gossip coordinator), D1, R2, SSE streaming
- **Dashboard**: `cloudflare/pages/` (Three.js) + `mission-control/` (React + Mapbox)
- **Edge tier**: `edge-gateway/src/` — Rust, Zenoh bridge, SQLite cache, bandwidth-adaptive sync
- **Fleet tier**: `src/iort_dt_compression/` (47-byte Pose6D), `src/iort_dt_anomaly/` (CUSUM), `src/iort_dt_federation/` (Rust CRDT)

See `ARCHITECTURE.md` for full details.

## Build and Test
```bash
# All tests (Rust + Python)
make test-all

# TypeScript tests (Cloudflare Workers)
cd cloudflare && npm test

# Rust tests (edge gateway + federation)
cargo test --manifest-path edge-gateway/Cargo.toml
cargo test --manifest-path src/iort_dt_federation/Cargo.toml

# Python tests (compression + anomaly)
cd src/iort_dt_compression && poetry run pytest
cd src/iort_dt_anomaly && poetry run pytest

# Full E2E validation (7 phases)
scripts/test-e2e.sh

# Docker simulation stack
docker compose -f docker/docker-compose.simulation.yml up

# Dashboard dev
cd mission-control && npm run dev
```

## Critical Constraints (Never Violate)
1. **47-byte wire format** — acoustic links are bytes-per-second. Adding a field means dropping another.
2. **Offline-first** — SQLite cache (`edge-gateway/src/local_cache.rs`) is source of truth during partitions.
3. **No DDS-Security on acoustic links** — use Zenoh TLS (transport) + optional HMAC-8 (per-message).
4. **Siegmund ARL₀ underestimates by 20-40%** — always validate empirically with Monte Carlo.
5. **DO alarm interval ≥ 30s** — don't schedule overlapping alarms.
6. **Zenoh HLC timestamps** — may replace custom VectorClock. Evaluate before modifying VectorClock code.

## Key Gotchas
- **JWT auth is BROKEN**: `auth.ts` decodes but never verifies RS256 signatures. Fix before relying on auth.
- **Bandwidth monitor has a threshold bug**: Emergency tier uses <50 kbps, should be <10 kbps.
- **2 CUSUM tests fail**: Siegmund approximation divergence. Recalibrate with `ARLBounds.compute_threshold_for_arl0()`.
- **Docker stack incomplete**: Dockerfiles partially missing. Complete before `docker compose up`.
- **`blockConcurrencyWhile` may be deprecated**: Check current DO docs. Prefer SQL storage for state restoration.

## Security Posture
- Transport: Zenoh TLS (zero per-message overhead)
- Per-message (optional): HMAC-SHA256 truncated to 8B + 2B sequence = 10B auth header
- Dashboard: Cloudflare Access JWT (RS256 — FIX NEEDED)
- Data residency: ITAR enforced via `CF-IPCountry`, immutable R2 audit trail

## Wire Format Reference
```
47-byte AUVStateVector: [1B auv_id | 8B timestamp | 4B seq | 12B pose (6×int16) | 12B thrusters (6×int16) | 1B battery | 6B residuals (3×float16) | 1B flags | 2B CRC-16]
+ 5B Zenoh header = 52B/wire. At 9600 baud = ~23 msg/s theoretical. At 300 baud (emergency) = ~0.7 msg/s.
```

## Dashboard Value Props
- **PNR Safety Engine**: `mission-control/src/components/SafetyEngine.ts` — prevents $1M+ AUV losses
- **Fleet coherence**: DO gossip protocol, <45s partition recovery target
- **Geospatial command**: Mapbox GL with acoustic coverage zones (BROKEN — iframe needs react-map-gl migration)
- **Anomaly alerts**: CUSUM detection with ARL₀ display, cross-vehicle correlation

## When in Doubt
1. Read the plan: `/memories/session/plan.md`
2. Read the architecture: `ARCHITECTURE.md`
3. Check known issues: `MIGRATION_NOTES.md`
4. Use the **Abyssal Architect** agent for complex multi-tier features
