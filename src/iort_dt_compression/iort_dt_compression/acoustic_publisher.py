"""Acoustic link publisher — the fleet-tier side of the pipeline.

Publishes the RQ1 47-byte AUVStateVector frames over Zenoh on
``iort/dt/{auv_id}/state``, and optionally bridge-schema anomaly JSON on
``iort/dt/{auv_id}/anomaly``.

Pipeline:
    AUV sensors -> AUVStateVector.to_bytes() (47B) -> Zenoh put
      -> edge-gateway zenoh_bridge (decode_state_vector -> FederatedDTState)
      -> SQLite cache -> zstd sync -> Cloudflare ingest -> DO -> dashboard SSE

Run (against the docker zenoh router on tcp/localhost:7447):
    poetry run python -m iort_dt_compression.acoustic_publisher \
        --auv-id 1 --rate 1.0 --zenoh-config docker/zenoh/acoustic.json5
"""

from __future__ import annotations

import argparse
import json
import math
import time

import zenoh

from .models import AUVStateVector, Pose6D
from .security import build_secure_frame


def build_state(auv_id: int, t: float, seq: int, anomaly: bool = False) -> AUVStateVector:
    """Synthetic telemetry: an AUV circling at ~25 m radius, ~20 m depth."""
    ang = 0.1 * t
    x = 25.0 * math.cos(ang)
    y = 25.0 * math.sin(ang)
    z = -20.0 - 2.0 * math.sin(0.05 * t)
    yaw = ang % (2 * math.pi)

    pose = Pose6D.from_float(x, y, z, 0.0, 0.0, yaw)

    # Flags: bit7 anomaly_detected, bits6-5 mission_phase (2 = survey)
    flags = 0x40 | (0x80 if anomaly else 0x00)

    return AUVStateVector(
        auv_id=auv_id,
        timestamp=t,
        sequence=seq,
        pose=pose,
        thruster_rpms=[1200, -800, 1500, -900, 1100, -700],
        battery_dv=245,
        residuals=[0.0, 0.0, 0.0],
        flags=flags,
    )


def build_anomaly(auv_id: int, detected_at: str) -> dict:
    """Anomaly JSON matching the edge-gateway bridge's AnomalyAlert schema."""
    return {
        "vehicle_id": auv_id,
        "detected_at": detected_at,
        "detector_type": "cusum",
        "confidence": 0.97,
        "severity": 0.72,
        "dimension": "depth",
    }


def publish_loop(
    auv_id: int,
    rate_hz: float,
    zenoh_config: str | None,
    topic_prefix: str = "iort/dt",
    emit_anomaly_every: int = 0,
    hmac_key: bytes | None = None,
) -> None:
    """Publish 47-byte state frames (optionally HMAC-authenticated) in a loop."""
    conf = zenoh.Config.from_file(zenoh_config) if zenoh_config else zenoh.Config()
    session = zenoh.open(conf)

    state_topic = f"{topic_prefix}/{auv_id}/state"
    anomaly_topic = f"{topic_prefix}/{auv_id}/anomaly"
    interval = 1.0 / rate_hz
    mode = "HMAC-secured 57B" if hmac_key else "plain 47B"
    print(f"[publisher] {state_topic} @ {rate_hz} Hz ({mode} AUVStateVector)")

    seq = 0
    try:
        while True:
            t = time.time()
            anomaly = emit_anomaly_every > 0 and seq % emit_anomaly_every == 0
            sv = build_state(auv_id, t, seq, anomaly=anomaly)
            payload = sv.to_bytes()
            if hmac_key is not None:
                # 57-byte authenticated frame: [2B seq][8B HMAC][47B payload]
                frame = build_secure_frame(payload, seq, hmac_key)
            else:
                frame = payload
            session.put(state_topic, frame)

            if anomaly:
                session.put(
                    anomaly_topic,
                    json.dumps(build_anomaly(auv_id, time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))),
                )
                print(f"[publisher] anomaly frame seq={seq}")

            if seq % 10 == 0:
                print(
                    f"[publisher] seq={seq} auv={auv_id} "
                    f"x={sv.pose.x_mm / 1000.0:.2f} y={sv.pose.y_mm / 1000.0:.2f} "
                    f"z={sv.pose.z_mm / 1000.0:.2f} bytes={len(frame)}"
                )

            seq += 1
            time.sleep(interval)
    except KeyboardInterrupt:
        print("[publisher] stopped")
    finally:
        session.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Acoustic AUVStateVector publisher (fleet tier)")
    parser.add_argument("--auv-id", type=int, default=1, help="AUV identifier (default 1)")
    parser.add_argument("--rate", type=float, default=1.0, help="publish rate in Hz")
    parser.add_argument(
        "--zenoh-config", default=None, help="path to Zenoh config (default: peer mode)"
    )
    parser.add_argument("--topic-prefix", default="iort/dt")
    parser.add_argument(
        "--emit-anomaly-every", type=int, default=0, help="emit an anomaly every N frames (0=off)"
    )
    parser.add_argument(
        "--hmac-key",
        default=None,
        help="shared HMAC key (optional). When set, frames are wrapped in the "
        "57-byte [2B seq][8B HMAC][47B] authenticated format.",
    )
    args = parser.parse_args()

    hmac_key = args.hmac_key.encode() if args.hmac_key else None
    publish_loop(
        auv_id=args.auv_id,
        rate_hz=args.rate,
        zenoh_config=args.zenoh_config,
        topic_prefix=args.topic_prefix,
        emit_anomaly_every=args.emit_anomaly_every,
        hmac_key=hmac_key,
    )


if __name__ == "__main__":
    main()
