/* tslint:disable */
/* eslint-disable */

/**
 * CUSUM alert emitted on threshold crossing.
 */
export class CusumAlert {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    readonly direction: number;
    /**
     * "increase" | "decrease" — matches the Python alert enum.
     */
    readonly direction_label: string;
    readonly s_minus: number;
    readonly s_plus: number;
    readonly samples_seen: number;
}

/**
 * Stateful CUSUM detector (one per monitored dimension).
 */
export class CusumDetector {
    free(): void;
    [Symbol.dispose](): void;
    constructor(threshold_h: number, reference_k: number);
    /**
     * Detector preconfigured with the deployed production thresholds.
     */
    static production(): CusumDetector;
    reset(): void;
    /**
     * Feed one standardized residual z-score. Returns an alert on crossing h.
     */
    update(z_score: number): CusumAlert | undefined;
    readonly alarms: number;
    readonly reference_k: number;
    readonly s_minus: number;
    readonly s_plus: number;
    readonly samples: number;
    readonly threshold_h: number;
}

/**
 * Decoded, CRC-validated 47-byte frame.
 */
export class DecodedState {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Convenience: anomaly flag = bit 7 of flags (same as `models.py`).
     */
    readonly anomaly_detected: boolean;
    readonly auv_id: number;
    readonly battery_v: number;
    readonly crc_ok: boolean;
    readonly flags: number;
    /**
     * Mission phase: 0=idle 1=transit 2=survey 3=emergency (bits 5-6).
     */
    readonly mission_phase: number;
    readonly pitch_deg: number;
    readonly residuals: Float32Array;
    readonly roll_deg: number;
    readonly sequence: number;
    readonly thruster_rpms: Int16Array;
    readonly timestamp: number;
    readonly x_m: number;
    readonly y_m: number;
    readonly yaw_rad: number;
    readonly z_m: number;
}

/**
 * A single position estimate with its uncertainty.
 */
export class Estimate {
    free(): void;
    [Symbol.dispose](): void;
    constructor(x: number, y: number, z: number, variance: number);
    readonly variance: number;
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

/**
 * The fused result.
 */
export class FusedEstimate {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    readonly variance: number;
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

/**
 * PNR computation result.
 */
export class PnrResult {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    readonly battery_required_pct: number;
    readonly battery_required_with_margin_pct: number;
    /**
     * True when the vehicle can still safely return (minutes_to_pnr > 0).
     */
    readonly can_safely_return: boolean;
    readonly energy_required_wh: number;
    readonly minutes_to_pnr: number;
    readonly remaining_energy_wh: number;
    readonly return_time_min: number;
}

/**
 * Wire decode errors — surfaced as JS exceptions with a readable message.
 */
export class WireError {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    readonly detail: string;
    readonly kind: string;
}

/**
 * CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF) — exposed for live CRC display.
 */
export function crc16_ccitt_false(data: Uint8Array): number;

/**
 * Decode a 47-byte AUVStateVector frame, validating CRC-16/CCITT-FALSE.
 * Returns None when the frame is malformed or the CRC fails (corrupt packet).
 */
export function decode_state_vector(bytes: Uint8Array): DecodedState | undefined;

/**
 * Version of the engine — surfaced in the dashboard footer badge.
 */
export function engine_version(): string;

/**
 * Inverse-covariance Kalman fusion of two position estimates
 * (mirrors federation `kalman_reconcile`).
 */
export function kalman_fuse(a_x: number, a_y: number, a_z: number, a_variance: number, b_x: number, b_y: number, b_z: number, b_variance: number): FusedEstimate;

/**
 * Build a fresh CUSUM detector with the deployed production thresholds
 * (Phase 5 recalibration: h=10.5, k=0.5 — see cusum-reference.md).
 */
export function new_cusum_detector(): CusumDetector;

/**
 * Point-of-no-return energy model (mirrors SafetyEngine).
 */
export function pnr_minutes(battery_pct: number, battery_capacity_wh: number, distance_m: number, effective_speed_ms: number, power_w: number, safety_margin: number): PnrResult;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_cusumalert_free: (a: number, b: number) => void;
    readonly __wbg_cusumdetector_free: (a: number, b: number) => void;
    readonly __wbg_decodedstate_free: (a: number, b: number) => void;
    readonly __wbg_estimate_free: (a: number, b: number) => void;
    readonly __wbg_pnrresult_free: (a: number, b: number) => void;
    readonly __wbg_wireerror_free: (a: number, b: number) => void;
    readonly crc16_ccitt_false: (a: number, b: number) => number;
    readonly cusumalert_direction: (a: number) => number;
    readonly cusumalert_direction_label: (a: number, b: number) => void;
    readonly cusumdetector_new: (a: number, b: number) => number;
    readonly cusumdetector_production: () => number;
    readonly cusumdetector_update: (a: number, b: number) => number;
    readonly decode_state_vector: (a: number, b: number) => number;
    readonly decodedstate_anomaly_detected: (a: number) => number;
    readonly decodedstate_auv_id: (a: number) => number;
    readonly decodedstate_crc_ok: (a: number) => number;
    readonly decodedstate_flags: (a: number) => number;
    readonly decodedstate_mission_phase: (a: number) => number;
    readonly decodedstate_residuals: (a: number, b: number) => void;
    readonly decodedstate_thruster_rpms: (a: number, b: number) => void;
    readonly engine_version: (a: number) => void;
    readonly estimate_new: (a: number, b: number, c: number, d: number) => number;
    readonly kalman_fuse: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => number;
    readonly pnr_minutes: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
    readonly pnrresult_can_safely_return: (a: number) => number;
    readonly wireerror_detail: (a: number, b: number) => void;
    readonly wireerror_kind: (a: number, b: number) => void;
    readonly cusumdetector_reset: (a: number) => void;
    readonly new_cusum_detector: () => number;
    readonly cusumalert_s_minus: (a: number) => number;
    readonly cusumalert_samples_seen: (a: number) => number;
    readonly cusumdetector_alarms: (a: number) => number;
    readonly cusumdetector_reference_k: (a: number) => number;
    readonly cusumdetector_s_minus: (a: number) => number;
    readonly cusumdetector_samples: (a: number) => number;
    readonly cusumdetector_threshold_h: (a: number) => number;
    readonly decodedstate_battery_v: (a: number) => number;
    readonly decodedstate_pitch_deg: (a: number) => number;
    readonly decodedstate_roll_deg: (a: number) => number;
    readonly decodedstate_sequence: (a: number) => number;
    readonly decodedstate_x_m: (a: number) => number;
    readonly decodedstate_y_m: (a: number) => number;
    readonly decodedstate_yaw_rad: (a: number) => number;
    readonly decodedstate_z_m: (a: number) => number;
    readonly estimate_variance: (a: number) => number;
    readonly estimate_y: (a: number) => number;
    readonly estimate_z: (a: number) => number;
    readonly fusedestimate_variance: (a: number) => number;
    readonly fusedestimate_y: (a: number) => number;
    readonly fusedestimate_z: (a: number) => number;
    readonly pnrresult_battery_required_pct: (a: number) => number;
    readonly pnrresult_battery_required_with_margin_pct: (a: number) => number;
    readonly pnrresult_energy_required_wh: (a: number) => number;
    readonly pnrresult_remaining_energy_wh: (a: number) => number;
    readonly pnrresult_return_time_min: (a: number) => number;
    readonly cusumalert_s_plus: (a: number) => number;
    readonly cusumdetector_s_plus: (a: number) => number;
    readonly decodedstate_timestamp: (a: number) => number;
    readonly estimate_x: (a: number) => number;
    readonly fusedestimate_x: (a: number) => number;
    readonly pnrresult_minutes_to_pnr: (a: number) => number;
    readonly __wbg_fusedestimate_free: (a: number, b: number) => void;
    readonly __wbindgen_export: (a: number, b: number) => number;
    readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
    readonly __wbindgen_export2: (a: number, b: number, c: number) => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
