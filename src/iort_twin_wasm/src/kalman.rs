// Inverse-covariance Kalman fusion.
//
// Mirrors `src/iort_dt_federation/src/lib.rs:kalman_reconcile`:
//   w_i = 1 / (σ²_i + 1e-10)
//   x_fused = (Σ w_i · x_i) / Σ w_i
//   σ²_fused = 1 / Σ w_i   (harmonic mean of variances)
//
// This is the optimal linear estimator under Gaussian uncertainty, used for
// partition-heal reconciliation. The browser mirror lets the operator preview
// what the edge/cloud tiers will compute on reconnect.

use wasm_bindgen::prelude::*;

/// A single position estimate with its uncertainty.
#[wasm_bindgen]
#[derive(Debug, Clone, Copy)]
pub struct Estimate {
    pub(crate) x: f64,
    pub(crate) y: f64,
    pub(crate) z: f64,
    pub(crate) variance: f64,
}

#[wasm_bindgen]
impl Estimate {
    #[wasm_bindgen(constructor)]
    pub fn new(x: f64, y: f64, z: f64, variance: f64) -> Self {
        Self { x, y, z, variance }
    }
    #[wasm_bindgen(getter)]
    pub fn x(&self) -> f64 {
        self.x
    }
    #[wasm_bindgen(getter)]
    pub fn y(&self) -> f64 {
        self.y
    }
    #[wasm_bindgen(getter)]
    pub fn z(&self) -> f64 {
        self.z
    }
    #[wasm_bindgen(getter)]
    pub fn variance(&self) -> f64 {
        self.variance
    }
}

/// The fused result.
#[wasm_bindgen]
#[derive(Debug, Clone, Copy)]
pub struct FusedEstimate {
    pub(crate) x: f64,
    pub(crate) y: f64,
    pub(crate) z: f64,
    pub(crate) variance: f64,
}

#[wasm_bindgen]
impl FusedEstimate {
    #[wasm_bindgen(getter)]
    pub fn x(&self) -> f64 {
        self.x
    }
    #[wasm_bindgen(getter)]
    pub fn y(&self) -> f64 {
        self.y
    }
    #[wasm_bindgen(getter)]
    pub fn z(&self) -> f64 {
        self.z
    }
    #[wasm_bindgen(getter)]
    pub fn variance(&self) -> f64 {
        self.variance
    }
}

/// Fuse two estimates with inverse-covariance weighting.
pub fn fuse(a: Estimate, b: Estimate) -> FusedEstimate {
    fuse_slice(&[a, b])
}

/// Fuse N estimates. With one estimate, returns it (variance unchanged).
pub fn fuse_slice(states: &[Estimate]) -> FusedEstimate {
    let eps = 1e-10;
    let mut w_total = 0.0;
    let mut sx = 0.0;
    let mut sy = 0.0;
    let mut sz = 0.0;
    for s in states {
        let w = 1.0 / (s.variance + eps);
        w_total += w;
        sx += w * s.x;
        sy += w * s.y;
        sz += w * s.z;
    }
    if w_total == 0.0 {
        return FusedEstimate {
            x: 0.0,
            y: 0.0,
            z: 0.0,
            variance: f64::INFINITY,
        };
    }
    FusedEstimate {
        x: sx / w_total,
        y: sy / w_total,
        z: sz / w_total,
        variance: 1.0 / w_total,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn favors_lower_variance() {
        // A: certain (σ²=1) at x=10; B: uncertain (σ²=100) at x=20.
        let f = fuse(
            Estimate::new(10.0, 0.0, 0.0, 1.0),
            Estimate::new(20.0, 0.0, 0.0, 100.0),
        );
        assert!(
            f.x < 12.0,
            "fused x={} should be close to certain estimate",
            f.x
        );
        assert!(f.x > 9.0);
        // Fused variance must be below the more-certain input's variance.
        assert!(f.variance < 1.0);
    }

    #[test]
    fn equal_variance_averages() {
        let f = fuse(
            Estimate::new(10.0, 0.0, 0.0, 2.0),
            Estimate::new(20.0, 0.0, 0.0, 2.0),
        );
        assert!((f.x - 15.0).abs() < 1e-9);
        assert!((f.variance - 1.0).abs() < 1e-9); // harmonic mean of 2,2 = 1
    }

    #[test]
    fn single_estimate_unchanged() {
        let f = fuse_slice(&[Estimate::new(5.0, 6.0, 7.0, 3.0)]);
        assert!((f.x - 5.0).abs() < 1e-9);
        assert!((f.variance - 3.0).abs() < 1e-9);
    }

    #[test]
    fn three_way_fusion_converges() {
        let f = fuse_slice(&[
            Estimate::new(0.0, 0.0, 0.0, 1.0),
            Estimate::new(3.0, 0.0, 0.0, 1.0),
            Estimate::new(6.0, 0.0, 0.0, 1.0),
        ]);
        assert!((f.x - 3.0).abs() < 1e-9);
        assert!((f.variance - (1.0 / 3.0)).abs() < 1e-9);
    }
}
