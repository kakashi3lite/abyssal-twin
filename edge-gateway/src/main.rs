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
    /// Optional per-message HMAC key (C5). Empty = plain 47-byte frames only.
    /// When set, the bridge accepts the 57-byte authenticated frames the
    /// Python fleet tier signs with the SAME key (see security.py).
    /// Supports `${ENV_VAR}` references (e.g. `${ACOUSTIC_HMAC_KEY}`) so the
    /// key never lives in the committed config.toml.
    #[serde(default)]
    pub hmac_key: String,
    /// Optional Zenoh TLS transport (C5). When all cert paths are set, the
    /// bridge configures the Zenoh session for TLS/mTLS. Empty paths = the
    /// existing plaintext transport (simulation / dev).
    #[serde(default)]
    pub tls: AcousticTlsConfig,
}

/// Zenoh TLS transport configuration (C5). Paths are resolved from `${ENV}`
/// references by resolve_env_ref(). Empty strings disable TLS.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
pub struct AcousticTlsConfig {
    /// Path to the CA certificate used to validate peers.
    pub root_ca_certificate: String,
    /// Path to the TLS listening-side private key (router mode).
    pub listen_private_key: String,
    /// Path to the TLS listening-side public certificate (router mode).
    pub listen_certificate: String,
    /// Enables mutual TLS (client authentication).
    pub enable_mtls: bool,
    /// Path to the TLS connecting-side private key (client mode).
    pub connect_private_key: String,
    /// Path to the TLS connecting-side certificate (client mode).
    pub connect_certificate: String,
    /// Whether to verify hostname/DNS against the certificate on connect.
    pub verify_name_on_connect: bool,
}

impl AcousticTlsConfig {
    /// True when a full TLS setup is configured (CA + at least one key pair).
    pub fn is_enabled(&self) -> bool {
        !self.root_ca_certificate.is_empty()
            && (!self.listen_private_key.is_empty() || !self.connect_private_key.is_empty())
    }
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

/// Resolve a `${ENV_VAR}` reference to its environment value.
/// Values without the `${...}` wrapper are returned unchanged, so existing
/// literal configs keep working. Missing variables resolve to "" (fail-safe).
fn resolve_env_ref(value: &str) -> String {
    if value.starts_with("${") && value.ends_with('}') {
        let var_name = &value[2..value.len() - 1];
        std::env::var(var_name).unwrap_or_default()
    } else {
        value.to_string()
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    // Load configuration
    let config_path = std::env::var("GATEWAY_CONFIG")
        .unwrap_or_else(|_| "config.toml".to_string());
    let config_str = tokio::fs::read_to_string(&config_path).await?;
    let mut config: GatewayConfig = toml::from_str(&config_str)?;

    // Resolve `${ENV_VAR}` references in the acoustic HMAC key and TLS cert
    // paths so secrets live in the environment, not in config.toml.
    config.acoustic.hmac_key = resolve_env_ref(&config.acoustic.hmac_key);
    config.acoustic.tls = AcousticTlsConfig {
        root_ca_certificate: resolve_env_ref(&config.acoustic.tls.root_ca_certificate),
        listen_private_key: resolve_env_ref(&config.acoustic.tls.listen_private_key),
        listen_certificate: resolve_env_ref(&config.acoustic.tls.listen_certificate),
        enable_mtls: config.acoustic.tls.enable_mtls,
        connect_private_key: resolve_env_ref(&config.acoustic.tls.connect_private_key),
        connect_certificate: resolve_env_ref(&config.acoustic.tls.connect_certificate),
        verify_name_on_connect: config.acoustic.tls.verify_name_on_connect,
    };

    if config.acoustic.tls.is_enabled() {
        info!("Zenoh TLS transport ENABLED (C5) — acoustic link encrypted at transport layer");
    } else {
        info!("Zenoh TLS transport disabled (no certs) — plaintext acoustic transport");
    }

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

    // Spawn the Zenoh bridge (subscribes to AUV telemetry topics).
    // Non-fatal by design (offline-first, C3): if the acoustic/Zenoh side is
    // down, the gateway must keep operating and drain its buffer when
    // satellite connectivity returns. Log the failure and continue.
    {
        let cache_clone = cache.clone();
        let acoustic_config = config.acoustic.clone();
        tokio::spawn(async move {
            if let Err(e) = zenoh_bridge::run(acoustic_config, cache_clone).await {
                error!("Zenoh bridge failed (non-fatal, continuing): {e}");
            }
        });
    }

    // Spawn the sync engine (uploads buffered data to Cloudflare) — core loop.
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

    // The sync engine is the core loop; Zenoh is decoupled. Keep the gateway
    // alive for as long as the sync engine runs.
    if let Err(e) = sync_handle.await {
        error!("Sync engine task failed: {e}");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_env_ref_leaves_literals_unchanged() {
        assert_eq!(resolve_env_ref("plain-value"), "plain-value");
        assert_eq!(resolve_env_ref(""), "");
        assert_eq!(resolve_env_ref("${"), "${"); // malformed → literal
    }

    #[test]
    fn resolve_env_ref_expands_environment() {
        std::env::set_var("TEST_ABYSSAL_KEY", "secret-abc");
        assert_eq!(resolve_env_ref("${TEST_ABYSSAL_KEY}"), "secret-abc");
        std::env::remove_var("TEST_ABYSSAL_KEY");
    }

    #[test]
    fn resolve_env_ref_missing_var_is_empty() {
        std::env::remove_var("TEST_ABYSSAL_MISSING_KEY");
        assert_eq!(resolve_env_ref("${TEST_ABYSSAL_MISSING_KEY}"), "");
    }
}
