# 47-Byte AUVStateVector Wire Format

## Specification

The AUVStateVector is the RQ1 research contribution — a 47-byte compressed state vector achieving 25.5:1 compression vs the 1,200-byte ROS2 baseline.

### Byte Layout

```
Offset  Size  Type     Field           Description
------  ----  ----     -----           -----------
0       1     uint8    auv_id          AUV identifier (0-255)
1       8     float64  timestamp       ROS time in seconds (IEEE 754 double)
9       4     uint32   sequence        Monotonic counter (wraps at 2^32)
13      12    6×int16  pose            x_mm, y_mm, z_mm, roll_s, pitch_s, yaw_s
25      12    6×int16  thruster_rpms   6 thruster RPM values (±32767)
37      1     uint8    battery_dv      Battery voltage in decivolts (0-25.5V)
38      6     3×float16 residuals      Surge (m/s²), thruster current (A), depth residual (m)
44      1     uint8    flags           Status bitmask (see below)
45      2     uint16   crc             CRC-16/CCITT-FALSE of bytes 0-44
---     --     ----     -----           -----------
47      TOTAL
```

### Flags Bitmask (Byte 44)

```
Bit 7: anomaly_detected   (1 = anomaly active)
Bit 6: mission_phase[1]   (MSB of 2-bit mission phase)
Bit 5: mission_phase[0]   (LSB: 0=idle, 1=transit, 2=survey, 3=emergency)
Bit 4: health_warning      (1 = health < 50%)
Bit 3: battery_low         (1 = battery < 20%)
Bit 2: comm_degraded       (1 = acoustic link degraded)
Bit 1: reserved
Bit 0: reserved
```

### Field Ranges and Precision

| Field | Range | Resolution | Precision at 95% CI |
|---|---|---|---|
| Position (x,y,z) | ±32.767 m | 1 mm | ±0.5 mm (quantization only) |
| Orientation (roll, pitch) | ±180° | ~0.0055° (decimillidegree/100) | ±0.01° |
| Orientation (yaw) | 0-360° | ~0.0055° | ±0.01° |
| Thruster RPM | ±32,767 | 1 RPM | ±0.5 RPM |
| Battery | 0-25.5 V | 0.1 V | ±0.05 V |
| Residuals (float16) | ±65,504 | ~0.001 (relative) | ±0.1% |

### CRC-16 Specification

- Polynomial: 0x1021 (CCITT-FALSE / CRC-16/KERMIT)
- Initial value: 0xFFFF
- No XOR-out, no reflection
- Computed over bytes 0-44 (all fields except CRC itself)
- Implementation: table-driven in `models.py:compute_crc16()`

### Serialization (Python)

```python
import struct

def to_bytes(self) -> bytes:
    base = struct.pack(">BdIhhhhhhhhhhhhBeeeBB",
        self.auv_id, self.timestamp, self.sequence,
        self.pose.x_mm, self.pose.y_mm, self.pose.z_mm,
        self.pose.roll_s, self.pose.pitch_s, self.pose.yaw_s,
        *self.thruster_rpms,
        self.battery_dv,
        self.residuals[0], self.residuals[1], self.residuals[2],
        self.flags, 0  # padding byte for CRC alignment
    )
    crc = compute_crc16(base)  # over the first 45 bytes
    return base + struct.pack(">H", crc)
```

### Downstream Deserializers

| Tier | File | Format | Notes |
|---|---|---|---|
| Python | `models.py:AUVStateVector.from_bytes()` | struct.unpack | Reference implementation |
| Rust (federation) | `lib.rs:FederatedDTState` | bincode | Uses f32 for position (meter conversion) |
| Rust (gateway) | `zenoh_bridge.rs` | bincode | Same as federation — shared crate |
| TypeScript (DO) | `types.ts:FederatedDTState` | JSON | Converted by ingest route before DO forward |
| D1 (database) | `migrations/0001_initial.sql` | SQL columns | REAL for position, INTEGER for health/phase |

### Precision Loss in Downstream Conversion

The Python→Rust conversion (int16 mm → f32 meters) is the primary loss path:

```
python_int16_mm = 12345  # 12.345 meters
rust_f32_m = 12.345      # float32 representation
roundtrip_mm = int(rust_f32_m * 1000)  # 12345 (exact in this case)
```

Error exceeds 1mm when the f32 mantissa (23 bits) can't represent the mm value exactly. At ±32.7m range, the worst-case error is ~0.0039% of the value, or ~1.3mm at the range limits.

### Adding a Field (Procedure)

1. Identify which existing field(s) to shrink or remove
2. Calculate new byte budget: must total exactly 47 bytes (or get explicit approval for increase)
3. Update: `models.py`, `lib.rs`, `types.ts`, D1 migration
4. Update: `detectors.py` if residuals or thresholds change
5. Run: `make test-all` — all cross-tier roundtrip tests must pass
6. Document: update this reference file with new layout
