# RQ4: per-message HMAC authentication for the acoustic link.
# Cross-tier contract with edge-gateway/src/zenoh_bridge.rs (verify_secure_packet).
# Secure frame = [2B seq BE][8B HMAC-SHA256][47B AUVStateVector] = 57 bytes.

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent / "src"))

import pytest

from iort_dt_compression.iort_dt_compression.models import AUVStateVector, Pose6D
from iort_dt_compression.iort_dt_compression.security import (
    SECURE_FRAME_SIZE,
    build_secure_frame,
    sign_packet,
    verify_secure_frame,
)

KEY = b"abyssal-shared-key-1"


def sample_state() -> bytes:
    sv = AUVStateVector(
        auv_id=1,
        timestamp=1754668800.0,
        sequence=42,
        pose=Pose6D.from_float(10.5, 20.25, -15.5, 0.0, 0.0, 1.5),
        thruster_rpms=[1200, -800, 1500, -900, 1100, -700],
        battery_dv=245,
        residuals=[0.1, -0.05, 0.2],
        flags=0xC0,
    )
    return sv.to_bytes()


def test_secure_frame_size_is_57_bytes() -> None:
    payload = sample_state()
    assert len(payload) == 47
    secure = build_secure_frame(payload, 42, KEY)
    assert len(secure) == SECURE_FRAME_SIZE == 57


def test_round_trip_recovers_payload_and_seq() -> None:
    payload = sample_state()
    secure = build_secure_frame(payload, 1234, KEY)
    recovered, seq = verify_secure_frame(secure, KEY)
    assert seq == 1234
    assert recovered == payload


def test_tampered_payload_rejected() -> None:
    payload = sample_state()
    secure = bytearray(build_secure_frame(payload, 7, KEY))
    secure[40] ^= 0x01  # flip a bit in the 47-byte payload
    with pytest.raises(ValueError, match="HMAC"):
        verify_secure_frame(bytes(secure), KEY)


def test_wrong_key_rejected() -> None:
    payload = sample_state()
    secure = build_secure_frame(payload, 7, KEY)
    with pytest.raises(ValueError, match="HMAC"):
        verify_secure_frame(secure, b"attacker-key")


def test_wrong_length_rejected() -> None:
    with pytest.raises(ValueError, match="57-byte"):
        verify_secure_frame(b"\x00" * 56, KEY)


def test_golden_vector_matches_rust() -> None:
    """Golden frame must equal the one embedded in the Rust tests."""
    payload = sample_state()
    secure = build_secure_frame(payload, 42, KEY)
    # [2B seq=42][8B hmac][47B payload]
    assert secure[:2] == b"\x00\x2a"
    assert secure[2:10] == bytes.fromhex("7eb2ac24d3063c77")
    assert secure[10:] == payload


def test_signature_is_deterministic_per_message() -> None:
    payload = sample_state()
    a = sign_packet(payload, 99, KEY)
    b = sign_packet(payload, 99, KEY)
    assert a == b
    c = sign_packet(payload, 100, KEY)  # different seq → different tag
    assert a != c
