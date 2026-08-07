# D1 Database Schema & SQLite Cache Mapping

## D1 Tables (`cloudflare/migrations/0001_initial.sql`)

### vehicles

```sql
CREATE TABLE vehicles (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('auv', 'usv', 'support')),
    last_seen TEXT,
    acoustic_address INTEGER,
    status TEXT NOT NULL DEFAULT 'offline' CHECK(status IN ('online', 'partitioned', 'offline')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### state_vectors

```sql
CREATE TABLE state_vectors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
    timestamp TEXT NOT NULL,
    pose_x REAL, pose_y REAL, pose_z REAL,
    yaw REAL,
    position_variance REAL,
    covariance BLOB,
    health_score INTEGER CHECK(health_score BETWEEN 0 AND 255),
    mission_phase INTEGER CHECK(mission_phase BETWEEN 0 AND 3),
    anomaly_detected INTEGER NOT NULL DEFAULT 0
);
```

### anomalies

```sql
CREATE TABLE anomalies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
    detected_at TEXT NOT NULL,
    received_at TEXT NOT NULL DEFAULT (datetime('now')),
    detector_type TEXT NOT NULL,
    confidence REAL,
    severity REAL,
    dimension TEXT,
    ack_by TEXT,
    ack_at TEXT
);
```

### missions

```sql
CREATE TABLE missions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    started_at TEXT,
    ended_at TEXT,
    status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned', 'active', 'completed', 'aborted')),
    rosbag_r2_key TEXT,
    metrics_r2_key TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

## Indexes (`0002_indexes.sql`)

```sql
-- Covering index for fleet status GROUP BY query
CREATE INDEX idx_state_vectors_vehicle_id ON state_vectors(vehicle_id, id);

-- Query optimized by this index:
-- SELECT v.*, sv.* FROM vehicles v
-- LEFT JOIN state_vectors sv ON sv.id = (
--   SELECT id FROM state_vectors WHERE vehicle_id = v.id ORDER BY id DESC LIMIT 1
-- );
-- EXPLAIN QUERY PLAN should show: USING COVERING INDEX idx_state_vectors_vehicle_id
```

## Seed Data (`seed.sql`)

```sql
INSERT INTO vehicles (id, name, type, acoustic_address) VALUES
    (1, 'auv_0', 'auv', 0x01),
    (2, 'auv_1', 'auv', 0x02),
    (3, 'auv_2', 'auv', 0x03),
    (10, 'support_vessel', 'support', 0x10);
INSERT INTO missions (id, name, status) VALUES ('test-mission-001', 'Test Mission', 'active');
```

## SQLite Cache Mapping (`edge-gateway/src/local_cache.rs`)

The Rust SQLite cache mirrors D1 with two critical additions:

### Additional Columns

```sql
-- Added to state_vectors and anomalies:
synced INTEGER NOT NULL DEFAULT 0  -- 0 = not uploaded, 1 = confirmed uploaded
```

### Partial Indexes (SQLite-specific optimization)

```sql
CREATE INDEX idx_sv_unsynced ON state_vectors(synced) WHERE synced = 0;
CREATE INDEX idx_anom_unsynced ON anomalies(synced) WHERE synced = 0;
```

These partial indexes provide O(log n) access to unsent rows without scanning the entire table. The `WHERE synced = 0` clause makes the index sparse — only unsynced rows are indexed.

### Sync Flag Semantics

| synced Value | Meaning | Action |
|---|---|---|
| 0 | Not uploaded to Cloudflare | Read by `get_unsent_states()` / `get_unsent_anomalies()` |
| 1 | Confirmed uploaded | Skipped by unsent queries; kept for local audit/history |

### WAL Mode

SQLite is opened with WAL (Write-Ahead Logging) mode:
```rust
conn.execute_batch("PRAGMA journal_mode=WAL;")?;
```
This allows concurrent reads (sync engine) while writes (Zenoh bridge) are in progress. Without WAL, the `Arc<Mutex<Connection>>` would serialize all access.

## Type Mapping: Python → Rust → TypeScript → D1

| Python (struct) | Rust (bincode) | TypeScript (JSON) | D1 (SQL) |
|---|---|---|---|
| `auv_id: uint8` | `auv_id: u8` | `id: number` | `vehicles.id INTEGER` |
| `timestamp: float64` | `timestamp: f64` | `timestamp: number` | `state_vectors.timestamp TEXT` |
| `pose.x_mm: int16` | `x: f32` (meters) | `poseX: number` | `pose_x REAL` |
| `pose.y_mm: int16` | `y: f32` | `poseY: number` | `pose_y REAL` |
| `pose.z_mm: int16` | `z: f32` | `poseZ: number` | `pose_z REAL` |
| `pose.yaw_s: int16` | `yaw: f32` (radians) | `yaw: number` | `yaw REAL` |
| — | `position_variance: f32` | `positionVariance: number` | `position_variance REAL` |
| `thruster_rpms[0]: int16` | `health_score: u8` | `healthScore: number` | `health_score INTEGER` |
| `flags: uint8` (bits 6-5) | `mission_phase: u8` | `missionPhase: number` | `mission_phase INTEGER` |
| `flags: uint8` (bit 7) | `anomaly_detected: bool` | `anomalyDetected: boolean` | `anomaly_detected INTEGER` |

## Common Queries

### Fleet Status (Latest State Per Vehicle)

```sql
SELECT v.id, v.name, v.type, v.status, v.last_seen,
       sv.pose_x, sv.pose_y, sv.pose_z, sv.yaw,
       sv.position_variance, sv.health_score,
       sv.mission_phase, sv.anomaly_detected,
       sv.timestamp
FROM vehicles v
LEFT JOIN state_vectors sv ON sv.id = (
    SELECT id FROM state_vectors
    WHERE vehicle_id = v.id
    ORDER BY id DESC LIMIT 1
);
```

### Unacknowledged Anomaly Count

```sql
SELECT COUNT(*) FROM anomalies WHERE ack_by IS NULL;
```

### Sync Lag (For RQ3 Metrics)

```sql
SELECT vehicle_id,
       AVG(julianday(received_at) - julianday(detected_at)) * 86400 AS avg_sync_lag_seconds
FROM anomalies
WHERE received_at IS NOT NULL
GROUP BY vehicle_id;
```
