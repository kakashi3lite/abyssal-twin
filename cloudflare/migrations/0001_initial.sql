-- IoRT-DT: Abyssal Twin — D1 Fleet State Schema
-- Mirrors the local SQLite cache on the support vessel for trivial delta sync.
-- Tables: vehicles, state_vectors, anomalies, missions

-- ─── Fleet Topology ─────────────────────────────────────────────────────────
-- Tracks all vehicles in the fleet (AUVs, USVs, support vessels).
-- status reflects last-known connectivity from the cloud's perspective.
CREATE TABLE vehicles (
    id          INTEGER PRIMARY KEY,
    name        TEXT    NOT NULL,
    type        TEXT    NOT NULL CHECK (type IN ('auv', 'usv', 'support')),
    last_seen   TEXT,                -- ISO-8601 datetime
    acoustic_address TEXT,           -- Acoustic modem address (e.g. "0x01")
    status      TEXT    NOT NULL DEFAULT 'offline'
                        CHECK (status IN ('online', 'partitioned', 'offline')),
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ─── State Vectors (Time-Series) ────────────────────────────────────────────
-- Decoded from 47-byte AUVStateVector wire format (RQ1 compression).
-- One row per telemetry sample received from the support vessel.
CREATE TABLE state_vectors (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_id  INTEGER NOT NULL,
    timestamp   TEXT    NOT NULL DEFAULT (datetime('now')),
    -- Position decoded from Pose6D (int16 mm → float meters)
    pose_x      REAL,
    pose_y      REAL,
    pose_z      REAL,
    -- Heading (radians)
    yaw         REAL,
    -- Localization uncertainty for Kalman fusion (RQ2)
    position_variance REAL,
    -- 6x1 covariance diagonal stored as binary (36 bytes, float64)
    covariance  BLOB,
    -- Health / mission state
    health_score     INTEGER,
    mission_phase    INTEGER,
    anomaly_detected INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id)
);

-- Index for time-range queries on fleet history
CREATE INDEX idx_state_vectors_vehicle_time
    ON state_vectors(vehicle_id, timestamp);

-- ─── Anomaly Events ─────────────────────────────────────────────────────────
-- Partition-tolerant event log: detected_at is when the AUV flagged it,
-- received_at is when the cloud received it (may be delayed by hours during outage).
CREATE TABLE anomalies (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_id      INTEGER NOT NULL,
    detected_at     TEXT    NOT NULL,    -- When the AUV's CUSUM detector fired
    received_at     TEXT    NOT NULL DEFAULT (datetime('now')),
    detector_type   TEXT,                -- 'cusum', 'shiryaev_roberts', etc.
    confidence      REAL,                -- Detection confidence [0, 1]
    severity        REAL,                -- Impact severity [0, 1]
    dimension       TEXT,                -- Which sensor dimension triggered
    ack_by          TEXT,                -- Operator UUID who acknowledged
    ack_at          TEXT,                -- When acknowledged
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id)
);

CREATE INDEX idx_anomalies_vehicle_time
    ON anomalies(vehicle_id, detected_at);

-- ─── Missions ───────────────────────────────────────────────────────────────
-- Each mission references R2 object keys for large binary data (ROS bags, metrics).
CREATE TABLE missions (
    id              TEXT    PRIMARY KEY, -- UUID
    name            TEXT    NOT NULL,
    started_at      TEXT,
    ended_at        TEXT,
    status          TEXT    NOT NULL DEFAULT 'planned'
                            CHECK (status IN ('planned', 'active', 'completed', 'aborted')),
    rosbag_r2_key   TEXT,               -- R2 object key for ROS2 bag file
    metrics_r2_key  TEXT,               -- R2 key for compressed metrics JSON
    notes           TEXT,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);
