// Integration tests for the Hono REST API.
// Tests the complete request/response cycle including D1 queries.
// Uses SELF from @cloudflare/vitest-pool-workers for full worker-level testing.

import { describe, it, expect, beforeAll } from "vitest";
import { env, SELF } from "cloudflare:test";

// ─── D1 Setup ────────────────────────────────────────────────────────────────

beforeAll(async () => {
  // Apply schema and seed data for the test D1 database.
  // D1's exec() requires single-line SQL, so we use prepare().run() for each DDL.
  const db = env.FLEET_DB;

  await db.prepare("CREATE TABLE IF NOT EXISTS vehicles (id INTEGER PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL CHECK (type IN ('auv', 'usv', 'support')), last_seen TEXT, acoustic_address TEXT, status TEXT NOT NULL DEFAULT 'offline' CHECK (status IN ('online', 'partitioned', 'offline')), created_at TEXT NOT NULL DEFAULT (datetime('now')))").run();

  await db.prepare("CREATE TABLE IF NOT EXISTS state_vectors (id INTEGER PRIMARY KEY AUTOINCREMENT, vehicle_id INTEGER NOT NULL, timestamp TEXT NOT NULL DEFAULT (datetime('now')), pose_x REAL, pose_y REAL, pose_z REAL, yaw REAL, position_variance REAL, covariance BLOB, health_score INTEGER, mission_phase INTEGER, anomaly_detected INTEGER NOT NULL DEFAULT 0, FOREIGN KEY (vehicle_id) REFERENCES vehicles(id))").run();

  await db.prepare("CREATE TABLE IF NOT EXISTS anomalies (id INTEGER PRIMARY KEY AUTOINCREMENT, vehicle_id INTEGER NOT NULL, detected_at TEXT NOT NULL, received_at TEXT NOT NULL DEFAULT (datetime('now')), detector_type TEXT, confidence REAL, severity REAL, dimension TEXT, ack_by TEXT, ack_at TEXT, FOREIGN KEY (vehicle_id) REFERENCES vehicles(id))").run();

  await db.prepare("CREATE TABLE IF NOT EXISTS missions (id TEXT PRIMARY KEY, name TEXT NOT NULL, started_at TEXT, ended_at TEXT, status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'active', 'completed', 'aborted')), rosbag_r2_key TEXT, metrics_r2_key TEXT, notes TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')))").run();

  // Seed test vehicles
  await db.prepare("INSERT OR IGNORE INTO vehicles (id, name, type, status) VALUES (1, 'AUV-Alpha', 'auv', 'online')").run();
  await db.prepare("INSERT OR IGNORE INTO vehicles (id, name, type, status) VALUES (2, 'AUV-Bravo', 'auv', 'offline')").run();
  await db.prepare("INSERT OR IGNORE INTO vehicles (id, name, type, status) VALUES (3, 'AUV-Charlie', 'auv', 'partitioned')").run();
  await db.prepare("INSERT OR IGNORE INTO vehicles (id, name, type, status) VALUES (4, 'Support-Vessel', 'support', 'online')").run();

  // Seed a state vector for AUV-Alpha
  await db.prepare("INSERT INTO state_vectors (vehicle_id, pose_x, pose_y, pose_z, yaw, position_variance, health_score, mission_phase, anomaly_detected) VALUES (1, 10.5, 20.3, -15.0, 1.57, 0.05, 200, 2, 0)").run();
});

// ─── Health Check ────────────────────────────────────────────────────────────

describe("Health Check", () => {
  it("GET / returns service info", async () => {
    const resp = await SELF.fetch("https://test.local/");
    expect(resp.status).toBe(200);

    const body = await resp.json() as Record<string, string>;
    expect(body.service).toBe("abyssal-twin");
    expect(body.version).toBe("1.0.0");
  });
});

// ─── Fleet API ───────────────────────────────────────────────────────────────

describe("Fleet API", () => {
  it("GET /api/v1/fleet/status returns fleet state from D1", async () => {
    const resp = await SELF.fetch("https://test.local/api/v1/fleet/status");
    expect(resp.status).toBe(200);

    const body = await resp.json() as { vehicles: unknown[]; updatedAt: string };
    expect(body.vehicles).toBeDefined();
    expect(body.vehicles.length).toBeGreaterThanOrEqual(4);
    expect(body.updatedAt).toBeDefined();
  });

  it("GET /api/v1/fleet/history requires vehicleId", async () => {
    const resp = await SELF.fetch("https://test.local/api/v1/fleet/history");
    expect(resp.status).toBe(400);

    const body = await resp.json() as { error: string };
    expect(body.error).toContain("vehicleId");
  });

  it("GET /api/v1/fleet/history returns state vectors for a vehicle", async () => {
    // Use a wide time range to capture the seeded data regardless of clock skew
    const from = "2020-01-01T00:00:00Z";
    const to = "2099-12-31T23:59:59Z";
    const resp = await SELF.fetch(
      `https://test.local/api/v1/fleet/history?vehicleId=1&from=${from}&to=${to}`
    );
    expect(resp.status).toBe(200);

    const body = await resp.json() as { vehicleId: number; count: number; stateVectors: unknown[] };
    expect(body.vehicleId).toBe(1);
    expect(body.count).toBeGreaterThanOrEqual(1);
  });
});

// ─── Ingest API ──────────────────────────────────────────────────────────────

describe("Ingest API", () => {
  it("POST /api/v1/ingest accepts state batch", async () => {
    const batch = {
      vesselId: 4,
      states: [
        {
          auvId: 1,
          timestamp: Date.now() / 1000,
          clock: { "1": 5 },
          x: 11.0, y: 21.0, z: -16.0, yaw: 1.5,
          positionVariance: 0.03,
          anomalyDetected: false,
          anomalyDimension: 0,
          healthScore: 195,
          missionPhase: 2,
        },
      ],
      anomalies: [],
      sentAt: new Date().toISOString(),
    };

    const resp = await SELF.fetch("https://test.local/api/v1/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(batch),
    });

    expect(resp.status).toBe(200);
    const body = await resp.json() as { accepted: boolean; states: { inserted: number } };
    expect(body.accepted).toBe(true);
    expect(body.states.inserted).toBe(1);
  });

  it("POST /api/v1/ingest accepts anomaly events", async () => {
    const batch = {
      vesselId: 4,
      states: [],
      anomalies: [
        {
          vehicleId: 2,
          detectedAt: new Date().toISOString(),
          detectorType: "cusum",
          confidence: 0.95,
          severity: 0.7,
          dimension: "depth",
        },
      ],
      sentAt: new Date().toISOString(),
    };

    const resp = await SELF.fetch("https://test.local/api/v1/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(batch),
    });

    expect(resp.status).toBe(200);
    const body = await resp.json() as { accepted: boolean; anomalies: { inserted: number } };
    expect(body.accepted).toBe(true);
    expect(body.anomalies.inserted).toBe(1);
  });

  it("POST /api/v1/ingest rejects empty batch", async () => {
    const resp = await SELF.fetch("https://test.local/api/v1/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ states: [], anomalies: [] }),
    });

    expect(resp.status).toBe(400);
  });
});

// ─── WebSocket Proxy ─────────────────────────────────────────────────────────

describe("WebSocket Proxy", () => {
  it("GET /ws/live rejects non-upgrade requests", async () => {
    const resp = await SELF.fetch("https://test.local/ws/live");
    expect(resp.status).toBe(426); // Upgrade Required
  });
});
