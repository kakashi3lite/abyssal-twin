// IoRT-DT: Federation Coordinator — Cloudflare Durable Object
// Singleton stateful coordinator for fleet gossip protocol.
// Port of Rust FederationManager from src/iort_dt_federation/src/lib.rs.
//
// Uses WebSocket Hibernation API for cost-effective maritime operations:
// the DO hibernates when no vessels are connected, resuming on reconnect.

import { VectorClock } from "./vector-clock";
import { MerkleTree } from "./merkle";
import type {
  Env,
  FederatedDTState,
  GossipMessage,
  GossipMerkleRoot,
  GossipRequestLeaves,
  GossipStateUpdate,
  GossipPartitionHeal,
  AnomalyEvent,
} from "./types";

// Heartbeat timeout: vessel is "partitioned" if no message for this duration.
const HEARTBEAT_TIMEOUT_MS = 120_000; // 2 minutes (generous for satellite)
// Alarm interval for periodic checkpoints and partition detection.
const ALARM_INTERVAL_MS = 30_000; // 30 seconds

/** Metadata attached to each WebSocket via Hibernation API. */
interface WebSocketMeta {
  vesselId: number;
  connectedAt: number;
  lastHeartbeat: number;
}

/**
 * FederationCoordinator: Singleton Durable Object managing fleet-wide state.
 *
 * Responsibilities:
 * - Accept WebSocket connections from support vessels (via satellite)
 * - Run gossip protocol: Merkle root comparison -> leaf exchange -> state merge
 * - Kalman fusion for partition recovery (inverse-covariance weighting)
 * - Periodic state checkpoint to D1 for persistence
 */
export class FederationCoordinator implements DurableObject {
  private state: DurableObjectState;
  private env: Env;

  // In-memory fleet state map: auv_id -> FederatedDTState
  private fleetStates: Map<number, FederatedDTState> = new Map();
  // Track which vessels are connected
  private vesselSockets: Map<number, WebSocket> = new Map();

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;

    // Restore fleet state from durable storage on cold start
    this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.get<Map<number, FederatedDTState>>(
        "fleetStates"
      );
      if (stored) this.fleetStates = stored;
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // WebSocket upgrade for vessel connections
    if (url.pathname === "/ws" && request.headers.get("Upgrade") === "websocket") {
      return this.handleWebSocketUpgrade(request);
    }

    // REST endpoints for the Hono API to call internally
    if (url.pathname === "/state" && request.method === "GET") {
      return this.handleGetState();
    }

    if (url.pathname === "/ingest" && request.method === "POST") {
      return this.handleIngest(request);
    }

    return new Response("Not Found", { status: 404 });
  }

  // ─── WebSocket Hibernation API ──────────────────────────────────────────

  private handleWebSocketUpgrade(request: Request): Response {
    const vesselIdParam = new URL(request.url).searchParams.get("vesselId");
    const vesselId = vesselIdParam ? Number(vesselIdParam) : 0;

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];

    // Attach metadata for the Hibernation API
    const meta: WebSocketMeta = {
      vesselId,
      connectedAt: Date.now(),
      lastHeartbeat: Date.now(),
    };

    this.state.acceptWebSocket(server, [String(vesselId)]);
    this.vesselSockets.set(vesselId, server);

    // Store metadata in durable storage keyed by vessel
    this.state.storage.put(`ws:${vesselId}`, meta);

    // Schedule alarm for periodic checkpoint + partition detection
    this.state.storage.setAlarm(Date.now() + ALARM_INTERVAL_MS);

    console.log(`[Federation] Vessel ${vesselId} connected via WebSocket`);

    return new Response(null, { status: 101, webSocket: client });
  }

  /** Called by Hibernation API when a WebSocket message arrives. */
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const raw = typeof message === "string" ? message : new TextDecoder().decode(message);

    let gossipMsg: GossipMessage;
    try {
      gossipMsg = JSON.parse(raw) as GossipMessage;
    } catch {
      ws.send(JSON.stringify({ error: "invalid JSON" }));
      return;
    }

    // Update heartbeat for the sending vessel
    const tags = this.state.getTags(ws);
    if (tags.length > 0) {
      const vesselId = Number(tags[0]);
      const meta = await this.state.storage.get<WebSocketMeta>(`ws:${vesselId}`);
      if (meta) {
        meta.lastHeartbeat = Date.now();
        await this.state.storage.put(`ws:${vesselId}`, meta);
      }
    }

    // Process gossip and optionally respond
    const response = await this.processGossip(gossipMsg);
    if (response) {
      ws.send(JSON.stringify(response));
    }
  }

  /** Called by Hibernation API when a WebSocket is closed. */
  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean): Promise<void> {
    const tags = this.state.getTags(ws);
    if (tags.length > 0) {
      const vesselId = Number(tags[0]);
      this.vesselSockets.delete(vesselId);
      await this.state.storage.delete(`ws:${vesselId}`);
      console.log(`[Federation] Vessel ${vesselId} disconnected (code=${code})`);
    }
  }

  /** Called by Hibernation API on WebSocket error. */
  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    console.error("[Federation] WebSocket error:", error);
  }

  // ─── Gossip Protocol (ported from Rust FederationManager) ───────────────

  /**
   * Process an incoming gossip message.
   * Mirrors Rust FederationManager::process_gossip() from lib.rs lines 234-299.
   */
  private async processGossip(
    message: GossipMessage
  ): Promise<GossipMessage | null> {
    switch (message.type) {
      case "merkle_root":
        return this.handleMerkleRoot(message);

      case "request_leaves":
        return this.handleRequestLeaves(message);

      case "state_update":
        await this.handleStateUpdate(message);
        return null;

      case "partition_heal":
        await this.handlePartitionHeal(message);
        return null;

      default:
        console.warn("[Federation] Unknown gossip message type");
        return null;
    }
  }

  /** Compare Merkle roots; request divergent leaves if they differ. */
  private async handleMerkleRoot(
    msg: GossipMerkleRoot
  ): Promise<GossipMessage | null> {
    const localStates = [...this.fleetStates.values()];
    const localTree = await MerkleTree.fromStates(localStates);

    const remoteRoot = msg.root instanceof Uint8Array
      ? msg.root
      : new Uint8Array(Object.values(msg.root as Record<string, number>));

    if (!hashEquals(localTree.root, remoteRoot)) {
      // Roots differ: request all AUV states (simplified; full impl uses leaf diff)
      const allIds = localStates.map((s) => s.auvId);
      return {
        type: "request_leaves",
        fromAuv: 255, // cloud coordinator ID
        requestedAuvIds: allIds,
      };
    }

    return null; // Roots match, fleet is consistent
  }

  /** Respond with requested DT states. */
  private handleRequestLeaves(
    msg: GossipRequestLeaves
  ): GossipMessage | null {
    const requested = msg.requestedAuvIds;
    const states: FederatedDTState[] = [];

    for (const id of requested) {
      const state = this.fleetStates.get(id);
      if (state) states.push(state);
    }

    if (states.length === 0) return null;

    return {
      type: "state_update",
      fromAuv: 255,
      states,
    };
  }

  /** Merge incoming states using timestamp ordering (simplified causal merge). */
  private async handleStateUpdate(msg: GossipStateUpdate): Promise<void> {
    for (const remote of msg.states) {
      const local = this.fleetStates.get(remote.auvId);

      // Accept if no local state or remote is newer
      if (!local || remote.timestamp > local.timestamp) {
        // Rehydrate VectorClock from JSON if needed
        remote.clock = remote.clock instanceof VectorClock
          ? remote.clock
          : VectorClock.fromJSON(remote.clock as unknown as Record<string, number>);

        this.fleetStates.set(remote.auvId, remote);
      }
    }

    await this.persistFleetState();
  }

  /**
   * Partition heal: apply weighted Kalman fusion for reconciliation.
   * Port of Rust kalman_reconcile() from lib.rs lines 313-360.
   *
   * Inverse-covariance weighting:
   *   x_fused = (sum(w_i * x_i)) / (sum(w_i))
   *   w_i = 1 / (sigma^2_i + epsilon)
   */
  private async handlePartitionHeal(msg: GossipPartitionHeal): Promise<void> {
    console.log(
      `[Federation] Partition heal from vessel ${msg.fromAuv}: ` +
      `disconnected for ${msg.disconnectionDurationS.toFixed(1)}s`
    );

    for (const remote of msg.states) {
      const local = this.fleetStates.get(remote.auvId);

      if (!local) {
        // No local state: accept remote directly
        this.fleetStates.set(remote.auvId, remote);
        continue;
      }

      // Weighted Kalman fusion
      const EPSILON = 1e-10;
      const wLocal = 1.0 / (local.positionVariance + EPSILON);
      const wRemote = 1.0 / (remote.positionVariance + EPSILON);
      const wTotal = wLocal + wRemote;

      // Merge vector clocks
      const mergedClock = local.clock instanceof VectorClock
        ? local.clock
        : VectorClock.fromJSON(local.clock as unknown as Record<string, number>);

      const remoteClock = remote.clock instanceof VectorClock
        ? remote.clock
        : VectorClock.fromJSON(remote.clock as unknown as Record<string, number>);

      mergedClock.merge(remoteClock);

      const fused: FederatedDTState = {
        auvId: remote.auvId,
        timestamp: Math.max(local.timestamp, remote.timestamp),
        clock: mergedClock,
        // Inverse-covariance weighted position fusion
        x: (wLocal * local.x + wRemote * remote.x) / wTotal,
        y: (wLocal * local.y + wRemote * remote.y) / wTotal,
        z: (wLocal * local.z + wRemote * remote.z) / wTotal,
        yaw: (wLocal * local.yaw + wRemote * remote.yaw) / wTotal,
        // Fused variance (harmonic mean)
        positionVariance: 1.0 / wTotal,
        // Conservative: propagate anomaly if either side detected one
        anomalyDetected: local.anomalyDetected || remote.anomalyDetected,
        anomalyDimension: remote.anomalyDetected
          ? remote.anomalyDimension
          : local.anomalyDimension,
        healthScore: Math.min(local.healthScore, remote.healthScore),
        missionPhase: remote.missionPhase,
      };

      this.fleetStates.set(remote.auvId, fused);
    }

    await this.persistFleetState();
  }

  // ─── REST Handlers (called internally by Hono API) ──────────────────────

  /** Return current fleet state as JSON. */
  private handleGetState(): Response {
    const states: Record<number, FederatedDTState> = {};
    for (const [id, state] of this.fleetStates) {
      states[id] = {
        ...state,
        clock: state.clock instanceof VectorClock
          ? state.clock
          : VectorClock.fromJSON(state.clock as unknown as Record<string, number>),
      };
    }
    return Response.json({ states, updatedAt: new Date().toISOString() });
  }

  /** Accept batch ingest from vessel and update state. */
  private async handleIngest(request: Request): Promise<Response> {
    const body = await request.json() as {
      states?: FederatedDTState[];
      anomalies?: AnomalyEvent[];
    };

    // Merge incoming states
    if (body.states) {
      for (const state of body.states) {
        state.clock = state.clock instanceof VectorClock
          ? state.clock
          : VectorClock.fromJSON(state.clock as unknown as Record<string, number>);
        const local = this.fleetStates.get(state.auvId);
        if (!local || state.timestamp > local.timestamp) {
          this.fleetStates.set(state.auvId, state);
        }
      }
    }

    // Persist anomalies to D1
    if (body.anomalies && body.anomalies.length > 0) {
      await this.persistAnomalies(body.anomalies);
    }

    await this.persistFleetState();

    // Broadcast update to all connected vessels
    this.broadcastState();

    return Response.json({ accepted: true, stateCount: this.fleetStates.size });
  }

  // ─── Alarm (periodic checkpoint + partition detection) ──────────────────

  async alarm(): Promise<void> {
    // Checkpoint fleet state to durable storage
    await this.persistFleetState();

    // Detect partitioned vessels (no heartbeat within timeout)
    const now = Date.now();
    const entries = await this.state.storage.list<WebSocketMeta>({ prefix: "ws:" });

    for (const [key, meta] of entries) {
      if (now - meta.lastHeartbeat > HEARTBEAT_TIMEOUT_MS) {
        console.log(`[Federation] Vessel ${meta.vesselId} appears partitioned`);
        // Update vehicle status in D1
        await this.updateVehicleStatus(meta.vesselId, "partitioned");
      }
    }

    // Persist latest state vectors to D1 for API queries
    await this.checkpointToD1();

    // Reschedule alarm
    this.state.storage.setAlarm(Date.now() + ALARM_INTERVAL_MS);
  }

  // ─── Persistence ────────────────────────────────────────────────────────

  /** Save fleet state to Durable Object storage (fast, in-memory). */
  private async persistFleetState(): Promise<void> {
    await this.state.storage.put("fleetStates", this.fleetStates);
  }

  /** Checkpoint current fleet state to D1 for REST API queries. */
  private async checkpointToD1(): Promise<void> {
    try {
      const db = this.env.FLEET_DB;
      const batch: D1PreparedStatement[] = [];

      for (const [, state] of this.fleetStates) {
        // Upsert vehicle last_seen and status
        batch.push(
          db.prepare(
            `UPDATE vehicles SET last_seen = ?, status = 'online'
             WHERE id = ?`
          ).bind(new Date(state.timestamp * 1000).toISOString(), state.auvId)
        );

        // Insert state vector
        batch.push(
          db.prepare(
            `INSERT INTO state_vectors
             (vehicle_id, pose_x, pose_y, pose_z, yaw, position_variance,
              health_score, mission_phase, anomaly_detected)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
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
      }

      if (batch.length > 0) {
        await db.batch(batch);
      }
    } catch (err) {
      console.error("[Federation] D1 checkpoint failed:", err);
    }
  }

  /** Write anomaly events to D1. */
  private async persistAnomalies(anomalies: AnomalyEvent[]): Promise<void> {
    try {
      const db = this.env.FLEET_DB;
      const batch = anomalies.map((a) =>
        db.prepare(
          `INSERT INTO anomalies
           (vehicle_id, detected_at, detector_type, confidence, severity, dimension)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).bind(
          a.vehicleId,
          a.detectedAt,
          a.detectorType,
          a.confidence,
          a.severity,
          a.dimension
        )
      );
      await db.batch(batch);
    } catch (err) {
      console.error("[Federation] Anomaly persist failed:", err);
    }
  }

  /** Update a vehicle's connectivity status in D1. */
  private async updateVehicleStatus(
    vehicleId: number,
    status: "online" | "partitioned" | "offline"
  ): Promise<void> {
    try {
      await this.env.FLEET_DB
        .prepare("UPDATE vehicles SET status = ? WHERE id = ?")
        .bind(status, vehicleId)
        .run();
    } catch (err) {
      console.error("[Federation] Status update failed:", err);
    }
  }

  /** Broadcast current state to all connected WebSocket clients. */
  private broadcastState(): void {
    const payload = JSON.stringify({
      type: "state_update",
      fromAuv: 255,
      states: [...this.fleetStates.values()],
    });

    for (const ws of this.state.getWebSockets()) {
      try {
        ws.send(payload);
      } catch {
        // Socket may have closed; will be cleaned up on next alarm
      }
    }
  }
}

// ─── Utility ──────────────────────────────────────────────────────────────

function hashEquals(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return result === 0;
}
