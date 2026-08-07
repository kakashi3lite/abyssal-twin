/* @ts-self-types="./iort_twin_wasm.d.ts" */

/**
 * CUSUM alert emitted on threshold crossing.
 */
export class CusumAlert {
    static __wrap(ptr) {
        const obj = Object.create(CusumAlert.prototype);
        obj.__wbg_ptr = ptr;
        CusumAlertFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        CusumAlertFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_cusumalert_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get direction() {
        const ret = wasm.cusumalert_direction(this.__wbg_ptr);
        return ret;
    }
    /**
     * "increase" | "decrease" — matches the Python alert enum.
     * @returns {string}
     */
    get direction_label() {
        let deferred1_0;
        let deferred1_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.cusumalert_direction_label(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            deferred1_0 = r0;
            deferred1_1 = r1;
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_export2(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {number}
     */
    get s_minus() {
        const ret = wasm.cusumalert_s_minus(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get s_plus() {
        const ret = wasm.cusumalert_s_plus(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get samples_seen() {
        const ret = wasm.cusumalert_samples_seen(this.__wbg_ptr);
        return ret >>> 0;
    }
}
if (Symbol.dispose) CusumAlert.prototype[Symbol.dispose] = CusumAlert.prototype.free;

/**
 * Stateful CUSUM detector (one per monitored dimension).
 */
export class CusumDetector {
    static __wrap(ptr) {
        const obj = Object.create(CusumDetector.prototype);
        obj.__wbg_ptr = ptr;
        CusumDetectorFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        CusumDetectorFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_cusumdetector_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get alarms() {
        const ret = wasm.cusumdetector_alarms(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @param {number} threshold_h
     * @param {number} reference_k
     */
    constructor(threshold_h, reference_k) {
        const ret = wasm.cusumdetector_new(threshold_h, reference_k);
        this.__wbg_ptr = ret;
        CusumDetectorFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Detector preconfigured with the deployed production thresholds.
     * @returns {CusumDetector}
     */
    static production() {
        const ret = wasm.cusumdetector_production();
        return CusumDetector.__wrap(ret);
    }
    /**
     * @returns {number}
     */
    get reference_k() {
        const ret = wasm.cusumdetector_reference_k(this.__wbg_ptr);
        return ret;
    }
    reset() {
        wasm.cusumdetector_reset(this.__wbg_ptr);
    }
    /**
     * @returns {number}
     */
    get s_minus() {
        const ret = wasm.cusumdetector_s_minus(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get s_plus() {
        const ret = wasm.cusumdetector_s_plus(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get samples() {
        const ret = wasm.cusumdetector_samples(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    get threshold_h() {
        const ret = wasm.cusumdetector_threshold_h(this.__wbg_ptr);
        return ret;
    }
    /**
     * Feed one standardized residual z-score. Returns an alert on crossing h.
     * @param {number} z_score
     * @returns {CusumAlert | undefined}
     */
    update(z_score) {
        const ret = wasm.cusumdetector_update(this.__wbg_ptr, z_score);
        return ret === 0 ? undefined : CusumAlert.__wrap(ret);
    }
}
if (Symbol.dispose) CusumDetector.prototype[Symbol.dispose] = CusumDetector.prototype.free;

/**
 * Decoded, CRC-validated 47-byte frame.
 */
export class DecodedState {
    static __wrap(ptr) {
        const obj = Object.create(DecodedState.prototype);
        obj.__wbg_ptr = ptr;
        DecodedStateFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        DecodedStateFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_decodedstate_free(ptr, 0);
    }
    /**
     * Convenience: anomaly flag = bit 7 of flags (same as `models.py`).
     * @returns {boolean}
     */
    get anomaly_detected() {
        const ret = wasm.decodedstate_anomaly_detected(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @returns {number}
     */
    get auv_id() {
        const ret = wasm.decodedstate_auv_id(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get battery_v() {
        const ret = wasm.decodedstate_battery_v(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {boolean}
     */
    get crc_ok() {
        const ret = wasm.decodedstate_crc_ok(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @returns {number}
     */
    get flags() {
        const ret = wasm.decodedstate_flags(this.__wbg_ptr);
        return ret;
    }
    /**
     * Mission phase: 0=idle 1=transit 2=survey 3=emergency (bits 5-6).
     * @returns {number}
     */
    get mission_phase() {
        const ret = wasm.decodedstate_mission_phase(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get pitch_deg() {
        const ret = wasm.decodedstate_pitch_deg(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {Float32Array}
     */
    get residuals() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.decodedstate_residuals(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var v1 = getArrayF32FromWasm0(r0, r1).slice();
            wasm.__wbindgen_export2(r0, r1 * 4, 4);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * @returns {number}
     */
    get roll_deg() {
        const ret = wasm.decodedstate_roll_deg(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get sequence() {
        const ret = wasm.decodedstate_sequence(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {Int16Array}
     */
    get thruster_rpms() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.decodedstate_thruster_rpms(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var v1 = getArrayI16FromWasm0(r0, r1).slice();
            wasm.__wbindgen_export2(r0, r1 * 2, 2);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * @returns {number}
     */
    get timestamp() {
        const ret = wasm.decodedstate_timestamp(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get x_m() {
        const ret = wasm.decodedstate_x_m(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get y_m() {
        const ret = wasm.decodedstate_y_m(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get yaw_rad() {
        const ret = wasm.decodedstate_yaw_rad(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get z_m() {
        const ret = wasm.decodedstate_z_m(this.__wbg_ptr);
        return ret;
    }
}
if (Symbol.dispose) DecodedState.prototype[Symbol.dispose] = DecodedState.prototype.free;

/**
 * A single position estimate with its uncertainty.
 */
export class Estimate {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        EstimateFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_estimate_free(ptr, 0);
    }
    /**
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @param {number} variance
     */
    constructor(x, y, z, variance) {
        const ret = wasm.estimate_new(x, y, z, variance);
        this.__wbg_ptr = ret;
        EstimateFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @returns {number}
     */
    get variance() {
        const ret = wasm.estimate_variance(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get x() {
        const ret = wasm.estimate_x(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get y() {
        const ret = wasm.estimate_y(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get z() {
        const ret = wasm.estimate_z(this.__wbg_ptr);
        return ret;
    }
}
if (Symbol.dispose) Estimate.prototype[Symbol.dispose] = Estimate.prototype.free;

/**
 * The fused result.
 */
export class FusedEstimate {
    static __wrap(ptr) {
        const obj = Object.create(FusedEstimate.prototype);
        obj.__wbg_ptr = ptr;
        FusedEstimateFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        FusedEstimateFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_fusedestimate_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get variance() {
        const ret = wasm.fusedestimate_variance(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get x() {
        const ret = wasm.fusedestimate_x(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get y() {
        const ret = wasm.fusedestimate_y(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get z() {
        const ret = wasm.fusedestimate_z(this.__wbg_ptr);
        return ret;
    }
}
if (Symbol.dispose) FusedEstimate.prototype[Symbol.dispose] = FusedEstimate.prototype.free;

/**
 * PNR computation result.
 */
export class PnrResult {
    static __wrap(ptr) {
        const obj = Object.create(PnrResult.prototype);
        obj.__wbg_ptr = ptr;
        PnrResultFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        PnrResultFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_pnrresult_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get battery_required_pct() {
        const ret = wasm.pnrresult_battery_required_pct(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get battery_required_with_margin_pct() {
        const ret = wasm.pnrresult_battery_required_with_margin_pct(this.__wbg_ptr);
        return ret;
    }
    /**
     * True when the vehicle can still safely return (minutes_to_pnr > 0).
     * @returns {boolean}
     */
    get can_safely_return() {
        const ret = wasm.pnrresult_can_safely_return(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @returns {number}
     */
    get energy_required_wh() {
        const ret = wasm.pnrresult_energy_required_wh(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get minutes_to_pnr() {
        const ret = wasm.pnrresult_minutes_to_pnr(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get remaining_energy_wh() {
        const ret = wasm.pnrresult_remaining_energy_wh(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get return_time_min() {
        const ret = wasm.pnrresult_return_time_min(this.__wbg_ptr);
        return ret;
    }
}
if (Symbol.dispose) PnrResult.prototype[Symbol.dispose] = PnrResult.prototype.free;

/**
 * Wire decode errors — surfaced as JS exceptions with a readable message.
 */
export class WireError {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WireErrorFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wireerror_free(ptr, 0);
    }
    /**
     * @returns {string}
     */
    get detail() {
        let deferred1_0;
        let deferred1_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.wireerror_detail(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            deferred1_0 = r0;
            deferred1_1 = r1;
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_export2(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {string}
     */
    get kind() {
        let deferred1_0;
        let deferred1_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.wireerror_kind(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            deferred1_0 = r0;
            deferred1_1 = r1;
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_export2(deferred1_0, deferred1_1, 1);
        }
    }
}
if (Symbol.dispose) WireError.prototype[Symbol.dispose] = WireError.prototype.free;

/**
 * CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF) — exposed for live CRC display.
 * @param {Uint8Array} data
 * @returns {number}
 */
export function crc16_ccitt_false(data) {
    const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_export);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.crc16_ccitt_false(ptr0, len0);
    return ret;
}

/**
 * Decode a 47-byte AUVStateVector frame, validating CRC-16/CCITT-FALSE.
 * Returns None when the frame is malformed or the CRC fails (corrupt packet).
 * @param {Uint8Array} bytes
 * @returns {DecodedState | undefined}
 */
export function decode_state_vector(bytes) {
    const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_export);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.decode_state_vector(ptr0, len0);
    return ret === 0 ? undefined : DecodedState.__wrap(ret);
}

/**
 * Version of the engine — surfaced in the dashboard footer badge.
 * @returns {string}
 */
export function engine_version() {
    let deferred1_0;
    let deferred1_1;
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.engine_version(retptr);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        deferred1_0 = r0;
        deferred1_1 = r1;
        return getStringFromWasm0(r0, r1);
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
        wasm.__wbindgen_export2(deferred1_0, deferred1_1, 1);
    }
}

/**
 * Inverse-covariance Kalman fusion of two position estimates
 * (mirrors federation `kalman_reconcile`).
 * @param {number} a_x
 * @param {number} a_y
 * @param {number} a_z
 * @param {number} a_variance
 * @param {number} b_x
 * @param {number} b_y
 * @param {number} b_z
 * @param {number} b_variance
 * @returns {FusedEstimate}
 */
export function kalman_fuse(a_x, a_y, a_z, a_variance, b_x, b_y, b_z, b_variance) {
    const ret = wasm.kalman_fuse(a_x, a_y, a_z, a_variance, b_x, b_y, b_z, b_variance);
    return FusedEstimate.__wrap(ret);
}

/**
 * Build a fresh CUSUM detector with the deployed production thresholds
 * (Phase 5 recalibration: h=10.5, k=0.5 — see cusum-reference.md).
 * @returns {CusumDetector}
 */
export function new_cusum_detector() {
    const ret = wasm.new_cusum_detector();
    return CusumDetector.__wrap(ret);
}

/**
 * Point-of-no-return energy model (mirrors SafetyEngine).
 * @param {number} battery_pct
 * @param {number} battery_capacity_wh
 * @param {number} distance_m
 * @param {number} effective_speed_ms
 * @param {number} power_w
 * @param {number} safety_margin
 * @returns {PnrResult}
 */
export function pnr_minutes(battery_pct, battery_capacity_wh, distance_m, effective_speed_ms, power_w, safety_margin) {
    const ret = wasm.pnr_minutes(battery_pct, battery_capacity_wh, distance_m, effective_speed_ms, power_w, safety_margin);
    return PnrResult.__wrap(ret);
}
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg___wbindgen_throw_344f42d3211c4765: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
    };
    return {
        __proto__: null,
        "./iort_twin_wasm_bg.js": import0,
    };
}

const CusumAlertFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_cusumalert_free(ptr, 1));
const CusumDetectorFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_cusumdetector_free(ptr, 1));
const DecodedStateFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_decodedstate_free(ptr, 1));
const EstimateFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_estimate_free(ptr, 1));
const FusedEstimateFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_fusedestimate_free(ptr, 1));
const PnrResultFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_pnrresult_free(ptr, 1));
const WireErrorFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wireerror_free(ptr, 1));

function getArrayF32FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getFloat32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
}

function getArrayI16FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getInt16ArrayMemory0().subarray(ptr / 2, ptr / 2 + len);
}

let cachedDataViewMemory0 = null;
function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

let cachedFloat32ArrayMemory0 = null;
function getFloat32ArrayMemory0() {
    if (cachedFloat32ArrayMemory0 === null || cachedFloat32ArrayMemory0.byteLength === 0) {
        cachedFloat32ArrayMemory0 = new Float32Array(wasm.memory.buffer);
    }
    return cachedFloat32ArrayMemory0;
}

let cachedInt16ArrayMemory0 = null;
function getInt16ArrayMemory0() {
    if (cachedInt16ArrayMemory0 === null || cachedInt16ArrayMemory0.byteLength === 0) {
        cachedInt16ArrayMemory0 = new Int16Array(wasm.memory.buffer);
    }
    return cachedInt16ArrayMemory0;
}

function getStringFromWasm0(ptr, len) {
    return decodeText(ptr >>> 0, len);
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasmInstance, wasm;
function __wbg_finalize_init(instance, module) {
    wasmInstance = instance;
    wasm = instance.exports;
    wasmModule = module;
    cachedDataViewMemory0 = null;
    cachedFloat32ArrayMemory0 = null;
    cachedInt16ArrayMemory0 = null;
    cachedUint8ArrayMemory0 = null;
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = module.ok && expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('iort_twin_wasm_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
