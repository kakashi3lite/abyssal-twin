// IoRT-DT: Batch ingest endpoint for the support vessel's sync engine.
// POST /api/v1/ingest — Accepts compressed batch of states + anomalies.
//
// The edge-gateway compresses payloads with zstd before satellite upload.
// This endpoint decompresses, validates, stores to D1, and forwards to the DO.

import { Hono } from "hono";
import type { Env, FederatedDTState, AnomalyEvent, IngestBatch } from "../types";
import { decompress as zstdDecompress } from "fzstd";
import { dataResidency } from "../middleware/data-residency";

export const ingestRoutes = new Hono<{ Bindings: Env }>();

// ITAR data residency + immutable R2 audit trail for every ingest write.
// (Moved here from the top-level mount so the bare /api/v1/ingest path is
// always covered — a "/api/v1/ingest/*" mount can miss the slash-less path.)
ingestRoutes.use("*", dataResidency());

/** Timing-safe constant-time comparison (avoids length-early-exit leaks). */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Simple per-IP token-bucket rate limit for the ingest endpoint.
 * In-memory per isolate — a deterrent, not a global quota (Free plan).
 * The gateway uploads small batches; 120/min is generous for satellite.
 */
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 120;
const ingestHits = new Map<string, { count: number; windowStart: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const hit = ingestHits.get(ip);
  if (!hit || now - hit.windowStart >= RATE_WINDOW_MS) {
    ingestHits.set(ip, { count: 1, windowStart: now });
    return false;
  }
  hit.count += 1;
  return hit.count > RATE_MAX;
}

/** POST / — Accept batch from vessel sync engine (authenticated). */
ingestRoutes.post("/", async (c) => {
  // ── AUTH (Phase 4): reject unless the vessel presents the shared secret. ──
  // Fail closed: an unconfigured INGEST_TOKEN rejects every batch.
  const expected = c.env.INGEST_TOKEN;
  const authHeader = c.req.header("Authorization") ?? "";
  const presented = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : "";
  if (!expected || !timingSafeEqual(presented, expected)) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  // ── RATE LIMIT ──
  const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
  if (rateLimited(ip)) {
    return c.json({ error: "Rate limit exceeded" }, 429);
  }

  const contentEncoding = c.req.header("Content-Encoding");
  const contentType = c.req.header("Content-Type");

  let payload: IngestBatch;

  // NOTE: we decide by PAYLOAD (zstd magic sniff), not by header. Cloudflare's
  // edge intercepts Content-Encoding request headers (observed: sending
  // `Content-Encoding: zstd` breaks the body before it reaches the Worker,
  // while the identical body without the header decodes fine). The zstd magic
  // 28 B5 2F FD is present in every standard zstd frame (what the Rust
  // `zstd` crate emits), so sniffing is unambiguous.
  const raw = new Uint8Array(await c.req.arrayBuffer());

  if (contentEncoding === "zstd" || contentType === "application/octet-stream" || looksLikeZstd(raw)) {
    try {
      const decompressed = await decompressZstd(raw);
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
    payload = JSON.parse(new TextDecoder().decode(raw)) as IngestBatch;
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
          (vehicle_id, timestamp, pose_x, pose_y, pose_z, yaw,
           position_variance, health_score, battery_pct, mission_phase, anomaly_detected)
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
        `).bind(
          state.auvId,
          // ISO-8601 UTC so /fleet/history BETWEEN filters sort correctly.
          new Date(state.timestamp * 1000).toISOString(),
          state.x,
          state.y,
          state.z,
          state.yaw,
          state.positionVariance,
          state.healthScore,
          state.batteryPct ?? null,
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
 * True when the buffer starts with the standard zstd frame magic (28 B5 2F FD).
 * Every frame produced by the Rust `zstd` crate carries this magic, so this is
 * an unambiguous payload-level signal — immune to edge header manipulation.
 */
function looksLikeZstd(data: Uint8Array): boolean {
  return (
    data.length >= 4 &&
    data[0] === 0x28 &&
    data[1] === 0xb5 &&
    data[2] === 0x2f &&
    data[3] === 0xfd
  );
}

/**
 * zstd decompression for satellite ingest batches.
 *
 * The edge-gateway compresses P1 state batches with Rust `zstd::encode_all`,
 * producing standard zstd frames. Workers' `DecompressionStream` only supports
 * gzip/deflate/deflate-raw (no zstd), so we use fzstd — a pure-JS zstd frame
 * decoder with no WASM or native dependencies.
 *
 * On failure we return the raw bytes so the caller can fall back to treating
 * the body as uncompressed JSON.
 */
async function decompressZstd(data: Uint8Array): Promise<Uint8Array> {
  try {
    return zstdDecompress(data);
  } catch {
    // Not a valid zstd frame — hand back raw data for the JSON fallback path.
    return data;
  }
}
