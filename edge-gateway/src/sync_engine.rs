// Sync Engine: Orchestrates data upload from local cache to Cloudflare.
// Implements priority queue, bandwidth-adaptive batching, and retry logic.
//
// Priority levels:
//   P0 — Anomaly alerts: bypass batching, send immediately
//   P1 — State vectors: batch every BATCH_INTERVAL, compress with zstd
//   P2 — Debug logs: batch every 5 min (lowest priority)

use std::time::{Duration, Instant};

use anyhow::Result;
use tracing::{debug, error, info, warn};

use crate::bandwidth_monitor::{BandwidthMonitor, BandwidthTier};
use crate::cloudflare_client::CloudflareClient;
use crate::local_cache::LocalCache;
use crate::SatelliteConfig;

/// Maximum retry attempts before dropping a batch (will be retried on next cycle).
const MAX_RETRIES: u32 = 5;

/// Run the sync engine loop.
pub async fn run(
    cache: LocalCache,
    client: CloudflareClient,
    bw_monitor: BandwidthMonitor,
    config: &SatelliteConfig,
) -> Result<()> {
    info!("Sync engine starting");

    let batch_interval = Duration::from_secs(config.batch_interval_seconds);
    let mut last_state_sync = Instant::now();
    let mut retry_backoff = Duration::from_secs(1);

    loop {
        let tier = bw_monitor.current_tier();

        // ── P0: Anomaly alerts (always sent, regardless of tier) ────────
        match cache.get_unsent_anomalies(100) {
            Ok(anomalies) if !anomalies.is_empty() => {
                let ids: Vec<i64> = anomalies.iter().map(|(id, _)| *id).collect();
                let jsons: Vec<String> = anomalies.into_iter().map(|(_, j)| j).collect();
                let payload = format!("[{}]", jsons.join(","));

                match client.upload_json("/api/v1/ingest", &payload).await {
                    Ok(()) => {
                        info!(count = ids.len(), "Anomaly alerts synced");
                        let _ = cache.mark_sent("anomalies", &ids);
                        retry_backoff = Duration::from_secs(1);
                    }
                    Err(e) => {
                        warn!("Anomaly sync failed (will retry): {e}");
                    }
                }
            }
            Err(e) => error!("Failed to read unsent anomalies: {e}"),
            _ => {}
        }

        // ── P1: State vectors (batched, compressed, bandwidth-adaptive) ─
        let state_sync_due = last_state_sync.elapsed() >= batch_interval
            || (tier == BandwidthTier::Full
                && last_state_sync.elapsed() >= Duration::from_secs(1));

        if state_sync_due && tier != BandwidthTier::Emergency {
            let max_batch = tier.max_batch_bytes();
            let batch_count = max_batch / 100; // ~100 bytes per state JSON

            match cache.get_unsent_states(batch_count) {
                Ok(states) if !states.is_empty() => {
                    let ids: Vec<i64> = states.iter().map(|(id, _)| *id).collect();
                    let jsons: Vec<String> = states.into_iter().map(|(_, j)| j).collect();
                    let payload = format!(
                        r#"{{"states":[{}],"anomalies":[]}}"#,
                        jsons.join(",")
                    );

                    // Compress with zstd for satellite efficiency
                    let compressed =
                        zstd::encode_all(payload.as_bytes(), config.compression_level)?;

                    let start = Instant::now();
                    match upload_with_retry(&client, &compressed, MAX_RETRIES, &mut retry_backoff)
                        .await
                    {
                        Ok(bytes_sent) => {
                            let duration_ms = start.elapsed().as_millis() as u64;
                            bw_monitor.report_transfer(bytes_sent as u64, duration_ms);
                            let _ = cache.mark_sent("state_vectors", &ids);

                            info!(
                                count = ids.len(),
                                compressed_bytes = compressed.len(),
                                raw_bytes = payload.len(),
                                ratio = format!("{:.1}x", payload.len() as f64 / compressed.len() as f64),
                                tier = ?tier,
                                bw_kbps = bw_monitor.measured_kbps(),
                                "State batch synced"
                            );
                        }
                        Err(e) => {
                            warn!("State sync failed after retries: {e}");
                        }
                    }

                    last_state_sync = Instant::now();
                }
                Err(e) => error!("Failed to read unsent states: {e}"),
                _ => {
                    last_state_sync = Instant::now();
                }
            }
        }

        // Sleep based on current bandwidth tier
        let sleep_duration = match tier {
            BandwidthTier::Emergency => Duration::from_secs(30),
            BandwidthTier::Mission => Duration::from_secs(5),
            BandwidthTier::Full => Duration::from_secs(1),
        };

        debug!(
            tier = ?tier,
            sleep_ms = sleep_duration.as_millis(),
            "Sync cycle complete"
        );

        tokio::time::sleep(sleep_duration).await;
    }
}

/// Upload with exponential backoff retry.
/// Satellite connections are unreliable — retries are essential.
async fn upload_with_retry(
    client: &CloudflareClient,
    payload: &[u8],
    max_retries: u32,
    backoff: &mut Duration,
) -> Result<usize> {
    let mut attempts = 0;

    loop {
        match client.upload_batch(payload).await {
            Ok(bytes) => {
                *backoff = Duration::from_secs(1); // Reset on success
                return Ok(bytes);
            }
            Err(e) => {
                attempts += 1;
                if attempts >= max_retries {
                    return Err(e);
                }

                warn!(
                    attempt = attempts,
                    backoff_ms = backoff.as_millis(),
                    "Upload failed, retrying: {e}"
                );

                tokio::time::sleep(*backoff).await;

                // Exponential backoff: 1s, 2s, 4s, 8s... capped at 5 min
                *backoff = (*backoff * 2).min(Duration::from_secs(300));
            }
        }
    }
}
