// IoRT-DT: Internet of Robotic Things - Digital Twins
// Copyright (C) 2026 Swanand Tanavade / University of Nebraska at Omaha
// SPDX-License-Identifier: Apache-2.0
//
// iort-twin-wasm — browser computation engine for Mission Control.
//
// Why WASM: the operator's dashboard mirrors the *real* fleet-tier algorithms
// (47-byte decode, CUSUM, Kalman fusion, PNR) so the numbers on screen are the
// same math that runs in Python and Rust. This is a pure-Rust crate with NO
// tokio/zenoh dependencies — it compiles to wasm32-unknown-unknown and runs in
// the browser, with a JS fallback when WASM is unavailable (honesty contract).
//
// Constraint notes:
//  - C1: this crate only DECODES the 47-byte wire format for display. It never
//    re-encodes or extends it — no byte budget is consumed.
//  - C6: browser-side computation is stateless per frame; causality is handled
//    by Zenoh HLC upstream, so no VectorClock is mirrored here.

pub mod cusum;
pub mod kalman;
pub mod pnr;
pub mod wire;

use wasm_bindgen::prelude::*;

// ─── Re-exports for the JS surface ───────────────────────────────────────────
pub use cusum::{CusumAlert, CusumDetector};
pub use kalman::{Estimate, FusedEstimate};
pub use pnr::PnrResult;
pub use wire::{DecodedState, WireError};

/// Version of the engine — surfaced in the dashboard footer badge.
#[wasm_bindgen]
pub fn engine_version() -> String {
    format!(
        "iort-twin-wasm {} (rustc {})",
        env!("CARGO_PKG_VERSION"),
        rustc_version()
    )
}

/// Build a fresh CUSUM detector with the deployed production thresholds
/// (Phase 5 recalibration: h=10.5, k=0.5 — see cusum-reference.md).
#[wasm_bindgen]
pub fn new_cusum_detector() -> CusumDetector {
    CusumDetector::production()
}

/// Decode a 47-byte AUVStateVector frame, validating CRC-16/CCITT-FALSE.
/// Returns None when the frame is malformed or the CRC fails (corrupt packet).
#[wasm_bindgen]
pub fn decode_state_vector(bytes: &[u8]) -> Option<DecodedState> {
    wire::decode_state_vector(bytes).ok()
}

/// CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF) — exposed for live CRC display.
#[wasm_bindgen]
pub fn crc16_ccitt_false(data: &[u8]) -> u16 {
    wire::crc16_ccitt_false(data)
}

/// Inverse-covariance Kalman fusion of two position estimates
/// (mirrors federation `kalman_reconcile`).
// 8 flat args are required by the wasm-bindgen FFI surface (no struct literals
// across the JS boundary) — clippy's too_many_arguments is expected here.
#[allow(clippy::too_many_arguments)]
#[wasm_bindgen]
pub fn kalman_fuse(
    a_x: f64,
    a_y: f64,
    a_z: f64,
    a_variance: f64,
    b_x: f64,
    b_y: f64,
    b_z: f64,
    b_variance: f64,
) -> FusedEstimate {
    kalman::fuse(
        Estimate {
            x: a_x,
            y: a_y,
            z: a_z,
            variance: a_variance,
        },
        Estimate {
            x: b_x,
            y: b_y,
            z: b_z,
            variance: b_variance,
        },
    )
}

/// Point-of-no-return energy model (mirrors SafetyEngine).
#[wasm_bindgen]
pub fn pnr_minutes(
    battery_pct: f64,
    battery_capacity_wh: f64,
    distance_m: f64,
    effective_speed_ms: f64,
    power_w: f64,
    safety_margin: f64,
) -> PnrResult {
    pnr::calculate(pnr::PnrInput {
        battery_pct,
        battery_capacity_wh,
        distance_m,
        effective_speed_ms,
        power_w,
        safety_margin,
    })
}

fn rustc_version() -> &'static str {
    // Injected at build time; falls back to "unknown" for non-cargo builds.
    option_env!("RUSTC_VERSION").unwrap_or("unknown")
}
