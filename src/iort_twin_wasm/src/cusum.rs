// CUSUM anomaly detector — browser mirror.
//
// Mirrors `src/iort_dt_anomaly/iort_dt_anomaly/detectors.py:CUSUMDetector` with
// the Phase 5 recalibrated production thresholds (h=10.5, k=0.5) so the
// dashboard's live CUSUM gauges show the same S+/S− statistics the fleet tier
// computes. See references/cusum-reference.md.
//
//   S⁺(t) = max(0, S⁺(t−1) + z(t) − k)
//   S⁻(t) = max(0, S⁻(t−1) − z(t) − k)
//   Alarm when S⁺ > h (increase) or S⁻ > h (decrease)

use wasm_bindgen::prelude::*;

/// Production thresholds — Phase 5 empirical ARL₀ recalibration (h=10.5).
pub const PRODUCTION_THRESHOLD_H: f64 = 10.5;
pub const PRODUCTION_REFERENCE_K: f64 = 0.5;

/// CUSUM alert emitted on threshold crossing.
#[wasm_bindgen]
#[derive(Debug, Clone)]
pub struct CusumAlert {
    /// 0 = increase (S⁺), 1 = decrease (S⁻).
    direction: u8,
    s_plus: f64,
    s_minus: f64,
    samples_seen: u32,
}

#[wasm_bindgen]
impl CusumAlert {
    #[wasm_bindgen(getter)]
    pub fn direction(&self) -> u8 {
        self.direction
    }
    /// "increase" | "decrease" — matches the Python alert enum.
    #[wasm_bindgen(getter)]
    pub fn direction_label(&self) -> String {
        if self.direction == 0 {
            "increase".to_string()
        } else {
            "decrease".to_string()
        }
    }
    #[wasm_bindgen(getter)]
    pub fn s_plus(&self) -> f64 {
        self.s_plus
    }
    #[wasm_bindgen(getter)]
    pub fn s_minus(&self) -> f64 {
        self.s_minus
    }
    #[wasm_bindgen(getter)]
    pub fn samples_seen(&self) -> u32 {
        self.samples_seen
    }
}

/// Stateful CUSUM detector (one per monitored dimension).
#[wasm_bindgen]
#[derive(Debug, Clone)]
pub struct CusumDetector {
    s_plus: f64,
    s_minus: f64,
    threshold_h: f64,
    reference_k: f64,
    samples: u32,
    alarms: u32,
}

#[wasm_bindgen]
impl CusumDetector {
    #[wasm_bindgen(constructor)]
    pub fn new(threshold_h: f64, reference_k: f64) -> Self {
        Self {
            s_plus: 0.0,
            s_minus: 0.0,
            threshold_h,
            reference_k,
            samples: 0,
            alarms: 0,
        }
    }

    /// Detector preconfigured with the deployed production thresholds.
    pub fn production() -> Self {
        Self::new(PRODUCTION_THRESHOLD_H, PRODUCTION_REFERENCE_K)
    }

    /// Feed one standardized residual z-score. Returns an alert on crossing h.
    pub fn update(&mut self, z_score: f64) -> Option<CusumAlert> {
        self.s_plus = (self.s_plus + z_score - self.reference_k).max(0.0);
        self.s_minus = (self.s_minus - z_score - self.reference_k).max(0.0);
        self.samples += 1;
        if self.s_plus > self.threshold_h {
            self.alarms += 1;
            let alert = CusumAlert {
                direction: 0,
                s_plus: self.s_plus,
                s_minus: self.s_minus,
                samples_seen: self.samples,
            };
            self.reset();
            return Some(alert);
        }
        if self.s_minus > self.threshold_h {
            self.alarms += 1;
            let alert = CusumAlert {
                direction: 1,
                s_plus: self.s_plus,
                s_minus: self.s_minus,
                samples_seen: self.samples,
            };
            self.reset();
            return Some(alert);
        }
        None
    }

    pub fn reset(&mut self) {
        self.s_plus = 0.0;
        self.s_minus = 0.0;
    }

    #[wasm_bindgen(getter)]
    pub fn s_plus(&self) -> f64 {
        self.s_plus
    }
    #[wasm_bindgen(getter)]
    pub fn s_minus(&self) -> f64 {
        self.s_minus
    }
    #[wasm_bindgen(getter)]
    pub fn threshold_h(&self) -> f64 {
        self.threshold_h
    }
    #[wasm_bindgen(getter)]
    pub fn reference_k(&self) -> f64 {
        self.reference_k
    }
    #[wasm_bindgen(getter)]
    pub fn samples(&self) -> u32 {
        self.samples
    }
    #[wasm_bindgen(getter)]
    pub fn alarms(&self) -> u32 {
        self.alarms
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nominal_no_alarm() {
        let mut d = CusumDetector::production();
        for _ in 0..200 {
            assert!(d.update(0.0).is_none());
        }
        // Steady nominal z=0 → S⁺ stays at 0 (no accumulation).
        assert_eq!(d.s_plus(), 0.0);
        assert_eq!(d.samples(), 200);
        assert_eq!(d.alarms(), 0);
    }

    #[test]
    fn positive_shift_alarms() {
        let mut d = CusumDetector::new(2.0, 0.5); // small h for fast test
        let mut alerted = false;
        for _ in 0..50 {
            if d.update(1.0).is_some() {
                alerted = true;
                break;
            }
        }
        assert!(alerted, "persistent +1σ shift must alarm");
        // Detector resets after alarm.
        assert_eq!(d.s_plus(), 0.0);
        assert_eq!(d.alarms(), 1);
    }

    #[test]
    fn negative_shift_alarms() {
        let mut d = CusumDetector::new(2.0, 0.5);
        let mut alert = None;
        for _ in 0..50 {
            if let Some(a) = d.update(-1.0) {
                alert = Some(a);
                break;
            }
        }
        let a = alert.expect("persistent -1σ shift must alarm");
        assert_eq!(a.direction, 1);
        assert_eq!(a.direction_label(), "decrease");
    }

    #[test]
    fn production_config_values() {
        // Guard against accidental drift of the deployed threshold (C1 of ARL₀).
        assert_eq!(PRODUCTION_THRESHOLD_H, 10.5);
        assert_eq!(PRODUCTION_REFERENCE_K, 0.5);
    }

    #[test]
    fn isolated_spike_does_not_alarm() {
        // One big z-score is absorbed by the max(0, ·) recursion — no alarm.
        let mut d = CusumDetector::new(10.5, 0.5);
        assert!(d.update(6.0).is_none());
        assert!(d.update(-6.0).is_none());
        assert_eq!(d.alarms(), 0);
    }
}
