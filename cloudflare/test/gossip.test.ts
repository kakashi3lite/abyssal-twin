// Phase 2.4: FederationCoordinator DO gossip protocol integration test.
//
// Drives all 4 gossip phases over real WebSockets through the singleton
// Durable Object, validating the anti-entropy exchange and Kalman fusion:
//   Phase 1: merkle_root   — cheap 32-byte state comparison
//   Phase 2: request_leaves — request divergent AUV states
//   Phase 3: state_update  — timestamp-ordered merge
//   Phase 4: partition_heal — inverse-covariance Kalman fusion
//
// Each test uses a distinct auvId so the shared DO singleton state cannot
// leak between tests.

import { describe, it, expect } from "vitest";
import { env, SELF } from "cloudflare:test";
import { VectorClock } from "../src/vector-clock";
import { MerkleTree } from "../src/merkle";
import { rehydrateClock } from "../src/federation-coordinator";
import type { FederatedDTState, GossipMessage } from "../src/types";

const DO_NAME = "global";

// ─── rehydrateClock ─────────────────────────────────────────────────────────

describe("rehydrateClock", () => {
  it("returns live VectorClock instances unchanged", () => {
    const vc = new VectorClock();
    vc.tick(1);
    const out = rehydrateClock(vc);
    expect(out).toBe(vc);
    expect(out.toBytes().length).toBe(9); // 1 entry × 9 bytes
  });

  it("rehydrates toJSON output ({auvId: time})", () => {
    const out = rehydrateClock({ "1": 5, "2": 3 } as Record<string, number>);
    expect(out.clocks.get(1)).toBe(5);
    expect(out.clocks.get(2)).toBe(3);
    // Must be a real VectorClock usable by merkleHash
    expect(typeof out.toBytes).toBe("function");
    expect(out.toBytes().length).toBe(2 * 9);
  });

  it("rehydrates structured-clone-restored shape ({clocks: Map})", () => {
    // Regression: DO storage round-trip drops the VectorClock prototype,
    // leaving { clocks: Map }. merkleHash's clock.toBytes() would throw on
    // this shape — the rehydrator must rebuild a real VectorClock.
    const restored = { clocks: new Map<number, number>([[1, 7], [3, 2]]) };
    const out = rehydrateClock(restored);
    expect(out.clocks.get(1)).toBe(7);
    expect(out.clocks.get(3)).toBe(2);
    expect(typeof out.toBytes).toBe("function");
    expect(out.toBytes().length).toBe(2 * 9);
  });
});

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Build a FederatedDTState with a freshly ticked vector clock. */
function makeState(
  auvId: number,
  overrides: Partial<FederatedDTState> = {}
): FederatedDTState {
  const clock = new VectorClock();
  clock.tick(auvId);
  return {
    auvId,
    timestamp: 1_750_000_000 + auvId,
    clock,
    x: 10,
    y: 20,
    z: -15,
    yaw: 1.5,
    positionVariance: 1.0,
    anomalyDetected: false,
    anomalyDimension: 0,
    healthScore: 200,
    missionPhase: 2,
    ...overrides,
  };
}

function doStub() {
  const id = env.FEDERATION_COORDINATOR.idFromName(DO_NAME);
  return env.FEDERATION_COORDINATOR.get(id);
}

/** Seed state via the DO's internal /ingest endpoint (same path the Hono API uses). */
async function seedState(states: FederatedDTState[]): Promise<void> {
  const stub = doStub();
  const resp = await stub.fetch("https://do/ingest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ states, anomalies: [] }),
  });
  expect(resp.status).toBe(200);
}

/** Read the DO's current in-memory fleet state. */
async function getDOState(): Promise<Record<number, FederatedDTState>> {
  const stub = doStub();
  const resp = await stub.fetch("https://do/state");
  const body = (await resp.json()) as { states: Record<string, FederatedDTState> };
  const out: Record<number, FederatedDTState> = {};
  for (const [k, v] of Object.entries(body.states)) out[Number(k)] = v;
  return out;
}

/** Open a WebSocket to the DO as a support vessel. */
async function connectVessel(vesselId: number): Promise<WebSocket> {
  const stub = doStub();
  const resp = await stub.fetch(`https://do/ws?vesselId=${vesselId}`, {
    headers: { Upgrade: "websocket" },
  });
  expect(resp.status).toBe(101);
  const ws = resp.webSocket;
  expect(ws).toBeDefined();
  ws!.accept();
  return ws!;
}

function sendMsg(ws: WebSocket, msg: GossipMessage): void {
  ws.send(JSON.stringify(msg));
}

/** Await the next message on the socket (rejects on timeout). */
function awaitMessage(ws: WebSocket, timeoutMs = 3000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.removeEventListener("message", handler);
      reject(new Error("Timed out waiting for WebSocket message"));
    }, timeoutMs);
    const handler = (ev: MessageEvent) => {
      clearTimeout(timer);
      ws.removeEventListener("message", handler);
      resolve(JSON.parse(ev.data as string));
    };
    ws.addEventListener("message", handler);
  });
}

/** Poll DO state until predicate holds (merges are async, no ack is sent). */
async function waitForState(
  auvId: number,
  predicate: (s: FederatedDTState) => boolean,
  timeoutMs = 3000
): Promise<FederatedDTState> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const states = await getDOState();
    const s = states[auvId];
    if (s && predicate(s)) return s;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error(`Timed out waiting for state of AUV ${auvId}`);
}

// ─── Phase 1 + 2: Merkle root anti-entropy ──────────────────────────────────

describe("Gossip Phase 1+2 — Merkle root comparison", () => {
  it("requests leaves when roots differ and stays silent when they match", async () => {
    const auvId = 101;
    await seedState([makeState(auvId, { timestamp: 1000 })]);

    const ws = await connectVessel(1);
    try {
      // Vessel's view diverges (newer timestamp, different x) → roots differ
      const divergent = makeState(auvId, { timestamp: 2000, x: 99 });
      const vesselTree = await MerkleTree.fromStates([divergent]);
      sendMsg(ws, {
        type: "merkle_root",
        fromAuv: 1,
        root: vesselTree.root,
        nAuvs: 1,
      });

      const resp = (await awaitMessage(ws)) as {
        type: string;
        requestedAuvIds: number[];
      };
      expect(resp.type).toBe("request_leaves");
      expect(resp.requestedAuvIds).toContain(auvId);

      // Vessel's view matches the DO exactly → roots match → no response
      const matching = makeState(auvId, { timestamp: 1000 });
      const matchTree = await MerkleTree.fromStates([matching]);
      sendMsg(ws, {
        type: "merkle_root",
        fromAuv: 1,
        root: matchTree.root,
        nAuvs: 1,
      });
      await expect(awaitMessage(ws, 600)).rejects.toThrow(/Timed out/);
    } finally {
      ws.close();
    }
  });
});

// ─── Phase 2 + 3: Leaf exchange and timestamp-ordered merge ─────────────────

describe("Gossip Phase 2+3 — leaf exchange and state merge", () => {
  it("serves requested leaves and merges newer state, rejecting older", async () => {
    const auvId = 102;
    await seedState([makeState(auvId, { timestamp: 1000, x: 10 })]);

    const ws = await connectVessel(2);
    try {
      // Phase 2: vessel requests leaves from the DO
      sendMsg(ws, { type: "request_leaves", fromAuv: 2, requestedAuvIds: [auvId] });
      const update = (await awaitMessage(ws)) as {
        type: string;
        states: FederatedDTState[];
      };
      expect(update.type).toBe("state_update");
      expect(update.states).toHaveLength(1);
      expect(update.states[0]!.auvId).toBe(auvId);
      expect(update.states[0]!.x).toBe(10);

      // Phase 3: vessel pushes a newer state → DO merges it
      sendMsg(ws, {
        type: "state_update",
        fromAuv: 2,
        states: [makeState(auvId, { timestamp: 2000, x: 77 })],
      });
      const merged = await waitForState(auvId, (s) => s.timestamp === 2000);
      expect(merged.x).toBe(77);

      // Older state (t=1500) must NOT overwrite the newer one
      sendMsg(ws, {
        type: "state_update",
        fromAuv: 2,
        states: [makeState(auvId, { timestamp: 1500, x: 55 })],
      });
      await new Promise((r) => setTimeout(r, 200));
      const still = (await getDOState())[auvId]!;
      expect(still.timestamp).toBe(2000);
      expect(still.x).toBe(77);
    } finally {
      ws.close();
    }
  });
});

// ─── Phase 4: Partition heal + Kalman fusion ────────────────────────────────

describe("Gossip Phase 4 — partition heal with Kalman fusion", () => {
  it("fuses conflicting state via inverse-covariance weighting", async () => {
    const auvId = 103;
    // Local: x=10, σ²=1.0 (high confidence), anomaly detected
    await seedState([
      makeState(auvId, {
        timestamp: 1000,
        x: 10,
        positionVariance: 1.0,
        healthScore: 200,
        batteryPct: 80,
        anomalyDetected: true,
        anomalyDimension: 3,
      }),
    ]);

    const ws = await connectVessel(3);
    try {
      // Remote (reconnecting vessel): x=20, σ²=4.0 (low confidence), healthy
      const remote = makeState(auvId, {
        timestamp: 2000,
        x: 20,
        positionVariance: 4.0,
        healthScore: 150,
        batteryPct: 60,
        anomalyDetected: false,
        anomalyDimension: 0,
      });
      sendMsg(ws, {
        type: "partition_heal",
        fromAuv: 3,
        states: [remote],
        disconnectionDurationS: 60,
      });

      const fused = await waitForState(
        auvId,
        (s) => Math.abs(s.x - 12.0) < 1e-6
      );

      // x_fused = (wL*10 + wR*20) / (wL+wR), wL=1/1.0, wR=1/4.0
      //        = (10 + 5) / 1.25 = 12.0
      expect(fused.x).toBeCloseTo(12.0, 5);
      // σ²_fused = 1 / (wL + wR) = 1 / 1.25 = 0.8
      expect(fused.positionVariance).toBeCloseTo(0.8, 5);

      // Conservative merge rules
      expect(fused.healthScore).toBe(150); // MIN(200, 150)
      expect(fused.batteryPct).toBe(60); // MIN(80, 60) — never overestimate energy
      expect(fused.anomalyDetected).toBe(true); // OR (local had anomaly)
      expect(fused.anomalyDimension).toBe(3); // keep local's dimension
      expect(fused.timestamp).toBe(2000); // MAX
      expect(fused.missionPhase).toBe(remote.missionPhase); // remote wins
    } finally {
      ws.close();
    }
  });
});

// ─── Two-vessel broadcast ───────────────────────────────────────────────────

describe("Gossip — two-vessel broadcast", () => {
  it("broadcasts state to all connected vessels on ingest", async () => {
    const auvId = 104;

    const ws1 = await connectVessel(10);
    const ws2 = await connectVessel(11);
    try {
      const m1 = awaitMessage(ws1);
      const m2 = awaitMessage(ws2);
      await seedState([makeState(auvId, { timestamp: 1000, x: 33 })]);

      const [r1, r2] = await Promise.all([m1, m2]);
      const msg1 = r1 as { type: string; states: FederatedDTState[] };
      const msg2 = r2 as { type: string; states: FederatedDTState[] };
      expect(msg1.type).toBe("state_update");
      expect(msg2.type).toBe("state_update");
      expect(msg1.states.some((s) => s.auvId === auvId && s.x === 33)).toBe(true);
      expect(msg2.states.some((s) => s.auvId === auvId && s.x === 33)).toBe(true);
    } finally {
      ws1.close();
      ws2.close();
    }
  });
});

// ─── Full HTTP proxy path (regression) ──────────────────────────────────────

describe("Gossip — /ws/live HTTP proxy upgrade", () => {
  it("upgrades through the Hono proxy to the DO (pathname + query bug)", async () => {
    const auvId = 105;
    await seedState([makeState(auvId, { timestamp: 1000, x: 42 })]);

    // Regression: the proxy used `url.pathname = "/ws?vesselId=20"` which
    // percent-encodes '?' as %3F → the DO received "/ws%3FvesselId=20" and
    // returned 404. Upgrade must flow through /ws/live and reach the DO.
    const resp = await SELF.fetch("https://test.local/ws/live?vesselId=20", {
      headers: { Upgrade: "websocket" },
    });
    expect(resp.status).toBe(101);
    const ws = resp.webSocket;
    expect(ws).toBeDefined();
    ws!.accept();

    try {
      // Round-trip through the proxy: request the seeded leaf
      sendMsg(ws!, { type: "request_leaves", fromAuv: 20, requestedAuvIds: [auvId] });
      const update = (await awaitMessage(ws!)) as {
        type: string;
        states: FederatedDTState[];
      };
      expect(update.type).toBe("state_update");
      expect(update.states).toHaveLength(1);
      expect(update.states[0]!.auvId).toBe(auvId);
      expect(update.states[0]!.x).toBe(42);
    } finally {
      ws!.close();
    }
  });
});
