// Point-of-no-return (PNR) energy model — browser mirror.
//
// Mirrors `mission-control/src/services/SafetyEngine.ts:calculatePointOfNoReturn`:
//   return_time_min = (distance / effective_speed) / 60
//   energy_required_wh = power_w × (return_time_min / 60)
//   battery_required_raw = (energy_required_wh / capacity_wh) × 100
//   remaining_energy_wh = (battery_pct / 100) × capacity_wh
//   minutes_to_pnr = (remaining_energy_wh / power_w × 60) − return_time_min
//
// Honesty contract preserved: this is a pure function of the inputs supplied.
// If the wire never delivers battery, the UI must render "—" — the caller's job.

use wasm_bindgen::prelude::*;

#[derive(Debug, Clone, Copy)]
pub struct PnrInput {
    pub battery_pct: f64,
    pub battery_capacity_wh: f64,
    pub distance_m: f64,
    pub effective_speed_ms: f64,
    pub power_w: f64,
    /// Safety margin multiplier applied to required battery (e.g. 1.2 = 20%).
    pub safety_margin: f64,
}

/// PNR computation result.
#[wasm_bindgen]
#[derive(Debug, Clone, Copy)]
pub struct PnrResult {
    pub(crate) minutes_to_pnr: f64,
    pub(crate) return_time_min: f64,
    pub(crate) energy_required_wh: f64,
    pub(crate) battery_required_pct: f64,
    pub(crate) battery_required_with_margin_pct: f64,
    pub(crate) remaining_energy_wh: f64,
}

#[wasm_bindgen]
impl PnrResult {
    #[wasm_bindgen(getter)]
    pub fn minutes_to_pnr(&self) -> f64 {
        self.minutes_to_pnr
    }
    #[wasm_bindgen(getter)]
    pub fn return_time_min(&self) -> f64 {
        self.return_time_min
    }
    #[wasm_bindgen(getter)]
    pub fn energy_required_wh(&self) -> f64 {
        self.energy_required_wh
    }
    #[wasm_bindgen(getter)]
    pub fn battery_required_pct(&self) -> f64 {
        self.battery_required_pct
    }
    #[wasm_bindgen(getter)]
    pub fn battery_required_with_margin_pct(&self) -> f64 {
        self.battery_required_with_margin_pct
    }
    #[wasm_bindgen(getter)]
    pub fn remaining_energy_wh(&self) -> f64 {
        self.remaining_energy_wh
    }
    /// True when the vehicle can still safely return (minutes_to_pnr > 0).
    #[wasm_bindgen(getter)]
    pub fn can_safely_return(&self) -> bool {
        self.minutes_to_pnr > 0.0
    }
}

pub fn calculate(input: PnrInput) -> PnrResult {
    let effective_speed = input.effective_speed_ms.max(0.5); // never divide by ~0
    let return_time_min = (input.distance_m / effective_speed) / 60.0;
    let return_time_h = return_time_min / 60.0;
    let energy_required_wh = input.power_w * return_time_h;
    let battery_required_raw = if input.battery_capacity_wh > 0.0 {
        (energy_required_wh / input.battery_capacity_wh) * 100.0
    } else {
        f64::INFINITY
    };
    let remaining_energy_wh = (input.battery_pct / 100.0) * input.battery_capacity_wh;
    let remaining_time_min = if input.power_w > 0.0 {
        (remaining_energy_wh / input.power_w) * 60.0
    } else {
        f64::INFINITY
    };
    PnrResult {
        minutes_to_pnr: remaining_time_min - return_time_min,
        return_time_min,
        energy_required_wh,
        battery_required_pct: battery_required_raw,
        battery_required_with_margin_pct: battery_required_raw * input.safety_margin,
        remaining_energy_wh,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> PnrInput {
        PnrInput {
            battery_pct: 80.0,
            battery_capacity_wh: 5000.0,
            distance_m: 3000.0,
            effective_speed_ms: 2.5,
            power_w: 100.0,
            safety_margin: 1.2,
        }
    }

    #[test]
    fn healthy_vehicle_positive_pnr() {
        let r = calculate(sample());
        assert!(r.minutes_to_pnr > 0.0);
        assert!(r.can_safely_return());
        // Remaining energy = 0.8 × 5000 = 4000 Wh → 2400 min at 100W.
        assert!((r.remaining_energy_wh - 4000.0).abs() < 1e-9);
        // Return: 3000m / 2.5 = 1200s = 20 min.
        assert!((r.return_time_min - 20.0).abs() < 1e-9);
        // Energy required = 100W × (20/60)h = 33.33 Wh → 0.667% of 5000.
        assert!((r.energy_required_wh - (100.0 * 20.0 / 60.0)).abs() < 1e-9);
        assert!((r.battery_required_pct - (100.0 * 20.0 / 60.0 / 50.0)).abs() < 1e-9);
    }

    #[test]
    fn exhausted_vehicle_negative_pnr() {
        let mut input = sample();
        input.battery_pct = 0.3; // 0.3% ≈ 15 Wh → 9 min left vs 20 min return
        let r = calculate(input);
        assert!(r.minutes_to_pnr < 0.0);
        assert!(!r.can_safely_return());
    }

    #[test]
    fn margin_scales_requirement() {
        let base = calculate(sample());
        let mut tight = sample();
        tight.safety_margin = 1.0;
        let tight_r = calculate(tight);
        assert!(
            (tight_r.battery_required_with_margin_pct - base.battery_required_pct).abs() < 1e-9
        );
        assert!(base.battery_required_with_margin_pct > base.battery_required_pct);
    }

    #[test]
    fn zero_distance_minimal_return() {
        let mut input = sample();
        input.distance_m = 0.0;
        let r = calculate(input);
        assert!((r.return_time_min - 0.0).abs() < 1e-9);
    }
}
