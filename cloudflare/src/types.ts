// IoRT-DT: Shared types for Cloudflare edge infrastructure.
// These interfaces mirror the Rust structs in src/iort_dt_federation/src/lib.rs
// to ensure wire-format compatibility between vessel and cloud.

import type { VectorClock } from "./vector-clock";

// ─── Cloudflare Bindings ────────────────────────────────────────────────────

export interface Env {
  FLEET_DB: D1Database;
  MISSION_STORE: R2Bucket;
  FEDERATION_COORDINATOR: DurableObjectNamespace;
  ENVIRONMENT: string;
  SATELLITE_BANDWIDTH_LIMIT_KBPS: string;
  BATCH_INTERVAL_SECONDS: string;
  /** Allowed CORS origin for the Mission Control frontend. Use "*" only in dev. */
  ALLOWED_ORIGIN: string;
}

// ─── Federation State (mirrors Rust FederatedDTState) ───────────────────────

/** Compressed DT state for federation gossip — 64 bytes max on the wire. */
export interface FederatedDTState {
  auvId: number; // u8: vehicle identifier
  timestamp: number; // f64: Unix timestamp
  clock: VectorClock; // Causality tracking

  // Position in meters (f32 precision, adequate for underwater nav)
  x: number;
  y: number;
  z: number;

  // Heading in radians
  yaw: number;

  // Localization uncertainty for Kalman fusion (sigma^2 in m^2)
  positionVariance: number;

  // Health status
  anomalyDetected: boolean;
  anomalyDimension: number; // 0 = none
  healthScore: number; // 0-255, 255 = perfect

  // Mission state: 0=idle, 1=transit, 2=survey, 3=emergency
  missionPhase: number;
}

// ─── Gossip Protocol (mirrors Rust GossipMessage enum) ──────────────────────
// TypeScript discriminated union with a `type` field replacing Rust's enum tag.

export type GossipMessage =
  | GossipMerkleRoot
  | GossipRequestLeaves
  | GossipStateUpdate
  | GossipPartitionHeal;

/** Phase 1: Announce Merkle root (~32 bytes). Very cheap over acoustic. */
export interface GossipMerkleRoot {
  type: "merkle_root";
  fromAuv: number;
  root: Uint8Array; // 32-byte SHA-256 digest
  nAuvs: number;
}

/** Phase 2: Request specific leaf states when roots differ. */
export interface GossipRequestLeaves {
  type: "request_leaves";
  fromAuv: number;
  requestedAuvIds: number[];
}

/** Phase 3: Provide requested DT states. */
export interface GossipStateUpdate {
  type: "state_update";
  fromAuv: number;
  states: FederatedDTState[];
}

/** Partition heal: "I'm reconnected, here's my local view." */
export interface GossipPartitionHeal {
  type: "partition_heal";
  fromAuv: number;
  states: FederatedDTState[];
  disconnectionDurationS: number;
}

// ─── Wire Format Helpers ────────────────────────────────────────────────────

/** 47-byte AUV state vector matching Python models.py wire format. */
export interface AUVStateVector {
  auvId: number;
  timestamp: number;
  sequence: number;
  poseXMm: number;
  poseYMm: number;
  poseZMm: number;
  rollMdeg: number;
  pitchMdeg: number;
  yawMdeg: number;
  thrusterRpms: number[]; // 6 values
  batteryDv: number; // decivolts
  residuals: number[]; // 3 float16 values
  flags: number;
}

// ─── API Types ──────────────────────────────────────────────────────────────

/** Batch upload from the support vessel's sync engine. */
export interface IngestBatch {
  vesselId: number;
  missionId?: string;
  compressedPayload?: Uint8Array; // zstd-compressed batch
  states: FederatedDTState[];
  anomalies: AnomalyEvent[];
  sentAt: string; // ISO-8601 from vessel clock
}

export interface AnomalyEvent {
  vehicleId: number;
  detectedAt: string;
  detectorType: string;
  confidence: number;
  severity: number;
  dimension: string;
}

export interface FleetStatus {
  vehicles: VehicleStatus[];
  updatedAt: string;
}

export interface VehicleStatus {
  id: number;
  name: string;
  type: "auv" | "usv" | "support";
  status: "online" | "partitioned" | "offline";
  lastSeen: string | null;
  latestState: FederatedDTState | null;
}

export interface Mission {
  id: string;
  name: string;
  status: "planned" | "active" | "completed" | "aborted";
  startedAt: string | null;
  endedAt: string | null;
  rosbagR2Key: string | null;
  metricsR2Key: string | null;
}
