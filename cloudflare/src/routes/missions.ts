// IoRT-DT: Mission management API routes.
// POST /api/v1/missions       — Create a new mission
// GET  /api/v1/missions       — List missions
// GET  /api/v1/missions/:id   — Get mission details with R2 download links

import { Hono } from "hono";
import type { Env, Mission } from "../types";

export const missionRoutes = new Hono<{ Bindings: Env }>();

/** POST / — Create a new mission. Returns mission ID. */
missionRoutes.post("/", async (c) => {
  const body = await c.req.json<{ name: string; notes?: string }>();

  if (!body.name) {
    return c.json({ error: "name is required" }, 400);
  }

  const id = crypto.randomUUID();
  const db = c.env.FLEET_DB;

  await db.prepare(`
    INSERT INTO missions (id, name, status, notes)
    VALUES (?1, ?2, 'planned', ?3)
  `).bind(id, body.name, body.notes ?? null).run();

  return c.json({ id, name: body.name, status: "planned" }, 201);
});

/** GET / — List all missions. */
missionRoutes.get("/", async (c) => {
  const status = c.req.query("status");
  const limit = Math.min(Number(c.req.query("limit") ?? "50"), 200);

  const db = c.env.FLEET_DB;

  let query = "SELECT * FROM missions";
  const params: (string | number)[] = [];

  if (status) {
    query += " WHERE status = ?1";
    params.push(status);
  }

  query += " ORDER BY created_at DESC LIMIT ?";
  params.push(limit);

  // Construct the correct query with numbered params
  const stmt = status
    ? db.prepare(`SELECT * FROM missions WHERE status = ?1 ORDER BY created_at DESC LIMIT ?2`)
        .bind(status, limit)
    : db.prepare(`SELECT * FROM missions ORDER BY created_at DESC LIMIT ?1`)
        .bind(limit);

  const rows = await stmt.all();

  const missions: Mission[] = (rows.results ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    status: row.status as Mission["status"],
    startedAt: row.started_at as string | null,
    endedAt: row.ended_at as string | null,
    rosbagR2Key: row.rosbag_r2_key as string | null,
    metricsR2Key: row.metrics_r2_key as string | null,
  }));

  return c.json({ count: missions.length, missions });
});

/** GET /:id — Get mission details including R2 presigned URLs. */
missionRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const db = c.env.FLEET_DB;

  const row = await db.prepare("SELECT * FROM missions WHERE id = ?1")
    .bind(id)
    .first();

  if (!row) {
    return c.json({ error: "Mission not found" }, 404);
  }

  const mission: Mission = {
    id: row.id as string,
    name: row.name as string,
    status: row.status as Mission["status"],
    startedAt: row.started_at as string | null,
    endedAt: row.ended_at as string | null,
    rosbagR2Key: row.rosbag_r2_key as string | null,
    metricsR2Key: row.metrics_r2_key as string | null,
  };

  // Check if mission data exists in R2
  const r2 = c.env.MISSION_STORE;
  let rosbagSize: number | null = null;
  let metricsSize: number | null = null;

  if (mission.rosbagR2Key) {
    const head = await r2.head(mission.rosbagR2Key);
    rosbagSize = head?.size ?? null;
  }
  if (mission.metricsR2Key) {
    const head = await r2.head(mission.metricsR2Key);
    metricsSize = head?.size ?? null;
  }

  return c.json({
    mission,
    storage: { rosbagSize, metricsSize },
  });
});

/** PATCH /:id — Update mission status (start, complete, abort). */
missionRoutes.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{
    status?: string;
    rosbagR2Key?: string;
    metricsR2Key?: string;
  }>();

  const db = c.env.FLEET_DB;
  const updates: string[] = [];
  const params: (string | number)[] = [];
  let paramIdx = 1;

  if (body.status) {
    updates.push(`status = ?${paramIdx}`);
    params.push(body.status);
    paramIdx++;

    if (body.status === "active") {
      updates.push(`started_at = datetime('now')`);
    } else if (body.status === "completed" || body.status === "aborted") {
      updates.push(`ended_at = datetime('now')`);
    }
  }

  if (body.rosbagR2Key) {
    updates.push(`rosbag_r2_key = ?${paramIdx}`);
    params.push(body.rosbagR2Key);
    paramIdx++;
  }

  if (body.metricsR2Key) {
    updates.push(`metrics_r2_key = ?${paramIdx}`);
    params.push(body.metricsR2Key);
    paramIdx++;
  }

  if (updates.length === 0) {
    return c.json({ error: "No fields to update" }, 400);
  }

  params.push(id);
  const sql = `UPDATE missions SET ${updates.join(", ")} WHERE id = ?${paramIdx}`;
  await db.prepare(sql).bind(...params).run();

  return c.json({ updated: true, id });
});
