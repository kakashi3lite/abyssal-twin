// Bandwidth Monitor: Adaptive sync rate based on satellite link quality.
// Extends RQ1's adaptive rate controller concept to cloud-edge sync.
//
// Three tiers (boundaries from [bandwidth_tiers] config):
//   Emergency (<emergency_threshold_kbps, e.g. 10): Anomaly alerts + heartbeats only
//   Mission (emergency..mission_threshold_kbps, e.g. 10-50): State at 0.1 Hz (every 10s)
//   Full (>=mission_threshold_kbps, e.g. 50): State at 1 Hz + extended telemetry
//
// Note: full_threshold_kbps is an informational "fully healthy" marker. The Full
// tier activates at mission_threshold_kbps (the documented floor is 50 kbps).

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
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
    // True once at least one transfer has been measured (EMA is valid)
    has_measurement: Arc<AtomicBool>,
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
            // No transfer measured yet → current_tier() reports Full so the sync
            // engine can bootstrap. Once the first upload completes, the EMA
            // adapts downward from real measurements.
            has_measurement: Arc::new(AtomicBool::new(false)),
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
        self.has_measurement.store(true, Ordering::Relaxed);
    }

    /// Determine current bandwidth tier from measured throughput.
    ///
    /// Tier boundaries (kbps):
    ///   kbps <  emergency_threshold_kbps → Emergency
    ///   kbps <  mission_threshold_kbps    → Mission
    ///   kbps >= mission_threshold_kbps    → Full
    ///
    /// Previously this used two `>=` checks, which misclassified the 10-50 kbps
    /// band as Emergency and the 50-100 kbps band as Mission. The Emergency tier
    /// must only apply below `emergency_threshold_kbps`.
    pub fn current_tier(&self) -> BandwidthTier {
        // Bootstrap: with no transfer measured yet, report Full so the sync
        // engine actually attempts its first upload. Once measured, the EMA
        // governs the tier and adapts downward to real link conditions.
        if !self.has_measurement.load(Ordering::Relaxed) {
            return BandwidthTier::Full;
        }

        let bps = self.measured_bps.load(Ordering::Relaxed);
        let kbps = (bps * 8) / 1000; // Convert bytes/sec to kbps

        if kbps < u64::from(self.thresholds.emergency_threshold_kbps) {
            BandwidthTier::Emergency
        } else if kbps < u64::from(self.thresholds.mission_threshold_kbps) {
            BandwidthTier::Mission
        } else {
            BandwidthTier::Full
        }
    }

    /// Get measured bandwidth in kbps.
    pub fn measured_kbps(&self) -> u64 {
        let bps = self.measured_bps.load(Ordering::Relaxed);
        (bps * 8) / 1000
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::BandwidthTierConfig;

    /// Matches the values in config.toml's [bandwidth_tiers] section.
    fn test_config() -> BandwidthTierConfig {
        BandwidthTierConfig {
            emergency_threshold_kbps: 10,
            mission_threshold_kbps: 50,
            full_threshold_kbps: 100,
        }
    }

    /// Build a monitor whose first EMA sample equals exactly `kbps`.
    /// (The first `report_transfer` with old==0 sets the measurement exactly.)
    fn monitor_at_kbps(kbps: u64) -> BandwidthMonitor {
        let monitor = BandwidthMonitor::new(&test_config());
        let bytes_per_sec = (kbps * 1000) / 8; // such that bps*8/1000 == kbps
        monitor.report_transfer(bytes_per_sec, 1000);
        monitor
    }

    #[test]
    fn emergency_below_threshold() {
        assert_eq!(monitor_at_kbps(1).current_tier(), BandwidthTier::Emergency);
        assert_eq!(monitor_at_kbps(9).current_tier(), BandwidthTier::Emergency);
    }

    #[test]
    fn fresh_monitor_bootstraps_at_full_tier() {
        // Regression: a gateway with no transfer measured yet must report Full
        // so the sync engine attempts its first upload. Previously it started
        // at 0 kbps = Emergency, and since state sync is skipped in Emergency
        // and nothing ever reported a transfer, the gateway could never sync.
        let monitor = BandwidthMonitor::new(&test_config());
        assert_eq!(monitor.current_tier(), BandwidthTier::Full);
        assert_eq!(monitor.measured_kbps(), 0);

        // After one slow transfer, the EMA takes over and drops to Emergency.
        monitor.report_transfer(125, 1000); // 1 kbps
        assert_eq!(monitor.measured_kbps(), 1);
        assert_eq!(monitor.current_tier(), BandwidthTier::Emergency);
    }

    #[test]
    fn mission_from_threshold_to_mission_boundary() {
        // 10 kbps is the lower edge of Mission (must NOT be Emergency)
        assert_eq!(monitor_at_kbps(10).current_tier(), BandwidthTier::Mission);
        assert_eq!(monitor_at_kbps(30).current_tier(), BandwidthTier::Mission);
        assert_eq!(monitor_at_kbps(49).current_tier(), BandwidthTier::Mission);
    }

    #[test]
    fn full_from_mission_boundary_up() {
        // 50 kbps is the floor of Full (must NOT be Mission)
        assert_eq!(monitor_at_kbps(50).current_tier(), BandwidthTier::Full);
        assert_eq!(monitor_at_kbps(75).current_tier(), BandwidthTier::Full);
        assert_eq!(monitor_at_kbps(150).current_tier(), BandwidthTier::Full);
    }

    #[test]
    fn tier_parameters_match_contract() {
        assert_eq!(BandwidthTier::Emergency.sync_interval_secs(), 300);
        assert_eq!(BandwidthTier::Mission.sync_interval_secs(), 10);
        assert_eq!(BandwidthTier::Full.sync_interval_secs(), 1);

        assert_eq!(BandwidthTier::Emergency.max_batch_bytes(), 256);
        assert_eq!(BandwidthTier::Mission.max_batch_bytes(), 4_096);
        assert_eq!(BandwidthTier::Full.max_batch_bytes(), 102_400);
    }

    #[test]
    fn ema_smoothing_blends_samples() {
        let monitor = BandwidthMonitor::new(&test_config());

        // First sample: 20 kbps (old==0 → taken exactly)
        monitor.report_transfer(2500, 1000);
        assert_eq!(monitor.measured_kbps(), 20);
        assert_eq!(monitor.current_tier(), BandwidthTier::Mission);

        // Second sample: 100 kbps → EMA = (100*3 + 20*7)/10 = 44 kbps → still Mission
        monitor.report_transfer(12_500, 1000);
        assert_eq!(monitor.measured_kbps(), 44);
        assert_eq!(monitor.current_tier(), BandwidthTier::Mission);
    }
}
