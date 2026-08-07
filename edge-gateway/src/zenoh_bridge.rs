// Zenoh Bridge: Subscribes to local AUV fleet telemetry via acoustic modems.
// Deserializes FederatedDTState from bincode and inserts into local SQLite cache.
//
// Topic conventions (from docker/zenoh/acoustic.json5):
//   iort/dt/{auv_id}/state      — Compressed DT state vectors
//   iort/dt/{auv_id}/anomaly    — Anomaly alerts
//   iort/federation/{auv_id}    — Federation gossip messages

use anyhow::Result;
use hmac::{Hmac, Mac};
use sha2::Sha256;
use std::collections::HashMap;
use tracing::{debug, error, info, warn};

use crate::local_cache::LocalCache;
use crate::AcousticConfig;

// Re-use the federation crate's types for zero-copy deserialization
use iort_dt_federation::{FederatedDTState, VectorClock};

type HmacSha256 = Hmac<Sha256>;

/// Secure frame size (C5): [2B seq][8B HMAC-SHA256][47B payload] = 57 bytes.
/// The Python fleet tier signs with security.py:build_secure_frame().
const SECURE_FRAME_SIZE: usize = 47 + 10;
/// 16-bit auth sequence (outer header), upcast for the replay detector.
const AUTH_SEQ_BYTES: usize = 2;
const HMAC_TRUNC_BYTES: usize = 8;

/// Per-AUV replay detector.
///
/// Acoustic links reorder and drop frames, so a plain monotonic check would
/// reject legitimate out-of-order arrivals. We accept any sequence newer than
/// the last seen, plus a bounded reordering grace window; anything older is a
/// replay (or so stale it must be dropped).
struct ReplayDetector {
    last: HashMap<u8, u32>,
}

const REORDER_GRACE: u32 = 8;

impl ReplayDetector {
    fn new() -> Self {
        Self { last: HashMap::new() }
    }

    /// Returns true if the frame's sequence is acceptable (fresh), false if
    /// it is a replay or too stale.
    fn check(&mut self, auv_id: u8, seq: u32) -> bool {
        match self.last.get(&auv_id) {
            None => {
                self.last.insert(auv_id, seq);
                true
            }
            Some(&last) => {
                if seq > last {
                    self.last.insert(auv_id, seq);
                    true
                } else if last.wrapping_sub(seq) <= REORDER_GRACE {
                    // Out-of-order but within grace: accept, don't regress.
                    true
                } else {
                    // Replayed or far-stale frame.
                    false
                }
            }
        }
    }
}

/// Verify + unwrap a 57-byte authenticated frame → (47-byte payload, seq16).
/// Returns None if the length is wrong or the HMAC does not verify.
fn verify_secure_packet(frame: &[u8], key: &[u8]) -> Option<([u8; 47], u16)> {
    if frame.len() != SECURE_FRAME_SIZE {
        return None;
    }
    let seq = u16::from_be_bytes([frame[0], frame[1]]);
    let presented = &frame[2..2 + HMAC_TRUNC_BYTES];
    let payload = &frame[2 + HMAC_TRUNC_BYTES..];

    let mut mac = HmacSha256::new_from_slice(key).ok()?;
    mac.update(&frame[0..2]); // seq
    mac.update(payload);
    let expected = mac.finalize().into_bytes();

    if !constant_time_eq(&expected[..HMAC_TRUNC_BYTES], presented) {
        return None;
    }
    let mut body = [0u8; 47];
    body.copy_from_slice(payload);
    Some((body, seq))
}

/// Constant-time byte comparison (avoids early-exit timing leaks).
fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

/// 47-byte AUVStateVector wire format — the RQ1 research contribution.
/// Published by the Python fleet tier (AUVStateVector.to_bytes(), big-endian):
///
///   off  size  field
///   0    1     auv_id
///   1    8     timestamp (f64, seconds)
///   9    4     sequence (u32)
///   13   12    pose: x_mm, y_mm, z_mm, roll_s, pitch_s, yaw_s (6×int16)
///   25   12    thruster_rpms (6×int16)
///   37   1     battery_dv (u8)
///   38   6     residuals (3×float16)
///   44   1     flags (bit7=anomaly, bits6-5=mission_phase)
///   45   2     CRC-16/CCITT-FALSE of bytes 0-44 (poly 0x1021, init 0xFFFF)
///
/// Pose units: position in mm (÷1000 → m); orientation in millidegrees/100
/// (×100 → mdeg → radians). Mirrors Python AUVStateVector.from_bytes().
const STATE_VECTOR_WIRE_SIZE: usize = 47;
const CRC16_POLY: u16 = 0x1021;

/// CRC-16/CCITT-FALSE (matches Python `_crc16`: poly 0x1021, init 0xFFFF).
fn crc16_ccitt_false(data: &[u8]) -> u16 {
    let mut crc: u16 = 0xFFFF;
    for &byte in data {
        crc ^= u16::from(byte) << 8;
        for _ in 0..8 {
            if crc & 0x8000 != 0 {
                crc = (crc << 1) ^ CRC16_POLY;
            } else {
                crc <<= 1;
            }
        }
    }
    crc
}

/// Decode a 47-byte AUVStateVector frame into FederatedDTState.
/// Returns None when the payload is not a valid state vector (wrong length or
/// CRC failure) — the caller then falls back to bincode FederatedDTState.
fn decode_state_vector(payload: &[u8]) -> Option<FederatedDTState> {
    if payload.len() != STATE_VECTOR_WIRE_SIZE {
        return None;
    }
    let (body, crc_bytes) = payload.split_at(STATE_VECTOR_WIRE_SIZE - 2);
    let received_crc = u16::from_be_bytes([crc_bytes[0], crc_bytes[1]]);
    if crc16_ccitt_false(body) != received_crc {
        return None;
    }

    let auv_id = payload[0];
    let timestamp = f64::from_be_bytes(payload[1..9].try_into().ok()?);

    // Pose: 6×int16 big-endian at bytes 13..25
    let pose: [i16; 6] = [
        i16::from_be_bytes([payload[13], payload[14]]),
        i16::from_be_bytes([payload[15], payload[16]]),
        i16::from_be_bytes([payload[17], payload[18]]),
        i16::from_be_bytes([payload[19], payload[20]]),
        i16::from_be_bytes([payload[21], payload[22]]),
        i16::from_be_bytes([payload[23], payload[24]]),
    ];

    let flags = payload[44];
    // Battery: byte 37, 0-255 decivolts (0-25.5V) — carried for PNR on the
    // dashboard (47-byte frame already had it; previously dropped).
    let battery_dv = payload[37];

    Some(FederatedDTState {
        auv_id,
        timestamp,
        // The 47-byte frame carries a u32 sequence, not a vector clock.
        clock: VectorClock::new(),
        // mm → m (f32 precision — matches Rust federated state)
        x: pose[0] as f32 / 1000.0,
        y: pose[1] as f32 / 1000.0,
        z: pose[2] as f32 / 1000.0,
        // wire value × 100 = millidegrees → radians
        yaw: (pose[5] as f32 * 100.0 / 1000.0).to_radians(),
        // Localization uncertainty is not in the 47-byte frame.
        position_variance: 0.0,
        anomaly_detected: flags & 0x80 != 0,
        anomaly_dimension: 0,
        health_score: if flags & 0x10 != 0 { 127 } else { 255 },
        battery_dv,
        mission_phase: (flags >> 5) & 0x03,
    })
}

/// Run the Zenoh bridge: subscribe to AUV topics, buffer to local cache.
pub async fn run(config: AcousticConfig, cache: LocalCache) -> Result<()> {
    info!("Starting Zenoh bridge");

    // Open a Zenoh session (connects to local router on the vessel)
    let mut zenoh_config = zenoh::Config::from_file(&config.zenoh_config)
        .map_err(|e| anyhow::anyhow!("Failed to load Zenoh config: {e}"))?;

    // C5: TLS transport when certs are configured. Injected programmatically
    // so an absent [acoustic.tls] section keeps the plaintext simulation path
    // byte-for-byte identical. TLS adds zero per-message overhead (the HMAC-8
    // above remains the per-message integrity layer).
    if config.tls.is_enabled() {
        apply_zenoh_tls(&mut zenoh_config, &config.tls)
            .map_err(|e| anyhow::anyhow!("Failed to configure Zenoh TLS: {e}"))?;
    }

    let session = zenoh::open(zenoh_config)
        .await
        .map_err(|e| anyhow::anyhow!("Failed to open Zenoh session: {e}"))?;

    info!("Zenoh session established");

    // Subscribe to fleet state updates
    let state_sub = session
        .declare_subscriber(&config.state_topic)
        .await
        .map_err(|e| anyhow::anyhow!("State subscription failed: {e}"))?;

    info!(topic = %config.state_topic, "Subscribed to fleet state updates");

    // Subscribe to anomaly alerts
    let anomaly_sub = session
        .declare_subscriber(&config.anomaly_topic)
        .await
        .map_err(|e| anyhow::anyhow!("Anomaly subscription failed: {e}"))?;

    info!(topic = %config.anomaly_topic, "Subscribed to anomaly alerts");

    // Replay detector (per-AUV sequence window) + HMAC mode from config.
    let mut replay = ReplayDetector::new();
    let hmac_key: Vec<u8> = config.hmac_key.as_bytes().to_vec();
    let secured = !hmac_key.is_empty();
    if secured {
        info!("Per-message HMAC auth ENABLED (57-byte secure frames)");
    } else {
        info!("Per-message HMAC auth disabled (plain 47-byte frames)");
    }

    /// Read the 47-byte frame's internal u32 sequence (bytes 9..13, BE).
    fn internal_sequence(payload: &[u8]) -> u32 {
        if payload.len() >= 13 {
            u32::from_be_bytes([payload[9], payload[10], payload[11], payload[12]])
        } else {
            0
        }
    }

    // Process incoming messages in parallel
    loop {
        tokio::select! {
            // Fleet state updates from AUVs
            sample = state_sub.recv_async() => {
                match sample {
                    Ok(sample) => {
                        let payload = sample.payload().to_bytes();

                        let state = if !secured {
                            // Plain mode: 47-byte AUVStateVector (RQ1) with a
                            // replay check on the internal u32 sequence, plus a
                            // bincode fallback for Rust-native publishers.
                            decode_state_vector(&payload)
                                .or_else(|| bincode::deserialize::<FederatedDTState>(&payload).ok())
                                .and_then(|s| {
                                    let seq = internal_sequence(&payload);
                                    if replay.check(s.auv_id, seq) {
                                        Some(s)
                                    } else {
                                        warn!(auv_id = s.auv_id, seq, "REPLAY DETECTED — frame dropped");
                                        None
                                    }
                                })
                        } else if let Some((body, seq16)) = verify_secure_packet(&payload, &hmac_key) {
                            // Secured mode: 57-byte HMAC-authenticated frame.
                            decode_state_vector(&body).and_then(|s| {
                                if replay.check(s.auv_id, u32::from(seq16)) {
                                    Some(s)
                                } else {
                                    warn!(auv_id = s.auv_id, seq = seq16, "REPLAY DETECTED — frame dropped");
                                    None
                                }
                            })
                        } else {
                            // Secured mode: unauthenticated / malformed frame.
                            warn!(bytes = payload.len(), "Unauthenticated frame rejected (HMAC mode)");
                            None
                        };

                        match state {
                            Some(state) => {
                                debug!(
                                    auv_id = state.auv_id,
                                    x = state.x,
                                    y = state.y,
                                    z = state.z,
                                    "Received state update"
                                );
                                if let Err(e) = cache.insert_state(&state) {
                                    error!("Cache insert failed: {e}");
                                }
                            }
                            None => {
                                warn!(
                                    bytes = payload.len(),
                                    "Failed to deserialize state (neither 47-byte \
                                     AUVStateVector nor bincode FederatedDTState)"
                                );
                            }
                        }
                    }
                    Err(e) => {
                        error!("State subscription error: {e}");
                        break;
                    }
                }
            }

            // Anomaly alerts (high priority — bypass batching in sync engine)
            sample = anomaly_sub.recv_async() => {
                match sample {
                    Ok(sample) => {
                        let payload = sample.payload().to_bytes();
                        // Anomalies are serialized as JSON for human readability
                        match serde_json::from_slice::<AnomalyAlert>(&payload) {
                            Ok(alert) => {
                                info!(
                                    vehicle_id = alert.vehicle_id,
                                    detector = %alert.detector_type,
                                    severity = alert.severity,
                                    "Anomaly alert received"
                                );
                                if let Err(e) = cache.insert_anomaly(&alert) {
                                    error!("Anomaly cache insert failed: {e}");
                                }
                            }
                            Err(e) => {
                                warn!("Failed to deserialize anomaly: {e}");
                            }
                        }
                    }
                    Err(e) => {
                        error!("Anomaly subscription error: {e}");
                        break;
                    }
                }
            }
        }
    }

    Ok(())
}

/// Anomaly alert payload from CUSUM / Shiryaev-Roberts detectors.
#[derive(Debug, serde::Deserialize, serde::Serialize)]
pub struct AnomalyAlert {
    pub vehicle_id: u8,
    pub detected_at: String,
    pub detector_type: String,
    pub confidence: f64,
    pub severity: f64,
    pub dimension: String,
}

/// Apply Zenoh TLS transport config (C5) to a session config.
/// The config file (acoustic.json5) remains TLS-agnostic; TLS is injected here
/// only when cert paths are configured, so plaintext simulation is untouched.
fn apply_zenoh_tls(
    config: &mut zenoh::Config,
    tls: &crate::AcousticTlsConfig,
) -> anyhow::Result<()> {
    // Zenoh 1.7.2 validated schema: TLS lives under transport/link/tls.
    // (Verified against Config::keys() — NOT transport/unicast/link/tls.)
    const TLS: &str = "transport/link/tls";

    config
        .insert_json5(&format!("{TLS}/root_ca_certificate"), &format!("\"{}\"", tls.root_ca_certificate))
        .map_err(|e| anyhow::anyhow!("TLS root_ca insert failed: {e}"))?;

    if !tls.listen_private_key.is_empty() {
        config
            .insert_json5(
                &format!("{TLS}/listen_private_key"),
                &format!("\"{}\"", tls.listen_private_key),
            )
            .map_err(|e| anyhow::anyhow!("TLS listen key insert failed: {e}"))?;
    }
    if !tls.listen_certificate.is_empty() {
        config
            .insert_json5(
                &format!("{TLS}/listen_certificate"),
                &format!("\"{}\"", tls.listen_certificate),
            )
            .map_err(|e| anyhow::anyhow!("TLS listen cert insert failed: {e}"))?;
    }
    if !tls.connect_private_key.is_empty() {
        config
            .insert_json5(
                &format!("{TLS}/connect_private_key"),
                &format!("\"{}\"", tls.connect_private_key),
            )
            .map_err(|e| anyhow::anyhow!("TLS connect key insert failed: {e}"))?;
    }
    if !tls.connect_certificate.is_empty() {
        config
            .insert_json5(
                &format!("{TLS}/connect_certificate"),
                &format!("\"{}\"", tls.connect_certificate),
            )
            .map_err(|e| anyhow::anyhow!("TLS connect cert insert failed: {e}"))?;
    }

    config
        .insert_json5(&format!("{TLS}/enable_mtls"), &tls.enable_mtls.to_string())
        .map_err(|e| anyhow::anyhow!("TLS mtls insert failed: {e}"))?;
    config
        .insert_json5(
            &format!("{TLS}/verify_name_on_connect"),
            &tls.verify_name_on_connect.to_string(),
        )
        .map_err(|e| anyhow::anyhow!("TLS verify insert failed: {e}"))?;

    // When running as a router/peer that listens, expose a TLS listen
    // endpoint so clients can connect encrypted. The gateway itself is a
    // CLIENT (zenoh-client.json5), so when it has connect-side certs we point
    // its connect endpoint at the router's TLS listener instead.
    if !tls.listen_private_key.is_empty() {
        config
            .insert_json5(
                "listen/endpoints",
                "[\"tcp/0.0.0.0:7447\",\"udp/0.0.0.0:7447\",\"tls/0.0.0.0:7447\"]",
            )
            .map_err(|e| anyhow::anyhow!("TLS listen endpoints insert failed: {e}"))?;
    }
    if !tls.connect_private_key.is_empty() {
        // Gateway (client) → router over TLS. Default the router endpoint to
        // the docker simulation address; production sets ZENOH_TLS_CONNECT_*.
        config
            .insert_json5("connect/endpoints", "[\"tls/localhost:7447\"]")
            .map_err(|e| anyhow::anyhow!("TLS connect endpoints insert failed: {e}"))?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Golden fixture generated by the Python fleet tier
    /// (src/iort_dt_compression — AUVStateVector.to_bytes()):
    ///   auv_id=1, timestamp=1754668800.0, sequence=42,
    ///   pose = Pose6D.from_float(10.5, 20.25, -15.5, 0, 0, 1.5),
    ///   thruster_rpms=[1200,-800,1500,-900,1100,-700], battery=245,
    ///   residuals=[0.1,-0.05,0.2], flags=0xC0 (anomaly + mission_phase 2)
    fn golden_frame() -> Vec<u8> {
        const HEX: &str = "0141da2587c00000000000002a29044f1ac37400000000035b04b0\
                           fce005dcfc7c044cfd44f52e66aa663266c06e2f";
        let clean: String = HEX.chars().filter(|c| !c.is_whitespace()).collect();
        clean
            .as_bytes()
            .chunks(2)
            .map(|pair| {
                let hi = (pair[0] as char).to_digit(16).unwrap() as u8;
                let lo = (pair[1] as char).to_digit(16).unwrap() as u8;
                (hi << 4) | lo
            })
            .collect()
    }

    #[test]
    fn decode_state_vector_matches_python_fixture() {
        let frame = golden_frame();
        assert_eq!(frame.len(), STATE_VECTOR_WIRE_SIZE);

        let state = decode_state_vector(&frame).expect("valid 47-byte frame");
        assert_eq!(state.auv_id, 1);
        assert_eq!(state.timestamp, 1754668800.0);

        // mm → m conversion (Python fixture: x=10.5, y=20.25, z=-15.5)
        assert!((state.x - 10.5).abs() < 1e-4, "x={}", state.x);
        assert!((state.y - 20.25).abs() < 1e-4, "y={}", state.y);
        assert!((state.z + 15.5).abs() < 1e-4, "z={}", state.z);

        // yaw: wire value 859 (int16 quantization of 85943 mdeg → 859*100 mdeg
        // = 85.9°) → 1.4992378 rad. The ~43 mdeg loss vs the source pose is the
        // documented int16 quantization, NOT a decoder error.
        let expected_yaw = (859.0_f64 * 100.0 / 1000.0).to_radians();
        assert!((state.yaw as f64 - expected_yaw).abs() < 1e-4, "yaw={}", state.yaw);

        // flags 0xC0: bit7 anomaly set, bits6-5 = 2 (survey), bit4 health clear
        assert!(state.anomaly_detected);
        assert_eq!(state.mission_phase, 2);
        assert_eq!(state.health_score, 255);

        // battery_dv: byte 37 = 0xf5 = 245 (0-25.5V, decivolts) → ~96%
        assert_eq!(state.battery_dv, 245);
    }

    #[test]
    fn decode_state_vector_rejects_corrupt_crc() {
        let mut frame = golden_frame();
        // Flip a payload bit so the CRC no longer matches.
        frame[20] ^= 0x01;
        assert!(decode_state_vector(&frame).is_none());
    }

    #[test]
    fn decode_state_vector_rejects_wrong_length() {
        assert!(decode_state_vector(&[0u8; 46]).is_none());
        assert!(decode_state_vector(&[0u8; 48]).is_none());
        assert!(decode_state_vector(&[]).is_none());
    }

    #[test]
    fn crc16_matches_python_reference() {
        // Body of the golden frame (bytes 0-44) — CRC over the first 45 bytes.
        let frame = golden_frame();
        let body = &frame[..STATE_VECTOR_WIRE_SIZE - 2];
        let computed = crc16_ccitt_false(body);
        let embedded = u16::from_be_bytes([frame[45], frame[46]]);
        assert_eq!(computed, embedded, "CRC must match Python _crc16");
    }

    // ── Per-message HMAC auth (C5, cross-tier with Python security.py) ────

    const TEST_KEY: &[u8] = b"abyssal-shared-key-1";

    /// Golden 57-byte secure frame produced by the Python fleet tier
    /// (security.py:build_secure_frame, seq=42, key=abyssal-shared-key-1)
    /// over the 47-byte golden frame.
    fn golden_secure_frame() -> Vec<u8> {
        let mut frame = golden_frame();
        // [2B seq BE = 42][8B HMAC][47B payload]
        let mut secure = vec![0x00, 0x2a, 0x7e, 0xb2, 0xac, 0x24, 0xd3, 0x06, 0x3c, 0x77];
        secure.append(&mut frame);
        secure
    }

    #[test]
    fn verify_secure_packet_matches_python_signer() {
        let secure = golden_secure_frame();
        assert_eq!(secure.len(), SECURE_FRAME_SIZE);
        let (body, seq) = verify_secure_packet(&secure, TEST_KEY).expect("valid HMAC");
        assert_eq!(seq, 42);
        assert_eq!(body.to_vec(), golden_frame());
    }

    #[test]
    fn verify_secure_packet_rejects_tampered_payload() {
        let mut secure = golden_secure_frame();
        // Flip one bit inside the 47-byte payload → HMAC must fail.
        secure[40] ^= 0x01;
        assert!(verify_secure_packet(&secure, TEST_KEY).is_none());
    }

    #[test]
    fn verify_secure_packet_rejects_tampered_sequence() {
        let mut secure = golden_secure_frame();
        secure[0] = 0x00;
        secure[1] = 0x2b; // seq 42 → 43
        assert!(verify_secure_packet(&secure, TEST_KEY).is_none());
    }

    #[test]
    fn verify_secure_packet_rejects_wrong_key() {
        let secure = golden_secure_frame();
        assert!(verify_secure_packet(&secure, b"wrong-key").is_none());
    }

    #[test]
    fn verify_secure_packet_rejects_wrong_length() {
        let secure = golden_secure_frame();
        assert!(verify_secure_packet(&secure[..56], TEST_KEY).is_none());
    }

    // ── Replay detector ────────────────────────────────────────────────────

    #[test]
    fn replay_detector_accepts_monotonic_and_rejects_old() {
        let mut d = ReplayDetector::new();
        assert!(d.check(1, 10)); // first frame
        assert!(d.check(1, 11));
        assert!(d.check(1, 12));
        // Replayed seq 11 (2 frames back) is within REORDER_GRACE → accept.
        assert!(d.check(1, 11));
        // Replayed seq 1 (way old) → reject.
        assert!(!d.check(1, 1));
    }

    #[test]
    fn replay_detector_tolerates_bounded_reordering() {
        let mut d = ReplayDetector::new();
        assert!(d.check(2, 100));
        assert!(d.check(2, 103)); // jump ahead
        // Out-of-order but within grace (100 vs 103, delta 3 ≤ 8) → accept.
        assert!(d.check(2, 101));
        assert!(d.check(2, 102));
        // Beyond grace (103 - 94 = 9 > 8) → reject as stale.
        assert!(!d.check(2, 94));
    }

    #[test]
    fn replay_detector_tracks_per_auv() {
        let mut d = ReplayDetector::new();
        assert!(d.check(1, 100));
        assert!(d.check(2, 100)); // different AUV, independent window
        assert!(!d.check(1, 90)); // auv 1: 100-90 = 10 > grace → rejected
        assert!(d.check(2, 101)); // auv 2 window unaffected
    }

    #[test]
    fn replay_detector_rejects_stale_beyond_grace() {
        let mut d = ReplayDetector::new();
        assert!(d.check(3, 100));
        // 100 - 91 = 9 > REORDER_GRACE(8) → stale/replayed → reject.
        assert!(!d.check(3, 91));
    }

    // ── Zenoh TLS transport (C5) ───────────────────────────────────────────

    fn tls_config() -> crate::AcousticTlsConfig {
        crate::AcousticTlsConfig {
            root_ca_certificate: "configs/security/zenoh/ca_cert.pem".into(),
            listen_private_key: "configs/security/zenoh/router_key.pem".into(),
            listen_certificate: "configs/security/zenoh/router_cert.pem".into(),
            enable_mtls: true,
            connect_private_key: "".into(),
            connect_certificate: "".into(),
            verify_name_on_connect: true,
        }
    }

    #[test]
    fn tls_is_disabled_without_certs() {
        let tls = crate::AcousticTlsConfig::default();
        assert!(!tls.is_enabled());
    }

    #[test]
    fn tls_is_enabled_with_ca_and_key() {
        assert!(tls_config().is_enabled());
    }

    #[test]
    fn apply_tls_injects_transport_block() {
        // Parse the real acoustic.json5 used in dev/simulation, then inject TLS.
        let mut config = zenoh::Config::from_file(
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../docker/zenoh/acoustic.json5"),
        )
        .expect("acoustic.json5 must parse");
        apply_zenoh_tls(&mut config, &tls_config()).expect("TLS injection must succeed");

        // Verify the TLS block was inserted (round-trip through JSON5).
        let json = config.to_string();
        assert!(json.contains("root_ca_certificate"));
        assert!(json.contains("configs/security/zenoh/ca_cert.pem"));
        assert!(json.contains("enable_mtls"));
        assert!(json.contains("tls/0.0.0.0:7447"), "TLS listen endpoint added");
    }

    #[test]
    fn apply_tls_keeps_plaintext_when_disabled() {
        let mut config = zenoh::Config::from_file(
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../docker/zenoh/acoustic.json5"),
        )
        .expect("acoustic.json5 must parse");
        let original = config.to_string();
        // No TLS section → apply with default (empty) TLS config is a no-op.
        let default_tls = crate::AcousticTlsConfig::default();
        // We only call apply_zenoh_tls when is_enabled() is true in the bridge,
        // so this just asserts a disabled config would not be applied.
        assert!(!default_tls.is_enabled());
        assert!(original.contains("tcp/0.0.0.0:7447"));
    }

    // ── Phase 6: real HMAC key cross-tier (env-driven, not committed) ──────
    // The production ACOUSTIC_HMAC_KEY is a secret and must never be committed.
    // This test verifies the Python fleet tier's signing against the Rust
    // verifier using the ENVIRONMENT-provided key, and skips when unset (CI
    // without secrets). Run locally with:
    //   ACOUSTIC_HMAC_KEY=$(cat /tmp/acoustic_hmac_key.txt) cargo test
    #[test]
    fn real_key_cross_tier_verifies_python_frame() {
        let key = std::env::var("ACOUSTIC_HMAC_KEY").unwrap_or_default();
        if key.is_empty() {
            eprintln!("ACOUSTIC_HMAC_KEY unset — skipping cross-tier secret test");
            return;
        }
        // Python-signed 57-byte frame for auv_3 (see Phase 6 verification log).
        let frame_hex = "00635cce60b07e82a1dc0341da2587c00000000000006313881770e4a80039ff8e00ab03e8fc1803e8fc1803e8fc18dc2e66aa6632664047df";
        let frame: Vec<u8> = (0..frame_hex.len())
            .step_by(2)
            .map(|i| u8::from_str_radix(&frame_hex[i..i + 2], 16).unwrap())
            .collect();
        assert_eq!(frame.len(), SECURE_FRAME_SIZE);
        let (body, seq) = verify_secure_packet(&frame, key.as_bytes()).expect("real key must verify");
        assert_eq!(seq, 99);
        // auv_id byte 0 = 3 (Python fixture auv_3)
        assert_eq!(body[0], 3);
    }
}
