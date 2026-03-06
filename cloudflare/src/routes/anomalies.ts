// IoRT-DT: Anomaly review and acknowledgment API routes.
// GET  /api/v1/anomalies         — List anomalies (filterable)
// GET  /api/v1/anomalies/:id     — Get anomaly details
// POST /api/v1/anomalies/:id/ack — Acknowledge an anomaly

import { Hono } from "hono";
import type { Env } from "../types";

export const anomalyRoutes = new Hono<{ Bindings: Env }>();

/** GET / — List anomalies with filtering. */
anomalyRoutes.get("/", async (c) => {
  const vehicleId = c.req.query("vehicleId");
  const acked = c.req.query("acked"); // "true", "false", or omit for all
  const since = c.req.query("since");
  const limit = Math.min(Number(c.req.query("limit") ?? "100"), 1000);

  const db = c.env.FLEET_DB;
  const conditions: string[] = [];
  const params: (string | number)[] = [];
  let paramIdx = 1;

  if (vehicleId) {
    conditions.push(`a.vehicle_id = ?${paramIdx}`);
    params.push(Number(vehicleId));
    paramIdx++;
  }

  if (acked === "true") {
    conditions.push("a.ack_by IS NOT NULL");
  } else if (acked === "false") {
    conditions.push("a.ack_by IS NULL");
  }

  if (since) {
    conditions.push(`a.detected_at >= ?${paramIdx}`);
    params.push(since);
    paramIdx++;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  params.push(limit);

  const sql = `
    SELECT a.*, v.name as vehicle_name
    FROM anomalies a
    LEFT JOIN vehicles v ON v.id = a.vehicle_id
    ${where}
    ORDER BY a.detected_at DESC
    LIMIT ?${paramIdx}
  `;

  const rows = await db.prepare(sql).bind(...params).all();

  const anomalies = (rows.results ?? []).map((row) => ({
    id: row.id as number,
    vehicleId: row.vehicle_id as number,
    vehicleName: row.vehicle_name as string,
    detectedAt: row.detected_at as string,
    receivedAt: row.received_at as string,
    detectorType: row.detector_type as string,
    confidence: row.confidence as number,
    severity: row.severity as number,
    dimension: row.dimension as string,
    ackBy: row.ack_by as string | null,
    ackAt: row.ack_at as string | null,
  }));

  return c.json({
    count: anomalies.length,
    anomalies,
    unacknowledged: anomalies.filter((a) => !a.ackBy).length,
  });
});

/** GET /:id — Get a single anomaly. */
anomalyRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const db = c.env.FLEET_DB;

  const row = await db.prepare(`
    SELECT a.*, v.name as vehicle_name
    FROM anomalies a
    LEFT JOIN vehicles v ON v.id = a.vehicle_id
    WHERE a.id = ?1
  `).bind(Number(id)).first();

  if (!row) {
    return c.json({ error: "Anomaly not found" }, 404);
  }

  return c.json({
    id: row.id as number,
    vehicleId: row.vehicle_id as number,
    vehicleName: row.vehicle_name as string,
    detectedAt: row.detected_at as string,
    receivedAt: row.received_at as string,
    detectorType: row.detector_type as string,
    confidence: row.confidence as number,
    severity: row.severity as number,
    dimension: row.dimension as string,
    ackBy: row.ack_by as string | null,
    ackAt: row.ack_at as string | null,
  });
});

/** POST /:id/ack — Acknowledge an anomaly (operator action). */
anomalyRoutes.post("/:id/ack", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{ operatorId: string }>().catch(() => null);

  if (!body?.operatorId) {
    return c.json({ error: "operatorId is required" }, 400);
  }

  const db = c.env.FLEET_DB;

  // Check anomaly exists
  const existing = await db.prepare("SELECT id, ack_by FROM anomalies WHERE id = ?1")
    .bind(Number(id))
    .first();

  if (!existing) {
    return c.json({ error: "Anomaly not found" }, 404);
  }

  if (existing.ack_by) {
    return c.json({
      error: "Anomaly already acknowledged",
      ackBy: existing.ack_by,
    }, 409);
  }

  await db.prepare(`
    UPDATE anomalies
    SET ack_by = ?1, ack_at = datetime('now')
    WHERE id = ?2
  `).bind(body.operatorId, Number(id)).run();

  return c.json({
    acknowledged: true,
    id: Number(id),
    ackBy: body.operatorId,
    ackAt: new Date().toISOString(),
  });
});
