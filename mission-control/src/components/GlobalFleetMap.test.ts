/**
 * GlobalFleetMap.test.ts
 *
 * Regression tests for the hybrid Mapbox/MapLibre map engine (Phase 8.7).
 *
 * Phase 8.7 root cause: `isUsableMapboxToken()` accepted the placeholder
 * default `pk.placeholder.token` → the map rendered a dead "Mapbox API token
 * required" screen on every origin. These tests lock in the token gate and the
 * marker alert-level mapping so the map NEVER regresses to that failure mode.
 *
 * Node/vitest pure-unit pattern (no jsdom/WebGL needed — these functions carry
 * zero mapbox-gl dependency).
 */

import { describe, it, expect } from "vitest";
import {
  isUsableMapboxToken,
  shouldUseMapbox,
  calculateAlertLevel,
  getAlertColor,
  calculateDistance,
  type FleetAsset,
  type AlertLevel,
} from "./GlobalFleetMap";

// ============================================
// FIXTURES
// ============================================

function makeAsset(overrides: Partial<FleetAsset> = {}): FleetAsset {
  return {
    id: 1,
    name: "AUV-01",
    type: "auv",
    status: "online",
    lastSeen: new Date().toISOString(),
    latestState: {
      auvId: 1,
      timestamp: 1754668800,
      x: 0,
      y: 0,
      z: -100,
      yaw: 0,
      positionVariance: 0.05,
      anomalyDetected: false,
      healthScore: 200,
      batteryPct: 100,
    },
    latitude: 0,
    longitude: 0,
    region: "atlantic",
    missionId: "M-1",
    operationalMode: "survey",
    etPnr: null,
    assetValue: 1_000_000,
    ...overrides,
  };
}

// ============================================
// isUsableMapboxToken — Phase 8.7 root-cause gate
// ============================================

describe("isUsableMapboxToken — hybrid engine token gate", () => {
  it("accepts a real Mapbox public token (pk.*, length>40, no placeholder)", () => {
    // 61-char realistic pk.* token (format: pk.eyJ... — JWT payload)
    const token = "pk.eyJ1IjoiYWJ5c3NhbC10d2luIiwiYSI6ImNsc3ZraWxsZXIxMjM0NTY3ODkwIn0.abcdefgh";
    expect(token.startsWith("pk.")).toBe(true);
    expect(token.length).toBeGreaterThan(40);
    expect(isUsableMapboxToken(token)).toBe(true);
  });

  it("REJECTS the old placeholder default — the Phase 8.7 regression", () => {
    // This exact value shipped in .env before the fix and produced the dead
    // "Mapbox API token required" screen. It must never render Mapbox GL.
    expect(isUsableMapboxToken("pk.placeholder.token")).toBe(false);
  });

  it("rejects undefined / empty / whitespace tokens", () => {
    expect(isUsableMapboxToken(undefined)).toBe(false);
    expect(isUsableMapboxToken("")).toBe(false);
    expect(isUsableMapboxToken("   ")).toBe(false);
  });

  it("rejects non-pk.* tokens (secret tokens must never ship to the browser)", () => {
    expect(isUsableMapboxToken("sk.eyJhbGciOiJSUzI1NiJ9.verylongsecret")).toBe(false);
  });

  it("rejects any token containing 'placeholder' regardless of position", () => {
    const token = "pk.eyJ1IjoiYWJ5c3NhbC10d2luIiwiYSI6ImNsc3ZraWxsZXIxMjM0NTY3ODkwIn0.PLACEHOLDER";
    expect(isUsableMapboxToken(token)).toBe(false);
  });

  it("rejects short pk.* tokens (real tokens are >40 chars)", () => {
    expect(isUsableMapboxToken("pk.skrt")).toBe(false);
  });

  it("documents the hybrid decision: Mapbox GL iff gate passes, else MapLibre", () => {
    // The component renders <MapboxMap> when useMapbox = shouldUseMapbox(t, failed),
    // <MapLibreMap> otherwise. Assert the two outcomes of that single gate.
    expect(shouldUseMapbox("pk.eyJ1IjoiYWJ5c3NhbC10d2luIiwiYSI6ImNsc3ZraWxsZXIxMjM0NTY3ODkwIn0.abcdefgh", false)).toBe(true); // → Mapbox GL
    expect(shouldUseMapbox(undefined, false)).toBe(false);                                                              // → MapLibre (token-free)
    expect(shouldUseMapbox("pk.placeholder.token", false)).toBe(false);                                                 // → MapLibre (never dead screen)
  });
});

// ============================================
// shouldUseMapbox — runtime fallback (Mapbox GL failure → MapLibre)
// ============================================

describe("shouldUseMapbox — runtime self-heal", () => {
  const REAL_TOKEN = "pk.eyJ1IjoiYWJ5c3NhbC10d2luIiwiYSI6ImNsc3ZraWxsZXIxMjM0NTY3ODkwIn0.abcdefgh";

  it("uses Mapbox GL with a valid token while the engine is healthy", () => {
    expect(shouldUseMapbox(REAL_TOKEN, false)).toBe(true);
  });

  it("falls back to MapLibre if Mapbox GL failed at runtime, even with a valid token", () => {
    // This is the anti dead-canvas guarantee: if Mapbox GL throws (WebGL, blob
    // worker, style 401, network) the map must still render a basemap.
    expect(shouldUseMapbox(REAL_TOKEN, true)).toBe(false);
  });

  it("never uses Mapbox GL without a usable token, regardless of failure state", () => {
    expect(shouldUseMapbox(undefined, false)).toBe(false);
    expect(shouldUseMapbox("pk.placeholder.token", false)).toBe(false);
    expect(shouldUseMapbox("", true)).toBe(false);
  });

  it("requires a failure flag to be set — a transient pre-load error is the only trigger", () => {
    // mapFailed is only set by the component when onError fires before onLoad,
    // so the decision is: token AND NOT failed.
    expect(shouldUseMapbox(REAL_TOKEN, false)).toBe(true);
    expect(shouldUseMapbox(REAL_TOKEN, true)).toBe(false);
  });
});

// ============================================
// calculateAlertLevel / getAlertColor — marker rendering
// ============================================

describe("calculateAlertLevel — PNR/battery → marker severity", () => {
  it("flags emergency when PNR is breached (etPnr <= 0)", () => {
    expect(calculateAlertLevel(makeAsset({ etPnr: 0 }))).toBe("emergency");
    expect(calculateAlertLevel(makeAsset({ etPnr: -5 }))).toBe("emergency");
  });

  it("flags critical when PNR is inside the 10-minute buffer", () => {
    expect(calculateAlertLevel(makeAsset({ etPnr: 10 }))).toBe("critical");
    expect(calculateAlertLevel(makeAsset({ etPnr: 5 }))).toBe("critical");
  });

  it("flags critical when battery < 15%", () => {
    expect(calculateAlertLevel(makeAsset({
      latestState: { ...makeAsset().latestState!, batteryPct: 14 },
    }))).toBe("critical");
  });

  it("flags warning when battery < 30%", () => {
    expect(calculateAlertLevel(makeAsset({
      latestState: { ...makeAsset().latestState!, batteryPct: 20 },
    }))).toBe("warning");
  });

  it("flags warning for a partitioned vehicle (acoustic blackout)", () => {
    expect(calculateAlertLevel(makeAsset({ status: "partitioned" }))).toBe("warning");
  });

  it("flags warning when PNR <= 20 min (pre-critical window)", () => {
    expect(calculateAlertLevel(makeAsset({ etPnr: 15 }))).toBe("warning");
  });

  it("is normal for a healthy asset with unknown battery", () => {
    expect(calculateAlertLevel(makeAsset({
      latestState: { ...makeAsset().latestState!, batteryPct: undefined },
      etPnr: null,
    }))).toBe("normal");
  });
});

describe("getAlertColor — marker palette", () => {
  const palette: Record<AlertLevel, string> = {
    emergency: "#dc2626",
    critical: "#ea580c",
    warning: "#ca8a04",
    normal: "#16a34a",
  };

  it("maps every level to its fixed color", () => {
    (Object.keys(palette) as AlertLevel[]).forEach((level) => {
      expect(getAlertColor(level)).toBe(palette[level]);
    });
  });
});

// ============================================
// calculateDistance — cluster radius math (CLUSTER_RADIUS_KM = 500)
// ============================================

describe("calculateDistance — haversine for cluster formation", () => {
  it("returns ~0 for identical coordinates", () => {
    expect(calculateDistance(25, -40, 25, -40)).toBeLessThan(1e-6);
  });

  it("approximates ~111 km per degree of latitude", () => {
    // 1° of latitude ≈ 111,320 m. Allow the spherical-haversine delta.
    const d = calculateDistance(0, 0, 1, 0);
    expect(d).toBeGreaterThan(110_500);
    expect(d).toBeLessThan(111_600);
  });

  it("is symmetric (swap endpoints → same distance)", () => {
    const a = calculateDistance(10, 20, 30, 40);
    const b = calculateDistance(30, 40, 10, 20);
    expect(a).toBeCloseTo(b, 6);
  });

  it("keeps assets < 500 km clusterable (CLUSTER_RADIUS_KM boundary)", () => {
    // ~4° apart at the equator ≈ 445 km < 500 km → would cluster together.
    const d = calculateDistance(0, 0, 0, 4);
    expect(d).toBeLessThan(500_000);
    expect(d).toBeGreaterThan(400_000);
  });
});
