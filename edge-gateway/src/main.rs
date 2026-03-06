// Abyssal Twin Edge Gateway — Support Vessel Entry Point
// Bridges AUV fleet (via Zenoh/acoustic) to Cloudflare edge (via satellite).
//
// Architecture:
//   [AUV Fleet] <-9600 baud-> [Zenoh Bridge] -> [Local Cache] -> [Sync Engine] -> [Cloudflare]
//
// The gateway operates autonomously during satellite outages, buffering data
// locally and performing delta sync when connectivity is restored.

mod bandwidth_monitor;
mod cloudflare_client;
mod local_cache;
mod sync_engine;
mod zenoh_bridge;

use anyhow::Result;
use serde::Deserialize;
use tracing::{error, info};

/// Top-level configuration loaded from config.toml.
#[derive(Debug, Deserialize)]
pub struct GatewayConfig {
    pub cloudflare: CloudflareConfig,
    pub satellite: SatelliteConfig,
    pub acoustic: AcousticConfig,
    pub gateway: GatewaySettings,
    pub bandwidth_tiers: BandwidthTierConfig,
}

#[derive(Debug, Deserialize)]
pub struct CloudflareConfig {
    pub api_url: String,
    pub ws_url: String,
    pub api_token: String,
    pub tunnel_token: String,
}

#[derive(Debug, Deserialize)]
pub struct SatelliteConfig {
    pub bandwidth_limit_kbps: u32,
    pub batch_interval_seconds: u64,
    pub compression_level: i32,
    pub max_buffer_bytes: usize,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AcousticConfig {
    pub zenoh_config: String,
    pub local_cache_size_mb: u64,
    pub state_topic: String,
    pub anomaly_topic: String,
    pub federation_topic: String,
}

#[derive(Debug, Deserialize)]
pub struct GatewaySettings {
    pub vessel_id: u8,
    pub db_path: String,
    pub log_level: String,
    pub heartbeat_interval_seconds: u64,
}

#[derive(Debug, Deserialize)]
pub struct BandwidthTierConfig {
    pub emergency_threshold_kbps: u32,
    pub mission_threshold_kbps: u32,
    pub full_threshold_kbps: u32,
}

#[tokio::main]
async fn main() -> Result<()> {
    // Load configuration
    let config_path = std::env::var("GATEWAY_CONFIG")
        .unwrap_or_else(|_| "config.toml".to_string());
    let config_str = tokio::fs::read_to_string(&config_path).await?;
    let config: GatewayConfig = toml::from_str(&config_str)?;

    // Initialize tracing (structured JSON logs for observability)
    tracing_subscriber::fmt()
        .with_env_filter(&config.gateway.log_level)
        .json()
        .init();

    info!(
        vessel_id = config.gateway.vessel_id,
        "Starting Abyssal Twin Edge Gateway"
    );

    // Initialize components
    let cache = local_cache::LocalCache::open(&config.gateway.db_path)?;
    info!("Local SQLite cache opened at {}", config.gateway.db_path);

    let bw_monitor = bandwidth_monitor::BandwidthMonitor::new(&config.bandwidth_tiers);
    let cf_client = cloudflare_client::CloudflareClient::new(&config.cloudflare);

    // Spawn the Zenoh bridge (subscribes to AUV telemetry topics)
    let zenoh_handle = {
        let cache_clone = cache.clone();
        let acoustic_config = config.acoustic.clone();
        tokio::spawn(async move {
            if let Err(e) = zenoh_bridge::run(acoustic_config, cache_clone).await {
                error!("Zenoh bridge failed: {e}");
            }
        })
    };

    // Spawn the sync engine (uploads buffered data to Cloudflare)
    let sync_handle = {
        let cache_clone = cache.clone();
        tokio::spawn(async move {
            if let Err(e) =
                sync_engine::run(cache_clone, cf_client, bw_monitor, &config.satellite).await
            {
                error!("Sync engine failed: {e}");
            }
        })
    };

    info!("All subsystems started. Gateway is operational.");

    // Wait for either subsystem to exit (shouldn't happen in normal operation)
    tokio::select! {
        r = zenoh_handle => {
            error!("Zenoh bridge exited unexpectedly: {r:?}");
        }
        r = sync_handle => {
            error!("Sync engine exited unexpectedly: {r:?}");
        }
    }

    Ok(())
}
