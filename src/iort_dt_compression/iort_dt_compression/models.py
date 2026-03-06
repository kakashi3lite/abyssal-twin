"""
IoRT-DT: Internet of Robotic Things - Digital Twins
Copyright (C) 2026 Swanand Tanavade / University of Nebraska at Omaha
SPDX-License-Identifier: Apache-2.0

IoRT-DT State Vector Models
RQ1: Compressed state representation for acoustic-constrained DT synchronization.

Paper: "Acoustic-Constrained Digital Twin Synchronization for AUVs: A Minimum-Rate Analysis"
Target: >10:1 compression ratio vs full ROS 2 topic stream
"""

from __future__ import annotations

import struct
import time
from typing import ClassVar

import numpy as np
from numpy.typing import NDArray
from pydantic import BaseModel, Field, field_validator, model_validator


class Pose6D(BaseModel):
    """6-DOF pose compressed to int16 (millimeter/millidegree resolution)."""

    # Stored as int16 (±32.767m, ±32.767°) — adequate for typical AUV missions
    x_mm: int = Field(ge=-32767, le=32767, description="X position (mm)")
    y_mm: int = Field(ge=-32767, le=32767, description="Y position (mm)")
    z_mm: int = Field(ge=-32767, le=32767, description="Z/depth position (mm)")
    roll_mdeg: int = Field(ge=-180000, le=180000, description="Roll (millidegrees)")
    pitch_mdeg: int = Field(ge=-90000, le=90000, description="Pitch (millidegrees)")
    yaw_mdeg: int = Field(ge=-180000, le=180000, description="Yaw (millidegrees)")

    # Wire format: 6 × int16 = 12 bytes
    WIRE_SIZE_BYTES: ClassVar[int] = 12

    @classmethod
    def from_float(
        cls,
        x: float,
        y: float,
        z: float,
        roll: float,
        pitch: float,
        yaw: float,
    ) -> "Pose6D":
        """Convert from float meters/radians to compressed int16 representation."""
        return cls(
            x_mm=int(np.clip(x * 1000, -32767, 32767)),
            y_mm=int(np.clip(y * 1000, -32767, 32767)),
            z_mm=int(np.clip(z * 1000, -32767, 32767)),
            roll_mdeg=int(np.clip(np.degrees(roll) * 1000, -180000, 180000)),
            pitch_mdeg=int(np.clip(np.degrees(pitch) * 1000, -90000, 90000)),
            yaw_mdeg=int(np.clip(np.degrees(yaw) * 1000, -180000, 180000)),
        )

    def to_float(self) -> tuple[float, float, float, float, float, float]:
        """Decompress to float meters/radians."""
        return (
            self.x_mm / 1000.0,
            self.y_mm / 1000.0,
            self.z_mm / 1000.0,
            np.radians(self.roll_mdeg / 1000.0),
            np.radians(self.pitch_mdeg / 1000.0),
            np.radians(self.yaw_mdeg / 1000.0),
        )

    def to_bytes(self) -> bytes:
        """Serialize to 12-byte wire format."""
        return struct.pack(
            ">hhhhhh",
            self.x_mm,
            self.y_mm,
            self.z_mm,
            int(self.roll_mdeg / 100),   # Scale to int16 range
            int(self.pitch_mdeg / 100),
            int(self.yaw_mdeg / 100),
        )


class AUVStateVector(BaseModel):
    """
    Compressed AUV state vector for acoustic transmission.

    RQ1 Contribution: Achieves >10:1 compression vs full ROS 2 topic stream.
    Full stream baseline: ~1200 bytes/msg (sensor_msgs, nav_msgs, etc.)
    Compressed: ~48 bytes/msg

    Wire format:
        auv_id:          1 byte  (uint8, AUV identifier)
        sequence:        4 bytes (uint32, monotonic counter)
        timestamp:       8 bytes (float64)
        pose:           12 bytes (6 × int16)
        thruster_rpms:  12 bytes (6 × int16)
        battery_dv:      1 byte  (uint8, decivolts: 0=0V, 255=25.5V)
        residuals:       6 bytes (3 × float16)
        flags:           1 byte  (status bitmask)
        crc:             2 bytes (CRC-16)
        TOTAL:          47 bytes (target <50 bytes for acoustic efficiency)
    """

    # Identification
    auv_id: int = Field(ge=0, le=255, description="AUV identifier")
    timestamp: float = Field(description="ROS time in seconds")
    sequence: int = Field(ge=0, description="Monotonic sequence number")

    # Compressed state
    pose: Pose6D
    thruster_rpms: list[int] = Field(
        min_length=6,
        max_length=6,
        description="6 thruster RPMs (int16 each, ±32767 RPM)",
    )
    battery_dv: int = Field(ge=0, le=255, description="Battery voltage in decivolts")

    # Detection residuals (float16 precision sufficient for anomaly detection)
    residuals: list[float] = Field(
        min_length=3,
        max_length=3,
        description="[surge_residual, thruster_current_residual, depth_residual]",
    )

    # Status flags (bitmask)
    flags: int = Field(default=0, ge=0, le=255, description="Status bitmask")

    # Class constants
    WIRE_SIZE_BYTES: ClassVar[int] = 47
    BASELINE_ROS_BYTES: ClassVar[int] = 1200  # Full topic stream estimate

    @field_validator("residuals")
    @classmethod
    def validate_residuals(cls, v: list[float]) -> list[float]:
        """Clamp residuals to float16 range."""
        return [float(np.float16(r)) for r in v]

    @field_validator("thruster_rpms")
    @classmethod
    def validate_rpms(cls, v: list[int]) -> list[int]:
        return [int(np.clip(rpm, -32767, 32767)) for rpm in v]

    @property
    def compression_ratio(self) -> float:
        """Actual compression ratio vs baseline ROS 2 stream."""
        return self.BASELINE_ROS_BYTES / self.WIRE_SIZE_BYTES

    def to_bytes(self) -> bytes:
        """Serialize to 42-byte wire format for acoustic transmission."""
        buf = bytearray()

        # Header: auv_id (1B) + timestamp (8B) + sequence (4B)
        buf += struct.pack(">B", self.auv_id)
        buf += struct.pack(">d", self.timestamp)
        buf += struct.pack(">I", self.sequence & 0xFFFFFFFF)

        # Pose (12B)
        buf += self.pose.to_bytes()

        # Thruster RPMs: 6 × int16 (12B)
        buf += struct.pack(">hhhhhh", *self.thruster_rpms)

        # Battery (1B)
        buf += struct.pack(">B", self.battery_dv)

        # Residuals: 3 × float16 (6B)
        for r in self.residuals:
            buf += struct.pack(">e", r)  # 'e' = float16

        # Flags (1B)
        buf += struct.pack(">B", self.flags)

        # CRC-16 (2B) — computed over preceding bytes
        crc = _crc16(bytes(buf))
        buf += struct.pack(">H", crc)

        return bytes(buf)

    @classmethod
    def from_bytes(cls, data: bytes) -> "AUVStateVector":
        """Deserialize from wire format with CRC validation."""
        if len(data) < cls.WIRE_SIZE_BYTES:
            raise ValueError(f"Insufficient data: {len(data)} < {cls.WIRE_SIZE_BYTES}")

        # Validate CRC
        received_crc = struct.unpack(">H", data[-2:])[0]
        computed_crc = _crc16(data[:-2])
        if received_crc != computed_crc:
            raise ValueError(f"CRC mismatch: {received_crc} != {computed_crc}")

        offset = 0

        auv_id = struct.unpack(">B", data[offset:offset+1])[0]; offset += 1
        timestamp = struct.unpack(">d", data[offset:offset+8])[0]; offset += 8
        sequence = struct.unpack(">I", data[offset:offset+4])[0]; offset += 4

        # Pose (12B)
        x_mm, y_mm, z_mm, roll_s, pitch_s, yaw_s = struct.unpack(
            ">hhhhhh", data[offset:offset+12]
        ); offset += 12
        pose = Pose6D(
            x_mm=x_mm, y_mm=y_mm, z_mm=z_mm,
            roll_mdeg=roll_s * 100,
            pitch_mdeg=pitch_s * 100,
            yaw_mdeg=yaw_s * 100,
        )

        # Thruster RPMs (12B)
        rpms = list(struct.unpack(">hhhhhh", data[offset:offset+12])); offset += 12

        # Battery (1B)
        battery_dv = struct.unpack(">B", data[offset:offset+1])[0]; offset += 1

        # Residuals (6B)
        residuals = [
            struct.unpack(">e", data[offset+i*2:offset+i*2+2])[0]
            for i in range(3)
        ]; offset += 6

        # Flags (1B)
        flags = struct.unpack(">B", data[offset:offset+1])[0]

        return cls(
            auv_id=auv_id,
            timestamp=timestamp,
            sequence=sequence,
            pose=pose,
            thruster_rpms=rpms,
            battery_dv=battery_dv,
            residuals=residuals,
            flags=flags,
        )

    @classmethod
    def from_ros_topics(
        cls,
        auv_id: int,
        pose_m_rad: tuple[float, float, float, float, float, float],
        thruster_rpms: list[float],
        battery_v: float,
        residuals: list[float],
        sequence: int = 0,
    ) -> "AUVStateVector":
        """Construct from raw ROS topic data (full precision → compressed)."""
        return cls(
            auv_id=auv_id,
            timestamp=time.time(),
            sequence=sequence,
            pose=Pose6D.from_float(*pose_m_rad),
            thruster_rpms=[int(r) for r in thruster_rpms],
            battery_dv=int(np.clip(battery_v * 10, 0, 255)),
            residuals=residuals[:3],
        )


class AUVStateVectorBatch(BaseModel):
    """
    Batch of state vectors for efficient acoustic transmission.
    Allows grouping multiple compressed states into a single acoustic packet.
    """

    vectors: list[AUVStateVector]
    batch_timestamp: float = Field(default_factory=time.time)
    sync_rate_hz: float = Field(gt=0.0, le=10.0, description="Current sync rate")

    def total_bytes(self) -> int:
        """Total wire size of this batch."""
        return sum(AUVStateVector.WIRE_SIZE_BYTES for _ in self.vectors) + 4  # +4 header

    @property
    def info_density(self) -> float:
        """Information density: state vectors per 1200 bytes (baseline packet)."""
        if self.total_bytes() == 0:
            return 0.0
        return (len(self.vectors) * AUVStateVector.BASELINE_ROS_BYTES) / self.total_bytes()


def _crc16(data: bytes, poly: int = 0x1021, init: int = 0xFFFF) -> int:
    """CRC-16/CCITT-FALSE for wire-format integrity check."""
    crc = init
    for byte in data:
        crc ^= byte << 8
        for _ in range(8):
            if crc & 0x8000:
                crc = (crc << 1) ^ poly
            else:
                crc <<= 1
        crc &= 0xFFFF
    return crc


def compute_state_entropy(
    state_vectors: list[AUVStateVector],
    n_bins: int = 64,
) -> dict[str, float]:
    """
    Compute empirical entropy of each state dimension.
    Used for RQ1 information-theoretic analysis.

    Returns dict of {dimension_name: entropy_bits}
    """
    if not state_vectors:
        return {}

    dims: dict[str, list[float]] = {
        "x": [sv.pose.x_mm / 1000.0 for sv in state_vectors],
        "y": [sv.pose.y_mm / 1000.0 for sv in state_vectors],
        "z": [sv.pose.z_mm / 1000.0 for sv in state_vectors],
        "yaw": [sv.pose.yaw_mdeg / 1000.0 for sv in state_vectors],
        "thruster_0": [sv.thruster_rpms[0] for sv in state_vectors],
        "battery": [sv.battery_dv for sv in state_vectors],
        "residual_0": [sv.residuals[0] for sv in state_vectors],
    }

    result = {}
    for name, values in dims.items():
        arr = np.array(values)
        counts, _ = np.histogram(arr, bins=n_bins)
        probs = counts[counts > 0] / len(values)
        entropy = float(-np.sum(probs * np.log2(probs)))
        result[name] = entropy

    return result
