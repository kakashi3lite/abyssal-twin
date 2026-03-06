// IoRT-DT: Fleet status and history API routes.
// GET /api/v1/fleet/status   — Current fleet state (cached 5s)
// GET /api/v1/fleet/history  — Time-series state retrieval

import { Hono } from "hono";
import type { Env, FleetStatus, VehicleStatus } from "../types";

export const fleetRoutes = new Hono<{ Bindings: Env }>();

/**
 * GET /status — Current fleet state from D1.
 * Uses Cache API with stale-while-revalidate for low-latency reads.
 */
fleetRoutes.get("/status", async (c) => {
  const cacheKey = new Request(c.req.url);
  const cache = caches.default;

  // Check cache first (5-second TTL)
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const db = c.env.FLEET_DB;

  // Get all vehicles with their latest state
  const vehicles = await db.prepare(`
    SELECT v.id, v.name, v.type, v.status, v.last_seen,
           sv.pose_x, sv.pose_y, sv.pose_z, sv.yaw,
           sv.position_variance, sv.health_score, sv.mission_phase,
           sv.anomaly_detected
    FROM vehicles v
    LEFT JOIN state_vectors sv ON sv.vehicle_id = v.id
      AND sv.id = (SELECT MAX(id) FROM state_vectors WHERE vehicle_id = v.id)
    ORDER BY v.id
  `).all();

  const status: FleetStatus = {
    vehicles: (vehicles.results ?? []).map((row): VehicleStatus => ({
      id: row.id as number,
      name: row.name as string,
      type: row.type as "auv" | "usv" | "support",
      status: row.status as "online" | "partitioned" | "offline",
      lastSeen: row.last_seen as string | null,
      latestState: row.pose_x != null
        ? {
            auvId: row.id as number,
            timestamp: Date.now() / 1000,
            clock: { clocks: new Map() } as never,
            x: row.pose_x as number,
            y: row.pose_y as number,
            z: row.pose_z as number,
            yaw: row.yaw as number,
            positionVariance: row.position_variance as number,
            anomalyDetected: (row.anomaly_detected as number) !== 0,
            anomalyDimension: 0,
            healthScore: row.health_score as number,
            missionPhase: row.mission_phase as number,
          }
        : null,
    })),
    updatedAt: new Date().toISOString(),
  };

  const response = c.json(status);

  // Cache for 5 seconds (stale-while-revalidate for satellite-constrained clients)
  const cacheable = new Response(JSON.stringify(status), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=5, stale-while-revalidate=30",
    },
  });
  c.executionCtx.waitUntil(cache.put(cacheKey, cacheable));

  return response;
});

/**
 * GET /history — Time-series state retrieval for a vehicle.
 * Query params: vehicleId, from (ISO-8601), to (ISO-8601), limit
 */
fleetRoutes.get("/history", async (c) => {
  const vehicleId = c.req.query("vehicleId");
  const from = c.req.query("from") ?? new Date(Date.now() - 3600_000).toISOString();
  const to = c.req.query("to") ?? new Date().toISOString();
  const limit = Math.min(Number(c.req.query("limit") ?? "1000"), 10000);

  if (!vehicleId) {
    return c.json({ error: "vehicleId query parameter required" }, 400);
  }

  const db = c.env.FLEET_DB;
  const rows = await db.prepare(`
    SELECT id, vehicle_id, timestamp, pose_x, pose_y, pose_z, yaw,
           position_variance, health_score, mission_phase, anomaly_detected
    FROM state_vectors
    WHERE vehicle_id = ?1
      AND timestamp BETWEEN ?2 AND ?3
    ORDER BY timestamp DESC
    LIMIT ?4
  `).bind(Number(vehicleId), from, to, limit).all();

  return c.json({
    vehicleId: Number(vehicleId),
    from,
    to,
    count: rows.results?.length ?? 0,
    stateVectors: rows.results ?? [],
  });
});
