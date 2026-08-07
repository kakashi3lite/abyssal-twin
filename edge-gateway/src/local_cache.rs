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
                battery_dv       INTEGER NOT NULL DEFAULT 245,
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
        // Auto-register the vehicle first: state_vectors.vehicle_id has a
        // FOREIGN KEY to vehicles(id), and LocalCache::open creates the schema
        // without seed rows — the gateway must be able to bootstrap from any
        // auv_id it sees on the acoustic link (mirrors the DO checkpoint fix).
        conn.execute(
            "INSERT OR IGNORE INTO vehicles (id, name, type, status)
             VALUES (?1, ?2, 'auv', 'online')",
            params![state.auv_id, format!("auv_{}", state.auv_id)],
        )?;
        conn.execute(
            "INSERT INTO state_vectors
             (vehicle_id, timestamp, pose_x, pose_y, pose_z, yaw,
              position_variance, health_score, battery_dv, mission_phase, anomaly_detected)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                state.auv_id,
                state.timestamp.to_string(),
                state.x,
                state.y,
                state.z,
                state.yaw,
                state.position_variance,
                state.health_score,
                state.battery_dv,
                state.mission_phase,
                state.anomaly_detected as i32,
            ],
        )?;
        Ok(())
    }

    /// Insert an anomaly alert. Marked as unsynced (high priority).
    pub fn insert_anomaly(&self, alert: &AnomalyAlert) -> Result<()> {
        let conn = self.conn.lock().map_err(|e| anyhow::anyhow!("{e}"))?;
        // Auto-register the vehicle (see insert_state — FK bootstrap).
        conn.execute(
            "INSERT OR IGNORE INTO vehicles (id, name, type, status)
             VALUES (?1, ?2, 'auv', 'online')",
            params![alert.vehicle_id, format!("auv_{}", alert.vehicle_id)],
        )?;
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
            "SELECT id, vehicle_id, timestamp, pose_x, pose_y, pose_z, yaw,
                    position_variance, health_score, battery_dv, mission_phase, anomaly_detected
             FROM state_vectors WHERE synced = 0
             ORDER BY id ASC LIMIT ?1",
        )?;

        let rows = stmt.query_map(params![batch_size as i64], |row| {
            let id: i64 = row.get(0)?;
            // timestamp is stored as TEXT (matches D1 schema) — parse as f64.
            let ts: f64 = row
                .get::<_, String>(2)?
                .parse()
                .unwrap_or(0.0);
            // battery_dv (0-255 decivolts) → batteryPct (0-100%)
            let battery_dv: i32 = row.get(9)?;
            let battery_pct = (battery_dv as f64 * 100.0 / 255.0).round();
            let json = serde_json::json!({
                "auvId": row.get::<_, i32>(1)?,
                "timestamp": ts,
                "x": row.get::<_, f64>(3)?,
                "y": row.get::<_, f64>(4)?,
                "z": row.get::<_, f64>(5)?,
                "yaw": row.get::<_, f64>(6)?,
                "positionVariance": row.get::<_, f64>(7)?,
                "healthScore": row.get::<_, i32>(8)?,
                "batteryPct": battery_pct,
                "missionPhase": row.get::<_, i32>(10)?,
                "anomalyDetected": row.get::<_, i32>(11)? != 0,
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
            "SELECT vehicle_id, timestamp, pose_x, pose_y, pose_z, yaw,
                    position_variance, health_score, battery_dv, mission_phase, anomaly_detected
             FROM state_vectors
             WHERE id IN (
                 SELECT MAX(id) FROM state_vectors GROUP BY vehicle_id
             )",
        )?;

        let rows = stmt.query_map([], |row| {
            let ts: f64 = row
                .get::<_, String>(1)?
                .parse()
                .unwrap_or(0.0);
            Ok(FederatedDTState {
                auv_id: row.get::<_, i32>(0)? as u8,
                timestamp: ts,
                clock: iort_dt_federation::VectorClock::new(),
                x: row.get::<_, f64>(2)? as f32,
                y: row.get::<_, f64>(3)? as f32,
                z: row.get::<_, f64>(4)? as f32,
                yaw: row.get::<_, f64>(5)? as f32,
                position_variance: row.get::<_, f64>(6)? as f32,
                anomaly_detected: row.get::<_, i32>(10)? != 0,
                anomaly_dimension: 0,
                health_score: row.get::<_, i32>(7)? as u8,
                battery_dv: row.get::<_, i32>(8)? as u8,
                mission_phase: row.get::<_, i32>(9)? as u8,
            })
        })?;

        let mut result = Vec::new();
        for row in rows {
            result.push(row?);
        }
        Ok(result)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::zenoh_bridge::AnomalyAlert;
    use iort_dt_federation::VectorClock;

    fn temp_db(name: &str) -> String {
        let mut path = std::env::temp_dir();
        path.push(format!(
            "{}-{}-{}.db",
            name,
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        path.to_str().unwrap().to_string()
    }

    fn sample_state(auv_id: u8) -> FederatedDTState {
        FederatedDTState {
            auv_id,
            timestamp: 1754668800.0,
            clock: VectorClock::new(),
            x: 10.5,
            y: 20.25,
            z: -15.5,
            yaw: 1.5,
            position_variance: 0.05,
            anomaly_detected: false,
            anomaly_dimension: 0,
            health_score: 200,
            battery_dv: 245,
            mission_phase: 2,
        }
    }

    #[test]
    fn insert_state_auto_registers_unknown_vehicle() {
        let path = temp_db("cache_state");
        let cache = LocalCache::open(&path).unwrap();

        // A fresh cache has NO vehicles — the FK would reject the insert
        // without auto-registration.
        cache.insert_state(&sample_state(1)).unwrap();

        let conn = cache.conn.lock().unwrap();
        let vehicle_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM vehicles WHERE id = 1", [], |r| r.get(0))
            .unwrap();
        assert_eq!(vehicle_count, 1);

        let state_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM state_vectors", [], |r| r.get(0))
            .unwrap();
        assert_eq!(state_count, 1);

        let synced: i64 = conn
            .query_row("SELECT synced FROM state_vectors LIMIT 1", [], |r| r.get(0))
            .unwrap();
        assert_eq!(synced, 0, "buffered state must start unsynced");
        drop(conn);

        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn insert_anomaly_auto_registers_unknown_vehicle() {
        let path = temp_db("cache_anom");
        let cache = LocalCache::open(&path).unwrap();

        let alert = AnomalyAlert {
            vehicle_id: 2,
            detected_at: "2026-08-08T00:00:00Z".to_string(),
            detector_type: "cusum".to_string(),
            confidence: 0.95,
            severity: 0.7,
            dimension: "depth".to_string(),
        };
        cache.insert_anomaly(&alert).unwrap();

        let conn = cache.conn.lock().unwrap();
        let vehicle_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM vehicles WHERE id = 2", [], |r| r.get(0))
            .unwrap();
        assert_eq!(vehicle_count, 1);

        let anom_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM anomalies", [], |r| r.get(0))
            .unwrap();
        assert_eq!(anom_count, 1);
        drop(conn);

        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn unsent_states_round_trip_through_mark_sent() {
        let path = temp_db("cache_sync");
        let cache = LocalCache::open(&path).unwrap();

        cache.insert_state(&sample_state(1)).unwrap();
        cache.insert_state(&sample_state(2)).unwrap();

        let unsent = cache.get_unsent_states(10).unwrap();
        assert_eq!(unsent.len(), 2, "both states buffered as unsynced");
        // JSON shape matches the Cloudflare ingest contract (camelCase).
        assert!(unsent[0].1.contains("\"auvId\":1"), "{}", unsent[0].1);
        assert!(unsent[0].1.contains("\"x\":"), "{}", unsent[0].1);

        let ids: Vec<i64> = unsent.iter().map(|(id, _)| *id).collect();
        cache.mark_sent("state_vectors", &ids).unwrap();
        assert!(cache.get_unsent_states(10).unwrap().is_empty());

        std::fs::remove_file(&path).ok();
    }
}
