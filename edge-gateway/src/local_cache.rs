// Local Cache: SQLite buffer on the support vessel.
// Schema mirrors the D1 database (cloudflare/migrations/0001_initial.sql)
// for trivial delta sync when satellite connectivity is restored.

use anyhow::Result;
use rusqlite::{params, Connection};
use std::sync::{Arc, Mutex};
use tracing::info;

use iort_dt_federation::FederatedDTState;

use crate::zenoh_bridge::AnomalyAlert;

/// Thread-safe local SQLite cache.
/// Wraps rusqlite::Connection in Arc<Mutex<>> for concurrent access
/// from Zenoh bridge (writer) and sync engine (reader).
#[derive(Clone)]
pub struct LocalCache {
    conn: Arc<Mutex<Connection>>,
}

impl LocalCache {
    /// Open (or create) the local SQLite database.
    /// Applies the same schema as D1 to enable trivial delta sync.
    pub fn open(path: &str) -> Result<Self> {
        let conn = Connection::open(path)?;

        // Enable WAL mode for concurrent reads during sync
        conn.pragma_update(None, "journal_mode", "WAL")?;

        // Create tables matching D1 schema
        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS vehicles (
                id          INTEGER PRIMARY KEY,
                name        TEXT    NOT NULL,
                type        TEXT    NOT NULL,
                last_seen   TEXT,
                status      TEXT    NOT NULL DEFAULT 'offline',
                created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS state_vectors (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                vehicle_id  INTEGER NOT NULL,
                timestamp   TEXT    NOT NULL DEFAULT (datetime('now')),
                pose_x      REAL,
                pose_y      REAL,
                pose_z      REAL,
                yaw         REAL,
                position_variance REAL,
                health_score     INTEGER,
                mission_phase    INTEGER,
                anomaly_detected INTEGER NOT NULL DEFAULT 0,
                -- Sync tracking: 0 = not yet uploaded to Cloudflare
                synced      INTEGER NOT NULL DEFAULT 0,
                FOREIGN KEY (vehicle_id) REFERENCES vehicles(id)
            );

            CREATE TABLE IF NOT EXISTS anomalies (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                vehicle_id      INTEGER NOT NULL,
                detected_at     TEXT    NOT NULL,
                received_at     TEXT    NOT NULL DEFAULT (datetime('now')),
                detector_type   TEXT,
                confidence      REAL,
                severity        REAL,
                dimension       TEXT,
                -- Sync tracking
                synced          INTEGER NOT NULL DEFAULT 0,
                FOREIGN KEY (vehicle_id) REFERENCES vehicles(id)
            );

            CREATE INDEX IF NOT EXISTS idx_sv_unsynced
                ON state_vectors(synced) WHERE synced = 0;

            CREATE INDEX IF NOT EXISTS idx_anom_unsynced
                ON anomalies(synced) WHERE synced = 0;
            ",
        )?;

        info!("Local cache schema initialized");

        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
        })
    }

    /// Insert a state vector from Zenoh bridge. Marked as unsynced.
    pub fn insert_state(&self, state: &FederatedDTState) -> Result<()> {
        let conn = self.conn.lock().map_err(|e| anyhow::anyhow!("{e}"))?;
        conn.execute(
            "INSERT INTO state_vectors
             (vehicle_id, pose_x, pose_y, pose_z, yaw,
              position_variance, health_score, mission_phase, anomaly_detected)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                state.auv_id,
                state.x,
                state.y,
                state.z,
                state.yaw,
                state.position_variance,
                state.health_score,
                state.mission_phase,
                state.anomaly_detected as i32,
            ],
        )?;
        Ok(())
    }

    /// Insert an anomaly alert. Marked as unsynced (high priority).
    pub fn insert_anomaly(&self, alert: &AnomalyAlert) -> Result<()> {
        let conn = self.conn.lock().map_err(|e| anyhow::anyhow!("{e}"))?;
        conn.execute(
            "INSERT INTO anomalies
             (vehicle_id, detected_at, detector_type, confidence, severity, dimension)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                alert.vehicle_id,
                alert.detected_at,
                alert.detector_type,
                alert.confidence,
                alert.severity,
                alert.dimension,
            ],
        )?;
        Ok(())
    }

    /// Get all unsynced state vectors (for batch upload).
    /// Returns (row_id, state_json) pairs. Limit to batch_size rows.
    pub fn get_unsent_states(&self, batch_size: usize) -> Result<Vec<(i64, String)>> {
        let conn = self.conn.lock().map_err(|e| anyhow::anyhow!("{e}"))?;
        let mut stmt = conn.prepare(
            "SELECT id, vehicle_id, pose_x, pose_y, pose_z, yaw,
                    position_variance, health_score, mission_phase, anomaly_detected
             FROM state_vectors WHERE synced = 0
             ORDER BY id ASC LIMIT ?1",
        )?;

        let rows = stmt.query_map(params![batch_size as i64], |row| {
            let id: i64 = row.get(0)?;
            let json = serde_json::json!({
                "auvId": row.get::<_, i32>(1)?,
                "timestamp": 0.0,
                "x": row.get::<_, f64>(2)?,
                "y": row.get::<_, f64>(3)?,
                "z": row.get::<_, f64>(4)?,
                "yaw": row.get::<_, f64>(5)?,
                "positionVariance": row.get::<_, f64>(6)?,
                "healthScore": row.get::<_, i32>(7)?,
                "missionPhase": row.get::<_, i32>(8)?,
                "anomalyDetected": row.get::<_, i32>(9)? != 0,
                "anomalyDimension": 0,
                "clock": {}
            });
            Ok((id, json.to_string()))
        })?;

        let mut result = Vec::new();
        for row in rows {
            result.push(row?);
        }
        Ok(result)
    }

    /// Get all unsynced anomalies (high priority, bypass batching).
    pub fn get_unsent_anomalies(&self, batch_size: usize) -> Result<Vec<(i64, String)>> {
        let conn = self.conn.lock().map_err(|e| anyhow::anyhow!("{e}"))?;
        let mut stmt = conn.prepare(
            "SELECT id, vehicle_id, detected_at, detector_type, confidence, severity, dimension
             FROM anomalies WHERE synced = 0
             ORDER BY id ASC LIMIT ?1",
        )?;

        let rows = stmt.query_map(params![batch_size as i64], |row| {
            let id: i64 = row.get(0)?;
            let json = serde_json::json!({
                "vehicleId": row.get::<_, i32>(1)?,
                "detectedAt": row.get::<_, String>(2)?,
                "detectorType": row.get::<_, String>(3)?,
                "confidence": row.get::<_, f64>(4)?,
                "severity": row.get::<_, f64>(5)?,
                "dimension": row.get::<_, String>(6)?
            });
            Ok((id, json.to_string()))
        })?;

        let mut result = Vec::new();
        for row in rows {
            result.push(row?);
        }
        Ok(result)
    }

    /// Mark rows as synced after successful upload to Cloudflare.
    pub fn mark_sent(&self, table: &str, ids: &[i64]) -> Result<()> {
        if ids.is_empty() {
            return Ok(());
        }
        let conn = self.conn.lock().map_err(|e| anyhow::anyhow!("{e}"))?;
        let placeholders: Vec<String> = ids.iter().map(|_| "?".to_string()).collect();
        let sql = format!(
            "UPDATE {table} SET synced = 1 WHERE id IN ({})",
            placeholders.join(",")
        );
        let params: Vec<Box<dyn rusqlite::types::ToSql>> =
            ids.iter().map(|id| Box::new(*id) as Box<dyn rusqlite::types::ToSql>).collect();
        conn.execute(&sql, rusqlite::params_from_iter(params))?;
        Ok(())
    }

    /// Get the latest state for each vehicle (for building gossip announcements).
    pub fn get_latest_states(&self) -> Result<Vec<FederatedDTState>> {
        let conn = self.conn.lock().map_err(|e| anyhow::anyhow!("{e}"))?;
        let mut stmt = conn.prepare(
            "SELECT vehicle_id, pose_x, pose_y, pose_z, yaw,
                    position_variance, health_score, mission_phase, anomaly_detected
             FROM state_vectors
             WHERE id IN (
                 SELECT MAX(id) FROM state_vectors GROUP BY vehicle_id
             )",
        )?;

        let rows = stmt.query_map([], |row| {
            Ok(FederatedDTState {
                auv_id: row.get::<_, i32>(0)? as u8,
                timestamp: 0.0,
                clock: iort_dt_federation::VectorClock::new(),
                x: row.get::<_, f64>(1)? as f32,
                y: row.get::<_, f64>(2)? as f32,
                z: row.get::<_, f64>(3)? as f32,
                yaw: row.get::<_, f64>(4)? as f32,
                position_variance: row.get::<_, f64>(5)? as f32,
                anomaly_detected: row.get::<_, i32>(8)? != 0,
                anomaly_dimension: 0,
                health_score: row.get::<_, i32>(6)? as u8,
                mission_phase: row.get::<_, i32>(7)? as u8,
            })
        })?;

        let mut result = Vec::new();
        for row in rows {
            result.push(row?);
        }
        Ok(result)
    }
}
