// IoRT-DT Federation Node — Rust Binary Entry Point
// Runs the gossip-based DT federation protocol as a standalone service

use anyhow::Result;
use std::collections::HashMap;
use std::env;
use tokio::time::{sleep, Duration};
use tracing::{info, warn};
use tracing_subscriber::EnvFilter;

use iort_dt_federation::prelude::*;

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize logging
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env().add_directive("iort_dt_federation=info".parse()?))
        .init();

    // Configuration from environment
    let auv_id: u8 = env::var("AUV_ID")
        .unwrap_or_else(|_| "0".to_string())
        .parse()
        .unwrap_or(0);

    let auv_count: u8 = env::var("AUV_COUNT")
        .unwrap_or_else(|_| "2".to_string())
        .parse()
        .unwrap_or(2);

    let gossip_interval_ms: u64 = env::var("GOSSIP_INTERVAL_MS")
        .unwrap_or_else(|_| "500".to_string())
        .parse()
        .unwrap_or(500);

    info!(
        "🤝 IoRT-DT Federation Node starting: AUV={}, fleet_size={}, gossip_interval={}ms",
        auv_id, auv_count, gossip_interval_ms
    );

    let manager = FederationManager::new(auv_id);

    // Main gossip loop
    let mut tick = 0u64;
    loop {
        tick += 1;

        // Generate gossip announcement
        let announcement = manager.build_gossip_announcement().await;

        // Log metrics every 10 ticks
        if tick % 10 == 0 {
            let states = manager.fleet_states.read().await;
            info!(
                "📊 Federation status: {} AUVs tracked, tick={}",
                states.len(), tick
            );

            // Compute formation coherence (for RQ2 metrics)
            // In production: ground truth comes from Stonefish
            let mock_ground_truth: HashMap<u8, (f64, f64, f64)> = states
                .keys()
                .map(|&id| (id, (0.0, 0.0, -5.0)))  // Mock: all at origin
                .collect();
            drop(states);

            let rms_error = manager.formation_coherence_error(&mock_ground_truth).await;
            info!("📏 Formation coherence RMS error: {:.3}m", rms_error);
        }

        sleep(Duration::from_millis(gossip_interval_ms)).await;
    }
}
