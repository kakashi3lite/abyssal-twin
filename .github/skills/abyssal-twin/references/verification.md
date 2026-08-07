# Verification Procedures

## Per-Subsystem Verification

### 1. Cloudflare Workers API

```bash
# Start dev server
cd cloudflare && npm run dev

# Health check
curl http://localhost:8787/api/v1/health
# Expected: {"service":"abyssal-twin-api","version":"1.0.0","environment":"dev","status":"ok"}

# Fleet status (requires D1 seed data)
curl http://localhost:8787/api/v1/fleet/status
# Expected: {"vehicles":[...4 vehicles...],"updatedAt":"..."}

# Simulation SSE
curl -N http://localhost:8787/api/v1/simulate
# Expected: streaming "data:" lines with vehicle states, 2s interval

# Ingest (simulated vessel)
curl -X POST http://localhost:8787/api/v1/ingest \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dev-operator" \
  -d '{"vesselId":10,"states":[],"anomalies":[],"sentAt":"2026-08-07T00:00:00Z"}'
# Expected: {"received":0,"forwarded":true}
```

### 2. Rust Edge Gateway

```bash
# Build
cargo build --release --manifest-path edge-gateway/Cargo.toml

# Run (requires local Cloudflare Workers dev server on :8787)
CF_API_TOKEN=dev-operator cargo run --manifest-path edge-gateway/Cargo.toml
# Expected: "Gateway started" log, Zenoh subscriber active, sync engine looping

# Tests
cargo test --manifest-path edge-gateway/Cargo.toml
# Expected: all tests pass
```

### 3. Python Compression

```bash
cd src/iort_dt_compression
poetry run python -c "
from iort_dt_compression.models import AUVStateVector, Pose6D
pose = Pose6D.from_float(10.5, -5.2, 3000.0, 0.1, -0.05, 1.57)
state = AUVStateVector(auv_id=1, timestamp=1234567890.0, sequence=42, pose=pose)
wire = state.to_bytes()
print(f'Wire size: {len(wire)} bytes')  # Must be 47
recovered = AUVStateVector.from_bytes(wire)
print(f'Roundtrip match: {state == recovered}')  # Must be True
"
poetry run pytest -v
# Expected: all tests pass (or documented xfails for 2 CUSUM tests)
```

### 4. Python CUSUM

```bash
cd src/iort_dt_anomaly
poetry run python -c "
from iort_dt_anomaly.detectors import CUSUMDetector, CUSUMConfig, NominalDistribution
import numpy as np
config = CUSUMConfig(threshold_h=10.0, reference_k=0.5)
nominal = NominalDistribution(mean=0.0, std=1.0, n_samples=100)
detector = CUSUMDetector(config, nominal)
# Feed nominal data: should not alarm
for i in range(1000):
    z = np.random.normal(0, 1)
    alert = detector.update(z)
    if alert: print(f'False alarm at step {i}')
print('Nominal test complete')
# Feed shifted data: should alarm within ~10 steps
for i in range(100):
    z = np.random.normal(2.0, 1)
    alert = detector.update(z)
    if alert:
        print(f'Alarm at step {i} after 2σ shift')
        break
"
poetry run pytest -v
# Expected: all tests pass (or 2 documented xfails)
```

### 5. Dashboard (Pages — Three.js)

```bash
# Terminal 1:
cd cloudflare && npm run dev
# Terminal 2:
cd cloudflare/pages && npm run dev
# Open http://localhost:5173
# Verify: FleetMap 3D (4 meshes), StatusCards, AnomalyPanel, MetricsChart
```

### 6. Mission Control (Mapbox)

```bash
# Terminal 1:
cd cloudflare && npm run dev
# Terminal 2:
cd mission-control && npm run dev
# Open http://localhost:5173
# Required: VITE_MAPBOX_TOKEN in .env
# Verify: GlobalFleetMap basemap, SafetyEngine PNR alerts, MissionReplay timeline
```

### 7. D1 Database

```bash
# Local D1
npx wrangler d1 execute FLEET_DB --local --command="SELECT * FROM vehicles;"
# Expected: 4 vehicles

# Apply migrations to fresh DB
npx wrangler d1 execute FLEET_DB --local --file=migrations/0001_initial.sql
npx wrangler d1 execute FLEET_DB --local --file=migrations/0002_indexes.sql
npx wrangler d1 execute FLEET_DB --local --file=migrations/seed.sql

# Verify covering index
npx wrangler d1 execute FLEET_DB --local --command="EXPLAIN QUERY PLAN SELECT v.id, v.name, sv.pose_x FROM vehicles v LEFT JOIN state_vectors sv ON sv.id = (SELECT id FROM state_vectors WHERE vehicle_id = v.id ORDER BY id DESC LIMIT 1);"
# Expected: USING COVERING INDEX idx_state_vectors_vehicle_id
```

## E2E Test Script

```bash
scripts/test-e2e.sh
# 7 phases: Build → Unit → RQ1 compression → RQ3 CUSUM → RQ2 partition → RQ4 security → Integration
# Expected: 7/7 phases pass (or documented failures for Phase 4 CUSUM)
```

## Infrastructure Validation

```bash
scripts/validate-infrastructure.sh
# 7 sections: Project structure, CI/CD, Docker, TypeScript config, validation tests, tools
# Expected: all checks pass or warnings only
```

## Performance Benchmarks (Target)

| Metric | Target | Measurement Command |
|---|---|---|
| Fleet status API p95 | <200ms | `ab -n 1000 /api/v1/fleet/status` |
| Ingestion throughput | >100 states/sec | `scripts/test-e2e.sh` Phase 7 |
| SSE reconnect time | <5s | Manual: disconnect SSE, time reconnect |
| DO alarm duration | <15s (of 30s budget) | DO logs: alarm start → alarm end |
| D1 query (100K rows) | <500ms | `EXPLAIN QUERY PLAN` + benchmark |
| Dashboard FCP | <2s | Lighthouse audit on `localhost:3000` |
