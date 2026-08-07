/**
 * Abyssal Twin — Backend Simulation Engine
 *
 * Generates realistic AUV telemetry for use when no physical fleet is connected.
 * Produces "Simulation Mode" data that matches the production SSE/WS message schema
 * so the Mission Control UI works end-to-end without hardware.
 *
 * Sensor model (abyssal survey):
 *   Depth     : 3 000 – 3 050 m  (sinusoidal oscillation + noise)
 *   Pressure  : depthM / 10 bar  (1 bar ≈ 10 m seawater)
 *   Battery   : drains from 100 % → 0 % over ~8-hour simulated mission
 *   Heading   : 0 – 360 °, follows lawnmower survey pattern
 *   Status    : "OK" normally, "WARN" on low battery or random 2 % chance
 */

// ─── Types ───────────────────────────────────────────────────────────────────

interface AUVSimState {
  id: number;
  name: string;
  type: "auv" | "usv";
  baseDepth: number;  // metres
  x: number;
  y: number;
  baseX: number;
  baseY: number;
  vx: number;
  vy: number;
  yaw: number;
  missionTime: number; // seconds (increments by 2 each tick)
  batteryPct: number;
  healthScore: number;
  hasAnomaly: boolean;
}

export interface SimVehicle {
  id: number;
  name: string;
  type: "auv" | "usv";
  status: "online" | "partitioned" | "offline";
  lastSeen: string;
  latestState: SimStateVector;
}

export interface SimStateVector {
  auvId: number;
  timestamp: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  positionVariance: number;
  anomalyDetected: boolean;
  healthScore: number;
  // Live telemetry
  depthM: number;
  batteryPct: number;
  pressureBar: number;
  heading: number;
}

export interface SimFleetPayload {
  vehicles: SimVehicle[];
  updatedAt: string;
  simulationMode: true;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const INITIAL_PROFILES: Omit<AUVSimState, "x" | "y" | "vx" | "vy" | "yaw" | "missionTime" | "batteryPct" | "healthScore" | "hasAnomaly">[] = [
  { id: 1, name: "AUV-01 Nautilus", type: "auv", baseDepth: 3000, baseX: 100, baseY: 100 },
  { id: 2, name: "AUV-02 Poseidon", type: "auv", baseDepth: 3010, baseX: 300, baseY: 200 },
  { id: 3, name: "USV-01 Triton",   type: "usv", baseDepth: 5,    baseX: 500, baseY: 300 },
  { id: 4, name: "AUV-03 Kraken",   type: "auv", baseDepth: 3025, baseX: 700, baseY: 400 },
];

/** Battery drain: 0.007 % per 2-second tick → ~8 h mission life */
const BATTERY_DRAIN_PER_TICK = 0.007;

/** Leg length in seconds for lawnmower pattern */
const LEG_DURATION_S = 60;

// ─── SimulationEngine ────────────────────────────────────────────────────────

export class SimulationEngine {
  private auvs: AUVSimState[];
  private tickCount = 0;

  constructor() {
    this.auvs = INITIAL_PROFILES.map(p => ({
      ...p,
      x: p.baseX,
      y: p.baseY,
      vx: 0,
      vy: 0,
      yaw: 0,
      missionTime: 0,
      batteryPct: 100,
      healthScore: 98,
      hasAnomaly: false,
    }));
  }

  /** Advance simulation by one 2-second tick and return fleet snapshot */
  next(): SimFleetPayload {
    this.tickCount++;
    const now = new Date().toISOString();
    const vehicles: SimVehicle[] = [];

    for (const s of this.auvs) {
      s.missionTime += 2;

      // ── Movement: lawnmower survey ──────────────────────────────────────
      const leg      = Math.floor(s.missionTime / LEG_DURATION_S) % 4;
      const progress = (s.missionTime % LEG_DURATION_S) / LEG_DURATION_S;

      switch (leg) {
        case 0: s.vx =  2.5; s.vy =  0;   s.x = s.baseX + progress * 200; s.y = s.baseY;           break;
        case 1: s.vx =  0;   s.vy =  2.5; s.x = s.baseX + 200;            s.y = s.baseY + progress * 200; break;
        case 2: s.vx = -2.5; s.vy =  0;   s.x = s.baseX + 200 - progress * 200; s.y = s.baseY + 200; break;
        case 3: s.vx =  0;   s.vy = -2.5; s.x = s.baseX;                  s.y = s.baseY + 200 - progress * 200; break;
      }

      // Position noise
      s.x += (pseudoRandom(s.id, this.tickCount, 0) - 0.5) * 2;
      s.y += (pseudoRandom(s.id, this.tickCount, 1) - 0.5) * 2;

      // ── Depth (abyssal oscillation) ─────────────────────────────────────
      const rawZ = -(s.baseDepth + Math.sin(s.missionTime * 0.05) * 25
                    + pseudoRandom(s.id, this.tickCount, 2) * 5);
      const depthM      = Math.round(Math.abs(rawZ) * 10) / 10;
      const pressureBar = Math.round(depthM / 10 * 10) / 10;

      // ── Heading ─────────────────────────────────────────────────────────
      s.yaw = Math.atan2(s.vy, s.vx);
      const heading = Math.round(((s.yaw * 180 / Math.PI) + 360) % 360 * 10) / 10;

      // ── Battery ─────────────────────────────────────────────────────────
      s.batteryPct = Math.max(0, s.batteryPct - BATTERY_DRAIN_PER_TICK);

      // ── Health & anomaly ─────────────────────────────────────────────────
      s.healthScore = clamp(s.healthScore + (pseudoRandom(s.id, this.tickCount, 3) - 0.5), 85, 100);
      const isBatteryLow = s.batteryPct < 20;
      const randomFault  = pseudoRandom(s.id, this.tickCount, 4) < 0.02;
      s.hasAnomaly = isBatteryLow || randomFault;

      // ── Position variance ────────────────────────────────────────────────
      const positionVariance = Math.round((0.5 + depthM / 3000) * 100) / 100;

      const status: "online" | "partitioned" | "offline" =
        s.healthScore > 90 ? "online" : s.healthScore > 70 ? "partitioned" : "offline";

      vehicles.push({
        id: s.id,
        name: s.name,
        type: s.type,
        status,
        lastSeen: now,
        latestState: {
          auvId:           s.id,
          timestamp:       Date.now(),
          x:               Math.round(s.x * 100) / 100,
          y:               Math.round(s.y * 100) / 100,
          z:               Math.round(rawZ * 100) / 100,
          yaw:             Math.round(s.yaw * 100) / 100,
          positionVariance,
          anomalyDetected: s.hasAnomaly,
          healthScore:     Math.round(s.healthScore),
          depthM,
          batteryPct:      Math.round(s.batteryPct * 10) / 10,
          pressureBar,
          heading,
        },
      });
    }

    return { vehicles, updatedAt: now, simulationMode: true };
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Deterministic pseudo-random in [0, 1) — avoids Math.random() seeding issues */
function pseudoRandom(vehicleId: number, tick: number, seed: number): number {
  const x = Math.sin(vehicleId * 127.1 + tick * 311.7 + seed * 74.3) * 43758.5453;
  return x - Math.floor(x);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
