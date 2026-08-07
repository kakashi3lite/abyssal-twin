// Unit tests for the honest backend→asset adapter.
// Phase 3: the mapping must never synthesize battery/PNR (operator trust).

import { describe, it, expect } from "vitest";
import type { Vehicle } from "../types";
import {
  stateToFleetAsset,
  generateFleetAlerts,
  phaseToMode,
  healthPct,
  fleetToAssets,
  MISSION_ORIGIN,
} from "./fleetAdapter";

function makeVehicle(overrides: Partial<Vehicle> = {}): Vehicle {
  return {
    id: 1,
    name: "AUV-01",
    type: "auv",
    status: "online",
    lastSeen: new Date().toISOString(),
    latestState: {
      auvId: 1,
      timestamp: 1754668800,
      x: 10.5,
      y: 20.25,
      z: -15.5,
      yaw: 0.8,
      positionVariance: 0.05,
      anomalyDetected: false,
      healthScore: 200,
      missionPhase: 2,
    },
    ...overrides,
  };
}

describe("fleetAdapter — honesty contract", () => {
  it("anchors the local (x,y) frame to the mission origin", () => {
    const asset = stateToFleetAsset(makeVehicle());
    // 20.25 m north → ~0.00018° lat; 10.5 m east → ~0.00013° lon.
    expect(asset.latitude).toBeCloseTo(MISSION_ORIGIN.lat + 20.25 / 111320, 6);
    expect(asset.longitude).toBeGreaterThan(MISSION_ORIGIN.lon);
    expect(asset.operationalMode).toBe("survey"); // missionPhase 2
  });

  it("never fabricates PNR — etPnr stays null when battery is unknown", () => {
    const asset = stateToFleetAsset(makeVehicle());
    expect(asset.etPnr).toBeNull();
  });

  it("maps mission phase to the operational-mode vocabulary", () => {
    expect(phaseToMode(0)).toBe("docked");
    expect(phaseToMode(1)).toBe("transit");
    expect(phaseToMode(2)).toBe("survey");
    expect(phaseToMode(3)).toBe("emergency");
  });

  it("converts healthScore 0-255 to a 0-100 percentage", () => {
    expect(healthPct(255)).toBe(100);
    expect(healthPct(128)).toBe(50);
    expect(healthPct(0)).toBe(0);
    expect(healthPct(undefined)).toBeNull();
  });

  it("raises a critical alert for a backend anomaly flag", () => {
    const asset = stateToFleetAsset(
      makeVehicle({ latestState: { ...makeVehicle().latestState!, anomalyDetected: true } })
    );
    const alerts = generateFleetAlerts([asset]);
    const anomaly = alerts.find((a) => a.type === "anomaly");
    expect(anomaly).toBeDefined();
    expect(anomaly!.severity).toBe("critical");
  });

  it("raises communication_loss for a partitioned vehicle", () => {
    const asset = stateToFleetAsset(makeVehicle({ status: "partitioned" }));
    const alerts = generateFleetAlerts([asset]);
    expect(alerts.some((a) => a.type === "communication_loss")).toBe(true);
  });

  it("preserves depth and heading for the map/detail panels", () => {
    // depthM/heading are produced by the SSE parser; the adapter preserves them.
    const vehicle = makeVehicle();
    vehicle.latestState!.depthM = 15.5;
    vehicle.latestState!.heading = (0.8 * 180) / Math.PI;
    const asset = stateToFleetAsset(vehicle);
    expect(asset.latestState!.depthM).toBeCloseTo(15.5, 6);
    expect(asset.latestState!.heading).toBeCloseTo((0.8 * 180) / Math.PI, 4);
  });

  it("sorts fleet assets stably by id", () => {
    const v2 = makeVehicle({ id: 2, name: "AUV-02" });
    const v1 = makeVehicle();
    const assets = fleetToAssets({ vehicles: [v2, v1], updatedAt: new Date().toISOString() });
    expect(assets.map((a) => a.id)).toEqual([1, 2]);
  });
});
