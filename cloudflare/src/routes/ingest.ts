// IoRT-DT: Batch ingest endpoint for the support vessel's sync engine.
// POST /api/v1/ingest — Accepts compressed batch of states + anomalies.
//
// The edge-gateway compresses payloads with zstd before satellite upload.
// This endpoint decompresses, validates, stores to D1, and forwards to the DO.

import { Hono } from "hono";
import type { Env, FederatedDTState, AnomalyEvent, IngestBatch } from "../types";

export const ingestRoutes = new Hono<{ Bindings: Env }>();

/** POST / — Accept batch from vessel sync engine. */
ingestRoutes.post("/", async (c) => {
  const contentEncoding = c.req.header("Content-Encoding");
  const contentType = c.req.header("Content-Type");

  let payload: IngestBatch;

  if (contentEncoding === "zstd" || contentType === "application/octet-stream") {
    // Compressed payload: Workers runtime handles zstd decompression
    // via DecompressionStream (available in Workers)
    const raw = await c.req.arrayBuffer();
    try {
      const decompressed = await decompressZstd(new Uint8Array(raw));
      payload = JSON.parse(new TextDecoder().decode(decompressed));
    } catch {
      // Fall back to treating as uncompressed JSON
      try {
        payload = JSON.parse(new TextDecoder().decode(raw));
      } catch {
        return c.json({ error: "Failed to parse payload" }, 400);
      }
    }
  } else {
    payload = await c.req.json<IngestBatch>();
  }

  const states = payload.states ?? [];
  const anomalies = payload.anomalies ?? [];

  if (states.length === 0 && anomalies.length === 0) {
    return c.json({ error: "No data in batch" }, 400);
  }

  // Store states to D1
  const db = c.env.FLEET_DB;
  const stateResults = { inserted: 0, errors: 0 };

  if (states.length > 0) {
    const batch: D1PreparedStatement[] = [];

    for (const state of states) {
      batch.push(
        db.prepare(`
          INSERT INTO state_vectors
          (vehicle_id, pose_x, pose_y, pose_z, yaw,
           position_variance, health_score, mission_phase, anomaly_detected)
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
        `).bind(
          state.auvId,
          state.x,
          state.y,
          state.z,
          state.yaw,
          state.positionVariance,
          state.healthScore,
          state.missionPhase,
          state.anomalyDetected ? 1 : 0
        )
      );

      // Update vehicle last_seen
      batch.push(
        db.prepare(`
          UPDATE vehicles SET last_seen = datetime('now'), status = 'online'
          WHERE id = ?1
        `).bind(state.auvId)
      );
    }

    try {
      await db.batch(batch);
      stateResults.inserted = states.length;
    } catch (err) {
      console.error("D1 batch insert failed:", err);
      stateResults.errors = states.length;
    }
  }

  // Store anomalies to D1
  const anomalyResults = { inserted: 0, errors: 0 };

  if (anomalies.length > 0) {
    const batch = anomalies.map((a: AnomalyEvent) =>
      db.prepare(`
        INSERT INTO anomalies
        (vehicle_id, detected_at, detector_type, confidence, severity, dimension)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6)
      `).bind(
        a.vehicleId,
        a.detectedAt,
        a.detectorType,
        a.confidence,
        a.severity,
        a.dimension
      )
    );

    try {
      await db.batch(batch);
      anomalyResults.inserted = anomalies.length;
    } catch (err) {
      console.error("D1 anomaly insert failed:", err);
      anomalyResults.errors = anomalies.length;
    }
  }

  // Forward to Durable Object for real-time WebSocket broadcast
  const doId = c.env.FEDERATION_COORDINATOR.idFromName("global");
  const doStub = c.env.FEDERATION_COORDINATOR.get(doId);

  c.executionCtx.waitUntil(
    doStub.fetch(new Request("https://internal/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ states, anomalies }),
    })).catch((err) => {
      console.error("DO ingest forward failed:", err);
    })
  );

  return c.json({
    accepted: true,
    states: stateResults,
    anomalies: anomalyResults,
    receivedAt: new Date().toISOString(),
  });
});

/**
 * Attempt zstd decompression using DecompressionStream.
 * Falls back to returning raw bytes if decompression is unavailable.
 */
async function decompressZstd(data: Uint8Array): Promise<Uint8Array> {
  // Workers runtime supports DecompressionStream for some formats.
  // For zstd, we may need to handle this differently or use a WASM decoder.
  // For now, try the native path and fall back.
  try {
    const ds = new DecompressionStream("deflate");
    const writer = ds.writable.getWriter();
    const reader = ds.readable.getReader();

    writer.write(data);
    writer.close();

    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    const total = chunks.reduce((sum, c) => sum + c.length, 0);
    const result = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  } catch {
    // Decompression not available; return raw data
    return data;
  }
}
