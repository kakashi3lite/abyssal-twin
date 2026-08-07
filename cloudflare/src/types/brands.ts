/**
 * Branded Types - Zero-Cost Safety
 * 
 * These types prevent mixing incompatible primitives at compile time.
 * They have zero runtime overhead (just type assertions).
 */

declare const __brand: unique symbol;

export type Brand<T, B> = T & { readonly [__brand]: B };

// ============================================================================
// Fleet Identifiers (prevent mixing vehicle/mission IDs)
// ============================================================================

/** Unique identifier for an AUV in the fleet (uint32) */
export type VehicleId = Brand<number, 'VehicleId'>;

/** Mission identifier (kebab-case string, 1-64 chars) */
export type MissionId = Brand<string, 'MissionId'>;

/** Fleet epoch timestamp (milliseconds since fleet start) */
export type FleetEpoch = Brand<number, 'FleetEpoch'>;

/** Session identifier for WebSocket connections */
export type SessionId = Brand<string, 'SessionId'>;

// ============================================================================
// Data Types (ensure compression/decompression tracking)
// ============================================================================

/** Compressed AUV state (47-byte wire format) */
export type CompressedState = Brand<Uint8Array, 'CompressedState'>;

/** Decompressed pose data (6-DOF) */
export type DecompressedPose = Brand<Float64Array, 'DecompressedPose'>;

/** Merkle tree root hash (32 bytes) */
export type MerkleRoot = Brand<Uint8Array, 'MerkleRoot'>;

/** Vector clock for causal ordering */
export type VectorClock = Brand<Map<VehicleId, number>, 'VectorClock'>;

// ============================================================================
// Network Types (Durable Object handles)
// ============================================================================

/** Cloudflare Durable Object ID */
export type DurableObjectId = Brand<string, 'DurableObjectId'>;

/** WebSocket session identifier */
export type WebSocketSessionId = Brand<string, 'WebSocketSessionId'>;

/** Colo (datacenter) identifier */
export type ColoId = Brand<string, 'ColoId'>;

/** Request ID for tracing */
export type RequestId = Brand<string, 'RequestId'>;

// ============================================================================
// Time Types (prevent mixing milliseconds/seconds/nanoseconds)
// ============================================================================

/** Unix timestamp in milliseconds */
export type UnixMillis = Brand<number, 'UnixMillis'>;

/** Unix timestamp in seconds */
export type UnixSeconds = Brand<number, 'UnixSeconds'>;

/** Duration in milliseconds */
export type DurationMillis = Brand<number, 'DurationMillis'>;

/** Acoustic propagation time estimate */
export type PropagationTime = Brand<number, 'PropagationTime'>;

// ============================================================================
// Validator Functions with Narrowing
// ============================================================================

export const VehicleId = {
  create(id: number): VehicleId {
    if (!Number.isInteger(id) || id < 0 || id > 0xFFFFFFFF) {
      throw new TypeError(`Invalid VehicleId: ${id}. Must be uint32.`);
    }
    return id as VehicleId;
  },
  
  /** Runtime brand check with TypeScript narrowing */
  is(value: unknown): value is VehicleId {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 0xFFFFFFFF;
  },
  
  /** Unsafe cast - only use when certain */
  unsafe(id: number): VehicleId {
    return id as VehicleId;
  }
};

export const MissionId = {
  create(id: string): MissionId {
    if (!/^[a-z0-9-]{1,64}$/.test(id)) {
      throw new TypeError(`Invalid MissionId: ${id}. Must be kebab-case, 1-64 chars.`);
    }
    return id as MissionId;
  },
  
  is(value: unknown): value is MissionId {
    return typeof value === 'string' && /^[a-z0-9-]{1,64}$/.test(value);
  },
  
  unsafe(id: string): MissionId {
    return id as MissionId;
  }
};

export const FleetEpoch = {
  create(ms: number): FleetEpoch {
    if (!Number.isFinite(ms) || ms < 0) {
      throw new TypeError(`Invalid FleetEpoch: ${ms}. Must be non-negative number.`);
    }
    return ms as FleetEpoch;
  },
  
  now(): FleetEpoch {
    return Date.now() as FleetEpoch;
  },
  
  is(value: unknown): value is FleetEpoch {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0;
  }
};

export const SessionId = {
  create(): SessionId {
    // Generate crypto-random session ID
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    const id = Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
    return id as SessionId;
  },
  
  is(value: unknown): value is SessionId {
    return typeof value === 'string' && /^[a-f0-9]{32}$/.test(value);
  }
};

export const CompressedState = {
  create(data: Uint8Array): CompressedState {
    if (data.length !== 47) {
      throw new TypeError(`Invalid CompressedState: ${data.length} bytes. Expected 47 bytes.`);
    }
    return data as CompressedState;
  },
  
  is(value: unknown): value is CompressedState {
    return value instanceof Uint8Array && value.length === 47;
  }
};

export const UnixMillis = {
  now(): UnixMillis {
    return Date.now() as UnixMillis;
  },
  
  fromSeconds(seconds: UnixSeconds): UnixMillis {
    return (seconds * 1000) as UnixMillis;
  },
  
  is(value: unknown): value is UnixMillis {
    return typeof value === 'number' && Number.isFinite(value);
  }
};

export const DurationMillis = {
  fromSeconds(seconds: number): DurationMillis {
    return (seconds * 1000) as DurationMillis;
  },
  
  fromMinutes(minutes: number): DurationMillis {
    return (minutes * 60 * 1000) as DurationMillis;
  },
  
  is(value: unknown): value is DurationMillis {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0;
  }
};
