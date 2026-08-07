// SafetyEngine honesty contract: PNR must be "unavailable" when the wire has
// no battery, and a real number when it does. Never fabricate from healthScore.

import { describe, it, expect } from "vitest";
import { SafetyEngine } from "./SafetyEngine";
import type { Vehicle } from "../types";

const PROFILE = {
  vehicleId: 1,
  vehicleType: "auv" as const,
  massKg: 150,
  dragCoefficient: 0.3,
  frontalAreaM2: 0.15,
  basePowerDrawW: 50,
  propulsionEfficiency: 0.7,
  batteryCapacityWh: 5000,
  currentSpeedMs: 2.5,
  maxSpeedMs: 4.0,
  maxDepthM: 6000,
};
const ENV = {
  currentSpeedMs: 0.5,
  currentDirectionDegrees: 45,
  vehicleHeadingDegrees: 0,
  waterDensityKgM3: 1025,
  temperatureC: 4,
  seaState: 2,
};
const HOME = { x: 0, y: 0, z: 0 };

function vehicle(batteryPct: number | undefined): Vehicle {
  return {
    id: 1,
    name: "AUV-01",
    type: "auv",
    status: "online",
    lastSeen: new Date().toISOString(),
    latestState: {
      auvId: 1,
      timestamp: 1754668800,
      x: 1000,
      y: 0,
      z: -500,
      yaw: 0,
      positionVariance: 0.1,
      anomalyDetected: false,
      healthScore: 200,
      batteryPct,
    },
  };
}

describe("SafetyEngine — PNR honesty", () => {
  it("returns UNAVAILABLE when battery telemetry is missing (no healthScore fallback)", () => {
    const engine = new SafetyEngine();
    const pnr = engine.calculatePointOfNoReturn(
      vehicle(undefined),
      HOME,
      PROFILE,
      ENV
    );
    expect(pnr.recommendedAction).toBe("UNAVAILABLE");
    expect(pnr.minutesToPnr).toBeNull();
  });

  it("computes a real PNR when batteryPct is present", () => {
    const engine = new SafetyEngine();
    const pnr = engine.calculatePointOfNoReturn(vehicle(85), HOME, PROFILE, ENV);
    expect(pnr.minutesToPnr).not.toBeNull();
    expect(pnr.currentBatteryPct).toBe(85);
    expect(pnr.canSafelyReturn).not.toBeNull();
  });

  it("flags an emergency when PNR is breached", () => {
    const engine = new SafetyEngine();
    // 2% battery, 5 km from home → required energy far exceeds reserve.
    const pnr = engine.calculatePointOfNoReturn(
      { ...vehicle(2), latestState: { ...vehicle(2).latestState!, x: 5000 } },
      HOME,
      PROFILE,
      ENV
    );
    expect(pnr.minutesToPnr! <= 0).toBe(true);
    expect(pnr.recommendedAction).toBe("CRITICAL_ABORT");
  });
});
