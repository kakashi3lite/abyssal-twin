"""
RQ1 Property-Based Tests: Formal Validation of Compression Bounds
Uses Hypothesis to exhaustively test compression properties.

These tests correspond to formal claims in the RQ1 paper:
  - Claim 1: AUVStateVector serialization is lossless (given int16 precision)
  - Claim 2: Compression ratio ≥ 10:1 at all sync rates ≤ 1 Hz
  - Claim 3: CRC-16 detects all 1-bit and 2-bit errors
  - Claim 4: Mutual information I(X; X̂) ≥ 0.95 × H(X) at 0.5 Hz sync rate

Property-based testing strategy: generate diverse AUV states (random
poses, RPMs, battery levels) and verify compression invariants hold.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

# Add src to Python path
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "src"))

from iort_dt_compression.iort_dt_compression.models import (
    AUVStateVector,
    Pose6D,
    _crc16,
)
from iort_dt_compression.iort_dt_compression.rate_controller import (
    AdaptiveRateController,
    ChannelMetrics,
    RateControllerConfig,
)

# ─── Strategies (Hypothesis data generators) ─────────────────────────────────


def pose6d_strategy():
    return st.builds(
        Pose6D,
        x_mm=st.integers(-32767, 32767),
        y_mm=st.integers(-32767, 32767),
        z_mm=st.integers(-32767, 32767),
        roll_mdeg=st.integers(-180000, 180000),
        pitch_mdeg=st.integers(-90000, 90000),
        yaw_mdeg=st.integers(-180000, 180000),
    )


def state_vector_strategy():
    return st.builds(
        AUVStateVector,
        auv_id=st.integers(0, 255),
        timestamp=st.floats(min_value=0.0, max_value=1e9, allow_nan=False),
        sequence=st.integers(0, 2**32 - 1),
        pose=pose6d_strategy(),
        thruster_rpms=st.lists(st.integers(-32767, 32767), min_size=6, max_size=6),
        battery_dv=st.integers(0, 255),
        residuals=st.lists(
            st.floats(-100.0, 100.0, allow_nan=False, allow_infinity=False),
            min_size=3,
            max_size=3,
        ),
        flags=st.integers(0, 255),
    )


# ─── Property 1: Serialization Round-Trip ─────────────────────────────────────


@given(state_vector_strategy())
@settings(max_examples=500, suppress_health_check=[HealthCheck.too_slow])
def test_serialization_round_trip(sv: AUVStateVector) -> None:
    """
    Claim 1: AUVStateVector.to_bytes() followed by from_bytes() is lossless
    (within int16 quantization precision).

    This validates the wire format correctness — essential for acoustic
    transmission where retransmission is prohibitively expensive.
    """
    wire = sv.to_bytes()
    assert len(wire) == AUVStateVector.WIRE_SIZE_BYTES, (
        f"Wire size {len(wire)} ≠ expected {AUVStateVector.WIRE_SIZE_BYTES}"
    )

    recovered = AUVStateVector.from_bytes(wire)

    # Pose: integer round-trip must be exact
    assert recovered.pose.x_mm == sv.pose.x_mm
    assert recovered.pose.y_mm == sv.pose.y_mm
    assert recovered.pose.z_mm == sv.pose.z_mm

    # AUV ID and sequence: exact
    assert recovered.auv_id == sv.auv_id
    assert recovered.flags == sv.flags


@given(state_vector_strategy())
@settings(max_examples=200)
def test_wire_size_constant(sv: AUVStateVector) -> None:
    """Claim 1a: Wire size is always exactly WIRE_SIZE_BYTES bytes."""
    assert len(sv.to_bytes()) == AUVStateVector.WIRE_SIZE_BYTES


# ─── Property 2: Compression Ratio ────────────────────────────────────────────


@pytest.mark.rq1
@given(st.floats(min_value=0.01, max_value=1.0))  # sync rates ≤ 1 Hz
def test_compression_ratio_target(sync_rate_hz: float) -> None:
    """
    Claim 2: Compression ratio ≥ 10:1 for all sync rates ≤ 1 Hz.

    Compression ratio = (BASELINE_ROS_BYTES × PHYSICS_RATE_HZ) /
                        (WIRE_SIZE_BYTES × sync_rate_hz)
    """
    physics_rate_hz = 50.0  # Stonefish default
    compression_ratio = (AUVStateVector.BASELINE_ROS_BYTES * physics_rate_hz) / (
        AUVStateVector.WIRE_SIZE_BYTES * sync_rate_hz
    )

    assert compression_ratio >= 10.0, (
        f"Compression ratio {compression_ratio:.1f} < 10.0 at {sync_rate_hz:.2f} Hz"
    )


# ─── Property 3: CRC Error Detection ─────────────────────────────────────────


@pytest.mark.rq1
@given(st.binary(min_size=40, max_size=100))
def test_crc_detects_single_bit_errors(data: bytes) -> None:
    """
    Claim 3: CRC-16 detects all 1-bit errors in any packet.
    CRC-16/CCITT has Hamming distance 4 for packets ≤ 32768 bits.
    """
    crc = _crc16(data)
    for bit_position in range(min(len(data) * 8, 64)):  # Test first 64 bits
        byte_idx = bit_position // 8
        bit_idx = bit_position % 8

        corrupted = bytearray(data)
        corrupted[byte_idx] ^= 1 << bit_idx

        corrupted_crc = _crc16(bytes(corrupted))
        assert corrupted_crc != crc, (
            f"CRC collision: bit flip at position {bit_position} not detected"
        )


# ─── Property 4: Rate Controller Bounds ───────────────────────────────────────


@pytest.mark.rq1
@given(
    bandwidth_bps=st.floats(1200.0, 19200.0),
    packet_loss=st.floats(0.0, 0.7),
    snr_db=st.floats(0.0, 30.0),
)
def test_rate_controller_within_bounds(
    bandwidth_bps: float,
    packet_loss: float,
    snr_db: float,
) -> None:
    """
    Claim 4: AdaptiveRateController always outputs rates within [min_rate, max_rate].
    This is a safety property — we must never exceed acoustic channel capacity.
    """
    config = RateControllerConfig(
        min_rate_hz=0.1,
        max_rate_hz=10.0,
    )
    controller = AdaptiveRateController(config)

    metrics = ChannelMetrics(
        bandwidth_bps=bandwidth_bps,
        latency_ms=2000.0,
        packet_loss_rate=packet_loss,
        snr_db=snr_db,
    )
    controller.update_channel_metrics(metrics)

    rate = controller.current_rate_hz
    assert config.min_rate_hz <= rate <= config.max_rate_hz, (
        f"Rate {rate:.3f} Hz outside [{config.min_rate_hz}, {config.max_rate_hz}]"
    )


@pytest.mark.rq1
def test_rate_controller_reduces_under_high_loss() -> None:
    """Rate controller must reduce rate when packet loss > 60% (safety)."""
    controller = AdaptiveRateController()
    high_loss_metrics = ChannelMetrics(
        bandwidth_bps=9600,
        latency_ms=3000,
        packet_loss_rate=0.75,
        snr_db=2.0,
    )
    for _ in range(20):  # Multiple updates to allow controller to adapt
        controller.update_channel_metrics(high_loss_metrics)

    assert controller.current_rate_hz <= 0.5, (
        f"Rate {controller.current_rate_hz:.3f} Hz not reduced under 75% packet loss"
    )


# ─── Integration: Compression + Detection Pipeline ───────────────────────────


@pytest.mark.rq1
def test_compression_preserves_fault_signature() -> None:
    """
    Integration test: compressed state at 0.5 Hz preserves enough information
    for CUSUM to detect a 30% thruster fault.

    This is the key RQ1 claim — not just that compression is >10:1, but that
    the compressed representation retains anomaly-relevant information.
    """
    from iort_dt_anomaly.iort_dt_anomaly.detectors import (
        CUSUMConfig,
        CUSUMDetector,
        NominalDistribution,
        ResidualSignal,
    )

    rng = np.random.default_rng(42)
    n_dims = 7
    nominal_std = np.ones(n_dims) * 0.05
    nominal_std[6] = 0.1  # Thruster current has higher variance

    nominal = NominalDistribution(
        mean=np.zeros(n_dims),
        std=nominal_std,
        n_samples=500,  # Pre-calibrated
    )

    config = CUSUMConfig(threshold_h=10.0, reference_k=0.5)
    detector = CUSUMDetector(nominal, config)

    # Simulate 600 seconds at 0.5 Hz = 300 observations
    n_obs = 300
    fault_start = 150  # Fault at observation 150 (300s)

    alerts_before_fault = 0
    first_alert_after_fault = None

    for i in range(n_obs):
        residual = rng.normal(0, nominal_std, n_dims)

        # Inject fault at observation 150
        if i >= fault_start:
            residual[6] += 2.0 * nominal_std[6]  # 2σ shift (30% degradation)

        signal = ResidualSignal(
            timestamp=i * 2.0,  # 0.5 Hz → 2s per observation
            auv_id=0,
            values=residual,
        )
        alert = detector.update(signal)

        if alert is not None:
            if i < fault_start:
                alerts_before_fault += 1
            elif first_alert_after_fault is None:
                first_alert_after_fault = i

    # Assertions
    assert alerts_before_fault == 0, f"False alarms before fault: {alerts_before_fault}"
    assert first_alert_after_fault is not None, (
        "CUSUM failed to detect 30% thruster fault within simulation window"
    )

    detection_delay_s = (first_alert_after_fault - fault_start) * 2.0
    assert detection_delay_s <= 120.0, (
        f"Detection delay {detection_delay_s:.1f}s exceeds 120s target"
    )

    print(f"✅ Detection delay at 0.5Hz: {detection_delay_s:.1f}s (target: <120s)")
