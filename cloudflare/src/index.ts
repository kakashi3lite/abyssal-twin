// IoRT-DT: Abyssal Twin — Main Cloudflare Worker Entry Point
// Hono-based REST API + Durable Object exports for fleet management.
// All routes are prefixed with /api/v1/.

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import type { Env } from "./types";
import { fleetRoutes } from "./routes/fleet";
import { missionRoutes } from "./routes/missions";
import { anomalyRoutes } from "./routes/anomalies";
import { ingestRoutes } from "./routes/ingest";
import { metricsExportRoutes } from "./routes/metrics-export";
import { requireAuth, authenticateRequest } from "./middleware/auth";
import { dataResidency } from "./middleware/data-residency";
import { metricsMiddleware, getMetrics } from "./middleware/metrics";
import { SimulationEngine } from "./simulation-engine";

// Re-export the Durable Object class so Cloudflare can bind it
export { FederationCoordinator } from "./federation-coordinator";

// ─── Hono App ───────────────────────────────────────────────────────────────

const app = new Hono<{ Bindings: Env }>();

// Global middleware (applied to all routes)
// Origin is read from ALLOWED_ORIGIN env var so each environment restricts to its own frontend.
app.use("*", (c, next) => cors({ origin: c.env.ALLOWED_ORIGIN ?? "*" })(c, next));
app.use("*", logger());
app.use("*", metricsMiddleware());

// Health check (no auth required) — docs contract is /api/v1/health.
// The root path / serves the Mission Control dashboard (static assets), so
// the health probe lives on the API prefix where tooling expects it.
app.get("/api/v1/health", (c) =>
  c.json({
    service: "abyssal-twin",
    version: "1.0.0",
    description: "Federated Digital Twin infrastructure for AUV fleets",
    environment: c.env.ENVIRONMENT,
  })
);

// Metrics endpoint (admin only in production)
app.get("/metrics", requireAuth("admin"), (c) => {
  return c.json(getMetrics());
});

// ─── Protected API Routes ───────────────────────────────────────────────────
// Fleet routes: researcher+ can read, operator+ can modify
// (auth applied inside fleetRoutes.use("*") — see routes/fleet.ts)
app.route("/api/v1/fleet", fleetRoutes);

// Mission routes: operator+ for read, admin for create
app.route("/api/v1/missions", missionRoutes);

// Anomaly routes: operator+ can acknowledge, researcher+ can read
app.route("/api/v1/anomalies", anomalyRoutes);

// Ingest route: requires auth + data residency checks for write operations.
// NOTE: applied inside ingestRoutes.use("*") (below) so it reliably runs on
// the bare POST /api/v1/ingest — a top-level "/api/v1/ingest/*" mount can
// miss the no-trailing-slash path.
app.route("/api/v1/ingest", ingestRoutes);

// Research metrics export (researcher+ can access, for dissertation Chapter 4)
app.route("/api/v1/export", metricsExportRoutes);

// ─── WebSocket Proxy to Durable Object ──────────────────────────────────────

app.get("/ws/live", async (c) => {
  const upgradeHeader = c.req.header("Upgrade");
  if (upgradeHeader !== "websocket") {
    return c.text("Expected WebSocket upgrade", 426);
  }

  // Authenticate the gossip channel — the gateway sends a Bearer service token
  // (or a browser passes the Access JWT). Fails closed: no creds = no upgrade.
  if (c.env.ENVIRONMENT !== "development") {
    const ok = await authenticateRequest(c);
    if (!ok) {
      return c.json({ error: "Authentication required" }, 401);
    }
  }

  // Route to the singleton Federation Coordinator DO
  const id = c.env.FEDERATION_COORDINATOR.idFromName("global");
  const stub = c.env.FEDERATION_COORDINATOR.get(id);

  const vesselId = c.req.query("vesselId") ?? "0";
  // Set pathname and query SEPARATELY. Setting pathname to "/ws?vesselId=..."
  // percent-encodes the '?' as %3F, so the DO receives "/ws%3FvesselId=10" and
  // its /ws route 404s — the WebSocket proxy silently broke.
  const url = new URL(c.req.url);
  url.pathname = "/ws";
  url.searchParams.set("vesselId", vesselId);

  return stub.fetch(new Request(url.toString(), c.req.raw));
});

// ─── SSE Endpoint for Mission Control UI ────────────────────────────────────
// One-way telemetry stream, more satellite-friendly than WebSocket.

app.get("/api/v1/fleet/stream", requireAuth("researcher"), async (c) => {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  // Fetch initial state from DO
  const doId = c.env.FEDERATION_COORDINATOR.idFromName("global");
  const doStub = c.env.FEDERATION_COORDINATOR.get(doId);
  const stateResp = await doStub.fetch(new Request("https://internal/state"));
  const initialState = await stateResp.text();

  // Do NOT await this write: the Response body has no consumer until the
  // Response is returned, so backpressure never clears and the request hangs
  // ("Worker code had hung..."). Fire-and-forget matches /api/v1/simulate.
  void writer.write(encoder.encode(`data: ${initialState}\n\n`));

  // Poll for updates every 5 seconds
  const interval = setInterval(async () => {
    try {
      const resp = await doStub.fetch(new Request("https://internal/state"));
      const data = await resp.text();
      await writer.write(encoder.encode(`data: ${data}\n\n`));
    } catch {
      clearInterval(interval);
      await writer.close();
    }
  }, 5000);

  // Clean up on client disconnect
  c.req.raw.signal.addEventListener("abort", () => {
    clearInterval(interval);
    writer.close().catch(() => {});
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
});

// ─── Simulation Mode SSE ─────────────────────────────────────────────────────
// When no real AUVs are connected, this endpoint streams realistic abyssal
// telemetry (depth 3 000–3 050 m, pressure ~300 bar, draining battery).
// The Mission Control frontend's connectSSE() can point here for demo/staging.

app.get("/api/v1/simulate", (c) => {
  const engine = new SimulationEngine();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  const send = async () => {
    try {
      const payload = engine.next();
      await writer.write(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
    } catch {
      // writer already closed
    }
  };

  // Send first frame immediately so the client doesn't wait 2 s
  void send();
  const id = setInterval(() => void send(), 2000);

  c.req.raw.signal.addEventListener("abort", () => {
    clearInterval(id);
    writer.close().catch(() => {});
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      // CORS handled by global cors() middleware (app.use("*", cors()))
    },
  });
});

// ─── Static-Asset Fallback: Mission Control dashboard ───────────────────────
// With run_worker_first = true, unmatched requests reach the worker. Fall
// through to the ASSETS binding so the React dashboard (same origin, behind
// the same Cloudflare Access app) is served. The API routes above take
// precedence; this only fires for dashboard assets / SPA routes.
app.notFound(async (c) => {
  // Normalize to the asset host so ASSETS resolves by path (the inbound host
  // may be a custom domain or *.workers.dev — path is what matters).
  const url = new URL(c.req.url);
  url.hostname = "asset.local";
  url.protocol = "https:";
  const assetReq = new Request(url.toString(), c.req.raw);
  const res = await c.env.ASSETS.fetch(assetReq);
  if (res.status === 404 && c.req.path !== "/") {
    // SPA client routing: unknown deep links fall back to index.html.
    return c.env.ASSETS.fetch(new Request("https://asset.local/"));
  }
  return res;
});

export default app;
