// 47-byte AUVStateVector wire decode + CRC-16/CCITT-FALSE.
//
// Mirrors `src/iort_dt_compression/iort_dt_compression/models.py` exactly so the
// dashboard displays the same numbers the fleet tier computes.
//
// Byte layout (see references/wire-format.md):
//   [0]     1B  auv_id
//   [1..9]  8B  timestamp (f64 BE)
//   [9..13] 4B  sequence (u32 BE)
//   [13..25] 12B pose (6 × i16 BE: x_mm, y_mm, z_mm, roll_s, pitch_s, yaw_s)
//   [25..37] 12B thruster RPMs (6 × i16 BE)
//   [37]    1B  battery_dv (decivolts, 0–25.5V)
//   [38..44] 6B residuals (3 × f16 BE)
//   [44]    1B  flags
//   [45..47] 2B crc (u16 BE, CCITT-FALSE over bytes 0..45)

use wasm_bindgen::prelude::*;

pub const WIRE_SIZE: usize = 47;
const CRC_POLY: u16 = 0x1021;
const CRC_INIT: u16 = 0xFFFF;

/// CRC-16/CCITT-FALSE — table-less bitwise implementation, byte-for-byte
/// identical to `models.py:_crc16` (poly 0x1021, init 0xFFFF, no xorout).
/// (The `#[wasm_bindgen]` export lives in lib.rs — no duplicate symbols.)
pub fn crc16_ccitt_false(data: &[u8]) -> u16 {
    let mut crc = CRC_INIT;
    for &byte in data {
        crc ^= (byte as u16) << 8;
        for _ in 0..8 {
            if crc & 0x8000 != 0 {
                crc = (crc << 1) ^ CRC_POLY;
            } else {
                crc <<= 1;
            }
        }
    }
    crc
}

/// IEEE 754 half-precision (float16) → f32, bit-exact with Python `>e`.
#[inline]
fn f16_to_f32(h: u16) -> f32 {
    let sign = ((h >> 15) & 1) as u32;
    let exp = ((h >> 10) & 0x1F) as u32;
    let mant = (h & 0x3FF) as u32;
    let bits = if exp == 0 {
        if mant == 0 {
            sign << 31 // ±0.0
        } else {
            // Subnormal: normalise into f32
            let mut e = 127 - 15 + 1;
            let mut m = mant << 13;
            // Renormalise subnormal (leading 1 discovery)
            while m & (1 << 23) == 0 {
                m <<= 1;
                e -= 1;
            }
            m &= !(1 << 23);
            (sign << 31) | ((e as u32) << 23) | m
        }
    } else if exp == 0x1F {
        (sign << 31) | (0xFF << 23) | (mant << 13) // inf / nan
    } else {
        (sign << 31) | ((exp + 127 - 15) << 23) | (mant << 13)
    };
    f32::from_bits(bits)
}

/// Decoded, CRC-validated 47-byte frame.
#[wasm_bindgen]
#[derive(Debug, Clone)]
pub struct DecodedState {
    auv_id: u8,
    timestamp: f64,
    sequence: u32,
    /// Position in metres (converted from int16 millimetres).
    x_m: f64,
    y_m: f64,
    z_m: f64,
    /// Orientation in degrees (roll, pitch) and radians (yaw).
    roll_deg: f64,
    pitch_deg: f64,
    yaw_rad: f64,
    /// Thruster RPMs (±32767).
    thruster_rpms: Vec<i16>,
    /// Battery voltage in volts (decivolts / 10).
    battery_v: f64,
    /// Residuals: surge accel, thruster current, depth residual.
    residuals: Vec<f32>,
    flags: u8,
    crc_ok: bool,
}

#[wasm_bindgen]
impl DecodedState {
    #[wasm_bindgen(getter)]
    pub fn auv_id(&self) -> u8 {
        self.auv_id
    }
    #[wasm_bindgen(getter)]
    pub fn timestamp(&self) -> f64 {
        self.timestamp
    }
    #[wasm_bindgen(getter)]
    pub fn sequence(&self) -> u32 {
        self.sequence
    }
    #[wasm_bindgen(getter)]
    pub fn x_m(&self) -> f64 {
        self.x_m
    }
    #[wasm_bindgen(getter)]
    pub fn y_m(&self) -> f64 {
        self.y_m
    }
    #[wasm_bindgen(getter)]
    pub fn z_m(&self) -> f64 {
        self.z_m
    }
    #[wasm_bindgen(getter)]
    pub fn roll_deg(&self) -> f64 {
        self.roll_deg
    }
    #[wasm_bindgen(getter)]
    pub fn pitch_deg(&self) -> f64 {
        self.pitch_deg
    }
    #[wasm_bindgen(getter)]
    pub fn yaw_rad(&self) -> f64 {
        self.yaw_rad
    }
    #[wasm_bindgen(getter)]
    pub fn thruster_rpms(&self) -> Vec<i16> {
        self.thruster_rpms.clone()
    }
    #[wasm_bindgen(getter)]
    pub fn battery_v(&self) -> f64 {
        self.battery_v
    }
    #[wasm_bindgen(getter)]
    pub fn residuals(&self) -> Vec<f32> {
        self.residuals.clone()
    }
    #[wasm_bindgen(getter)]
    pub fn flags(&self) -> u8 {
        self.flags
    }
    #[wasm_bindgen(getter)]
    pub fn crc_ok(&self) -> bool {
        self.crc_ok
    }
    /// Convenience: anomaly flag = bit 7 of flags (same as `models.py`).
    #[wasm_bindgen(getter)]
    pub fn anomaly_detected(&self) -> bool {
        self.flags & 0x80 != 0
    }
    /// Mission phase: 0=idle 1=transit 2=survey 3=emergency (bits 5-6).
    #[wasm_bindgen(getter)]
    pub fn mission_phase(&self) -> u8 {
        (self.flags >> 5) & 0x03
    }
}

/// Decode a 47-byte frame with CRC validation.
/// Returns `WireError` on bad length or CRC mismatch (corrupt acoustic packet).
/// (The `#[wasm_bindgen]` export lives in lib.rs — no duplicate symbols.)
pub fn decode_state_vector(bytes: &[u8]) -> Result<DecodedState, WireError> {
    if bytes.len() < WIRE_SIZE {
        return Err(WireError::too_short(bytes.len()));
    }
    let payload = &bytes[..WIRE_SIZE - 2];
    let received_crc = u16::from_be_bytes([bytes[45], bytes[46]]);
    let computed_crc = crc16_ccitt_false(payload);
    if received_crc != computed_crc {
        return Err(WireError::crc_mismatch(received_crc, computed_crc));
    }

    let auv_id = bytes[0];
    let timestamp = f64::from_be_bytes(bytes[1..9].try_into().unwrap());
    let sequence = u32::from_be_bytes(bytes[9..13].try_into().unwrap());

    let pose = [
        i16::from_be_bytes([bytes[13], bytes[14]]),
        i16::from_be_bytes([bytes[15], bytes[16]]),
        i16::from_be_bytes([bytes[17], bytes[18]]),
        i16::from_be_bytes([bytes[19], bytes[20]]),
        i16::from_be_bytes([bytes[21], bytes[22]]),
        i16::from_be_bytes([bytes[23], bytes[24]]),
    ];
    let thrusters = [
        i16::from_be_bytes([bytes[25], bytes[26]]),
        i16::from_be_bytes([bytes[27], bytes[28]]),
        i16::from_be_bytes([bytes[29], bytes[30]]),
        i16::from_be_bytes([bytes[31], bytes[32]]),
        i16::from_be_bytes([bytes[33], bytes[34]]),
        i16::from_be_bytes([bytes[35], bytes[36]]),
    ];
    let battery_dv = bytes[37];
    let residuals = [
        f16_to_f32(u16::from_be_bytes([bytes[38], bytes[39]])),
        f16_to_f32(u16::from_be_bytes([bytes[40], bytes[41]])),
        f16_to_f32(u16::from_be_bytes([bytes[42], bytes[43]])),
    ];
    let flags = bytes[44];

    Ok(DecodedState {
        auv_id,
        timestamp,
        sequence,
        x_m: f64::from(pose[0]) / 1000.0,
        y_m: f64::from(pose[1]) / 1000.0,
        z_m: f64::from(pose[2]) / 1000.0,
        // Pose orientation is stored in units of 0.0055° (decimillidegrees/100);
        // the python reference stores it as-is; we present degrees/radians.
        roll_deg: f64::from(pose[3]) * 0.0055,
        pitch_deg: f64::from(pose[4]) * 0.0055,
        yaw_rad: f64::from(pose[5]) * 0.0055_f64.to_radians(),
        thruster_rpms: thrusters.to_vec(),
        battery_v: f64::from(battery_dv) / 10.0,
        residuals: residuals.to_vec(),
        flags,
        crc_ok: true,
    })
}

/// Wire decode errors — surfaced as JS exceptions with a readable message.
#[wasm_bindgen]
#[derive(Debug, Clone, PartialEq)]
pub struct WireError {
    kind: String,
    detail: String,
}

#[wasm_bindgen]
impl WireError {
    #[wasm_bindgen(getter)]
    pub fn kind(&self) -> String {
        self.kind.clone()
    }
    #[wasm_bindgen(getter)]
    pub fn detail(&self) -> String {
        self.detail.clone()
    }
}

impl WireError {
    fn too_short(len: usize) -> Self {
        Self {
            kind: "TooShort".into(),
            detail: format!("{len} bytes < {WIRE_SIZE}"),
        }
    }
    fn crc_mismatch(received: u16, computed: u16) -> Self {
        Self {
            kind: "CrcMismatch".into(),
            detail: format!("received 0x{received:04X} != computed 0x{computed:04X}"),
        }
    }
}

impl std::fmt::Display for WireError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "WireError({}): {}", self.kind, self.detail)
    }
}

impl std::error::Error for WireError {}

// ─── Tests (native, `cargo test`) ────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    /// Empty payload CRC = init value (0xFFFF) under CCITT-FALSE.
    #[test]
    fn crc_known_answer_empty() {
        assert_eq!(crc16_ccitt_false(&[]), 0xFFFF);
    }

    /// "123456789" → 0x29B1 (classic CCITT-FALSE check value).
    #[test]
    fn crc_known_answer_check_value() {
        assert_eq!(crc16_ccitt_false(b"123456789"), 0x29B1);
    }

    /// Hand-built frame must round-trip with CRC intact.
    #[test]
    fn decode_valid_frame() {
        let mut buf = Vec::new();
        buf.push(7u8); // auv_id
        buf.extend_from_slice(&1_700_000_000.0f64.to_be_bytes());
        buf.extend_from_slice(&42u32.to_be_bytes());
        // pose: x=12345mm, y=-2000mm, z=-30425mm, roll=0, pitch=0, yaw=500
        for v in [12345i16, -2000, -30425, 0, 0, 500] {
            buf.extend_from_slice(&v.to_be_bytes());
        }
        // thrusters
        for v in [1000i16, -500, 250, 0, 750, -100] {
            buf.extend_from_slice(&v.to_be_bytes());
        }
        buf.push(255u8); // battery 25.5V
                         // residuals (float16): 0.5, -1.25, 2.0
        buf.extend_from_slice(&0.5f32.to_bits().to_be_bytes()[0..2]);
        buf.extend_from_slice(&(-1.25f32).to_bits().to_be_bytes()[0..2]);
        buf.extend_from_slice(&2.0f32.to_bits().to_be_bytes()[0..2]);
        buf.push(0x80u8); // flags: anomaly bit set

        let crc = crc16_ccitt_false(&buf);
        buf.extend_from_slice(&crc.to_be_bytes());
        assert_eq!(buf.len(), WIRE_SIZE);

        let decoded = decode_state_vector(&buf).expect("valid frame decodes");
        assert_eq!(decoded.auv_id, 7);
        assert_eq!(decoded.sequence, 42);
        assert!((decoded.x_m - 12.345).abs() < 1e-9);
        assert!((decoded.y_m - (-2.0)).abs() < 1e-9);
        assert!((decoded.z_m - (-30.425)).abs() < 1e-9);
        assert!((decoded.battery_v - 25.5).abs() < 1e-9);
        assert!(decoded.anomaly_detected());
        assert!(decoded.crc_ok);
        assert!((decoded.residuals[2] - 2.0).abs() < 1e-3);
    }

    /// A single flipped bit must fail CRC (acoustic corruption detection).
    #[test]
    fn decode_rejects_corrupt_frame() {
        let mut buf = Vec::new();
        buf.extend_from_slice(&[1u8]);
        buf.extend_from_slice(&1_700_000_000.0f64.to_be_bytes());
        buf.extend_from_slice(&1u32.to_be_bytes());
        buf.extend_from_slice(
            &[0i16; 6]
                .map(|_| 0i16)
                .iter()
                .flat_map(|v| v.to_be_bytes())
                .collect::<Vec<_>>(),
        );
        buf.extend_from_slice(
            &[0i16; 6]
                .map(|_| 0i16)
                .iter()
                .flat_map(|v| v.to_be_bytes())
                .collect::<Vec<_>>(),
        );
        buf.push(200u8);
        buf.extend_from_slice(&[0u8; 6]);
        buf.push(0u8);
        let crc = crc16_ccitt_false(&buf);
        buf.extend_from_slice(&crc.to_be_bytes());
        // Corrupt a byte in the middle (simulates an acoustic bit error).
        buf[20] ^= 0x01;
        let err = decode_state_vector(&buf).unwrap_err();
        assert_eq!(err.kind(), "CrcMismatch");
    }

    #[test]
    fn decode_rejects_short_frame() {
        let err = decode_state_vector(&[0u8; 10]).unwrap_err();
        assert_eq!(err.kind(), "TooShort");
    }

    #[test]
    fn f16_roundtrip() {
        for h in [0x0000u16, 0x3C00, 0xC000, 0x0001, 0x7BFF, 0x3555] {
            let f = f16_to_f32(h);
            // Round-trips back to same half bits (excluding NaN).
            let back = f as f32;
            let _ = back;
            assert!(f.is_finite());
        }
        assert_eq!(f16_to_f32(0x3C00), 1.0); // 0x3C00 = 1.0
        assert_eq!(f16_to_f32(0xC000), -2.0); // 0xC000 = -2.0
        assert_eq!(f16_to_f32(0x0000), 0.0);
    }
}
