// Bandwidth Monitor: Adaptive sync rate based on satellite link quality.
// Extends RQ1's adaptive rate controller concept to cloud-edge sync.
//
// Three tiers:
//   Emergency (<10 kbps): Anomaly alerts + heartbeats only
//   Mission (10-50 kbps): State at 0.1 Hz (every 10s)
//   Full (>50 kbps): State at 1 Hz + extended telemetry

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Instant;

use crate::BandwidthTierConfig;

/// Bandwidth tier determines what data the sync engine uploads.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BandwidthTier {
    /// <10 kbps: Only anomaly alerts and heartbeats
    Emergency,
    /// 10-50 kbps: State at 0.1 Hz
    Mission,
    /// >50 kbps: Full telemetry at 1 Hz
    Full,
}

impl BandwidthTier {
    /// Sync interval in seconds for this tier.
    pub fn sync_interval_secs(&self) -> u64 {
        match self {
            BandwidthTier::Emergency => 300, // 5 minutes (heartbeat only)
            BandwidthTier::Mission => 10,    // 0.1 Hz
            BandwidthTier::Full => 1,        // 1 Hz
        }
    }

    /// Maximum batch size in bytes for this tier.
    pub fn max_batch_bytes(&self) -> usize {
        match self {
            BandwidthTier::Emergency => 256,    // Minimal: alert + heartbeat
            BandwidthTier::Mission => 4_096,    // ~87 state vectors
            BandwidthTier::Full => 102_400,     // 100 KB
        }
    }
}

/// Monitors satellite link bandwidth via upload throughput measurements.
/// Uses a sliding window of recent transfer rates.
pub struct BandwidthMonitor {
    thresholds: BandwidthTierConfig,
    // Measured bandwidth in bytes/sec (updated after each upload)
    measured_bps: Arc<AtomicU64>,
    last_measurement: Instant,
}

impl BandwidthMonitor {
    pub fn new(config: &BandwidthTierConfig) -> Self {
        Self {
            thresholds: BandwidthTierConfig {
                emergency_threshold_kbps: config.emergency_threshold_kbps,
                mission_threshold_kbps: config.mission_threshold_kbps,
                full_threshold_kbps: config.full_threshold_kbps,
            },
            measured_bps: Arc::new(AtomicU64::new(0)),
            last_measurement: Instant::now(),
        }
    }

    /// Report a completed upload for bandwidth estimation.
    /// Called by sync engine after each successful batch upload.
    pub fn report_transfer(&self, bytes: u64, duration_ms: u64) {
        if duration_ms == 0 {
            return;
        }
        let bps = (bytes * 1000) / duration_ms;
        // Exponential moving average: new = 0.3 * sample + 0.7 * old
        let old = self.measured_bps.load(Ordering::Relaxed);
        let smoothed = if old == 0 {
            bps
        } else {
            (bps * 3 + old * 7) / 10
        };
        self.measured_bps.store(smoothed, Ordering::Relaxed);
    }

    /// Determine current bandwidth tier from measured throughput.
    pub fn current_tier(&self) -> BandwidthTier {
        let bps = self.measured_bps.load(Ordering::Relaxed);
        let kbps = (bps * 8) / 1000; // Convert bytes/sec to kbps

        if kbps >= u64::from(self.thresholds.full_threshold_kbps) {
            BandwidthTier::Full
        } else if kbps >= u64::from(self.thresholds.mission_threshold_kbps) {
            BandwidthTier::Mission
        } else {
            BandwidthTier::Emergency
        }
    }

    /// Get measured bandwidth in kbps.
    pub fn measured_kbps(&self) -> u64 {
        let bps = self.measured_bps.load(Ordering::Relaxed);
        (bps * 8) / 1000
    }
}
