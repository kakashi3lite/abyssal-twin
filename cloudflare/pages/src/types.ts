// Shared domain types for Abyssal Twin Mission Control.
// Single source of truth — imported by useFleetSSE, AbyssalScene, useDeadReckoning.

/** Telemetry packet fed into the dead-reckoning hook.
 *  Velocity fields (vx/vy/vz) are EMA-derived by TelemetryInterpolator
 *  from consecutive SSE position fixes — the backend does not emit them directly. */
export interface TelemetryPacket {
  timestamp: number; // Unix ms of the last confirmed position fix
  x: number;
  y: number;
  z: number;  // world coords in SSE units
  vx: number;
  vy: number;
  vz: number; // velocity m/s (derived)
}

/** Full vehicle status as delivered by the Cloudflare SSE stream. */
export interface VehicleStatus {
  id: number;
  name: string;
  type: "auv" | "usv" | "support";
  status: "online" | "partitioned" | "offline";
  lastSeen: string | null;
  latestState: {
    x: number;
    y: number;
    z: number;
    yaw: number;
    positionVariance: number;
    healthScore: number;
    missionPhase: number;
    anomalyDetected: boolean;
  } | null;
}
