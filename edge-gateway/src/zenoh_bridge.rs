// Zenoh Bridge: Subscribes to local AUV fleet telemetry via acoustic modems.
// Deserializes FederatedDTState from bincode and inserts into local SQLite cache.
//
// Topic conventions (from docker/zenoh/acoustic.json5):
//   iort/dt/{auv_id}/state      — Compressed DT state vectors
//   iort/dt/{auv_id}/anomaly    — Anomaly alerts
//   iort/federation/{auv_id}    — Federation gossip messages

use anyhow::Result;
use tracing::{debug, error, info, warn};

use crate::local_cache::LocalCache;
use crate::AcousticConfig;

// Re-use the federation crate's types for zero-copy deserialization
use iort_dt_federation::{FederatedDTState, GossipMessage};

/// Run the Zenoh bridge: subscribe to AUV topics, buffer to local cache.
pub async fn run(config: AcousticConfig, cache: LocalCache) -> Result<()> {
    info!("Starting Zenoh bridge");

    // Open a Zenoh session (connects to local router on the vessel)
    let zenoh_config = zenoh::Config::from_file(&config.zenoh_config)
        .map_err(|e| anyhow::anyhow!("Failed to load Zenoh config: {e}"))?;

    let session = zenoh::open(zenoh_config)
        .await
        .map_err(|e| anyhow::anyhow!("Failed to open Zenoh session: {e}"))?;

    info!("Zenoh session established");

    // Subscribe to fleet state updates
    let state_sub = session
        .declare_subscriber(&config.state_topic)
        .await
        .map_err(|e| anyhow::anyhow!("State subscription failed: {e}"))?;

    info!(topic = %config.state_topic, "Subscribed to fleet state updates");

    // Subscribe to anomaly alerts
    let anomaly_sub = session
        .declare_subscriber(&config.anomaly_topic)
        .await
        .map_err(|e| anyhow::anyhow!("Anomaly subscription failed: {e}"))?;

    info!(topic = %config.anomaly_topic, "Subscribed to anomaly alerts");

    // Process incoming messages in parallel
    loop {
        tokio::select! {
            // Fleet state updates from AUVs
            sample = state_sub.recv_async() => {
                match sample {
                    Ok(sample) => {
                        let payload = sample.payload().to_bytes();
                        match bincode::deserialize::<FederatedDTState>(&payload) {
                            Ok(state) => {
                                debug!(
                                    auv_id = state.auv_id,
                                    x = state.x,
                                    y = state.y,
                                    z = state.z,
                                    "Received state update"
                                );
                                if let Err(e) = cache.insert_state(&state) {
                                    error!("Cache insert failed: {e}");
                                }
                            }
                            Err(e) => {
                                warn!("Failed to deserialize state: {e}");
                            }
                        }
                    }
                    Err(e) => {
                        error!("State subscription error: {e}");
                        break;
                    }
                }
            }

            // Anomaly alerts (high priority — bypass batching in sync engine)
            sample = anomaly_sub.recv_async() => {
                match sample {
                    Ok(sample) => {
                        let payload = sample.payload().to_bytes();
                        // Anomalies are serialized as JSON for human readability
                        match serde_json::from_slice::<AnomalyAlert>(&payload) {
                            Ok(alert) => {
                                info!(
                                    vehicle_id = alert.vehicle_id,
                                    detector = %alert.detector_type,
                                    severity = alert.severity,
                                    "Anomaly alert received"
                                );
                                if let Err(e) = cache.insert_anomaly(&alert) {
                                    error!("Anomaly cache insert failed: {e}");
                                }
                            }
                            Err(e) => {
                                warn!("Failed to deserialize anomaly: {e}");
                            }
                        }
                    }
                    Err(e) => {
                        error!("Anomaly subscription error: {e}");
                        break;
                    }
                }
            }
        }
    }

    Ok(())
}

/// Anomaly alert payload from CUSUM / Shiryaev-Roberts detectors.
#[derive(Debug, serde::Deserialize, serde::Serialize)]
pub struct AnomalyAlert {
    pub vehicle_id: u8,
    pub detected_at: String,
    pub detector_type: String,
    pub confidence: f64,
    pub severity: f64,
    pub dimension: String,
}
