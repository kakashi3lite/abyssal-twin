"""Per-message authentication for the acoustic link (C5 / RQ4).

Secure frame (57 bytes) = [2B seq BE][8B HMAC-SHA256][47B AUVStateVector]
  - HMAC-SHA256 over [2B seq || 47B payload], truncated to the first 8 bytes.
  - Key: shared secret (same on fleet + gateway; env ``ACOUSTIC_HMAC_KEY``).
  - Sequence: 16-bit monotonic per AUV — enables replay-window detection.

Overhead: 10 bytes on a 47-byte payload (~21%); no payload shrinkage.
This is the OPTIONAL per-message layer from the security model — Zenoh TLS
covers the transport, this covers the acoustic hop end-to-end.

Mirrors the Rust verifier in edge-gateway/src/zenoh_bridge.rs.
"""

from __future__ import annotations

import hashlib
import hmac as hmac_mod
import struct

AUTH_HEADER_SIZE = 10  # 2 (seq) + 8 (hmac)
SECURE_FRAME_SIZE = 47 + AUTH_HEADER_SIZE  # 57


def sign_packet(payload: bytes, seq: int, key: bytes) -> bytes:
    """Return the 10-byte auth header [2B seq BE][8B HMAC] for a payload."""
    if len(payload) != 47:
        raise ValueError(f"expected 47-byte payload, got {len(payload)}")
    seq_bytes = struct.pack(">H", seq & 0xFFFF)
    mac = hmac_mod.new(key, seq_bytes + payload, hashlib.sha256).digest()[:8]
    return seq_bytes + mac


def build_secure_frame(payload: bytes, seq: int, key: bytes) -> bytes:
    """Wrap a 47-byte AUVStateVector into a 57-byte authenticated frame."""
    return sign_packet(payload, seq, key) + payload


def verify_secure_frame(frame: bytes, key: bytes) -> tuple[bytes, int]:
    """Verify + unwrap a 57-byte frame → (47-byte payload, seq).

    Raises ValueError on wrong length or failed HMAC.
    """
    if len(frame) != SECURE_FRAME_SIZE:
        raise ValueError(
            f"expected {SECURE_FRAME_SIZE}-byte secure frame, got {len(frame)}"
        )
    seq = struct.unpack(">H", frame[0:2])[0]
    presented_mac = frame[2:10]
    expected_mac = hmac_mod.new(
        key, frame[0:2] + frame[10:], hashlib.sha256
    ).digest()[:8]
    if not hmac_mod.compare_digest(presented_mac, expected_mac):
        raise ValueError("HMAC verification failed")
    return frame[10:], seq
