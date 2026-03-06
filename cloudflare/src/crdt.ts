// IoRT-DT: CRDT implementations for partition-tolerant fleet state sync.
// Research extension of RQ2 — proves gossip-based federation scales to cloud-edge.
//
// CRDT types:
//   LWWRegister<T>  — Last-Write-Wins for vehicle registration (timestamp-based)
//   MVRegister<T>   — Multi-Value for position state (concurrent updates during partition)
//   GCounter        — Grow-only counter
//   PNCounter       — Positive-Negative counter for anomaly counts
//   PoseCRDT        — Position + covariance with Kalman-weighted fusion

// ─── LWW-Register ───────────────────────────────────────────────────────────
// Resolves concurrent writes by keeping the one with the highest timestamp.
// Used for scalar fields like vehicle status, mission phase.

export class LWWRegister<T> {
  constructor(
    public value: T,
    public timestamp: number,
    public source: string
  ) {}

  /** Merge: keep the value with the higher timestamp. */
  merge(other: LWWRegister<T>): LWWRegister<T> {
    if (other.timestamp > this.timestamp) {
      return new LWWRegister(other.value, other.timestamp, other.source);
    }
    if (other.timestamp === this.timestamp && other.source > this.source) {
      // Tie-break by source ID (deterministic)
      return new LWWRegister(other.value, other.timestamp, other.source);
    }
    return this;
  }

  toJSON(): { value: T; timestamp: number; source: string } {
    return { value: this.value, timestamp: this.timestamp, source: this.source };
  }

  static fromJSON<T>(obj: { value: T; timestamp: number; source: string }): LWWRegister<T> {
    return new LWWRegister(obj.value, obj.timestamp, obj.source);
  }
}

// ─── MV-Register (Multi-Value) ──────────────────────────────────────────────
// Keeps ALL concurrent values until explicitly resolved.
// Used for position state during network partitions where multiple nodes
// update the same AUV's estimated position independently.

export interface MVEntry<T> {
  value: T;
  clock: Record<string, number>; // vector clock snapshot
  source: string;
}

export class MVRegister<T> {
  constructor(public entries: MVEntry<T>[]) {}

  /** Add a new value with the current vector clock. */
  set(value: T, clock: Record<string, number>, source: string): MVRegister<T> {
    // Remove entries dominated by this new clock
    const surviving = this.entries.filter(
      (e) => !isDominated(e.clock, clock)
    );
    surviving.push({ value, clock: { ...clock }, source });
    return new MVRegister(surviving);
  }

  /** Merge two MV-Registers: union of non-dominated entries. */
  merge(other: MVRegister<T>): MVRegister<T> {
    const all = [...this.entries, ...other.entries];

    // Remove dominated entries
    const surviving = all.filter((entry) =>
      !all.some(
        (other) =>
          other !== entry && isDominated(entry.clock, other.clock)
      )
    );

    // Deduplicate by source + clock
    const seen = new Set<string>();
    const unique = surviving.filter((e) => {
      const key = `${e.source}:${JSON.stringify(e.clock)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return new MVRegister(unique);
  }

  /** Resolve concurrent values — for positions, use Kalman fusion. */
  resolve(fuseFn: (entries: MVEntry<T>[]) => T): T {
    if (this.entries.length === 1) return this.entries[0]!.value;
    return fuseFn(this.entries);
  }

  toJSON(): MVEntry<T>[] {
    return this.entries;
  }
}

// ─── G-Counter (Grow-only) ──────────────────────────────────────────────────
// Each node has its own counter slot. Total = sum of all slots.
// Monotonically increasing — useful for tracking total events.

export class GCounter {
  constructor(public counts: Map<string, number> = new Map()) {}

  /** Increment this node's counter. */
  increment(nodeId: string, amount: number = 1): void {
    const current = this.counts.get(nodeId) ?? 0;
    this.counts.set(nodeId, current + amount);
  }

  /** Total count across all nodes. */
  value(): number {
    let total = 0;
    for (const count of this.counts.values()) {
      total += count;
    }
    return total;
  }

  /** Merge: take component-wise maximum. */
  merge(other: GCounter): GCounter {
    const merged = new Map(this.counts);
    for (const [nodeId, count] of other.counts) {
      merged.set(nodeId, Math.max(merged.get(nodeId) ?? 0, count));
    }
    return new GCounter(merged);
  }

  toJSON(): Record<string, number> {
    const obj: Record<string, number> = {};
    for (const [k, v] of this.counts) obj[k] = v;
    return obj;
  }

  static fromJSON(obj: Record<string, number>): GCounter {
    return new GCounter(new Map(Object.entries(obj)));
  }
}

// ─── PN-Counter (Positive-Negative) ─────────────────────────────────────────
// Supports both increment and decrement via two G-Counters.
// Used for tracking anomaly counts (acknowledged anomalies decrement).

export class PNCounter {
  constructor(
    public positive: GCounter = new GCounter(),
    public negative: GCounter = new GCounter()
  ) {}

  increment(nodeId: string, amount: number = 1): void {
    this.positive.increment(nodeId, amount);
  }

  decrement(nodeId: string, amount: number = 1): void {
    this.negative.increment(nodeId, amount);
  }

  value(): number {
    return this.positive.value() - this.negative.value();
  }

  merge(other: PNCounter): PNCounter {
    return new PNCounter(
      this.positive.merge(other.positive),
      this.negative.merge(other.negative)
    );
  }

  toJSON(): { positive: Record<string, number>; negative: Record<string, number> } {
    return {
      positive: this.positive.toJSON(),
      negative: this.negative.toJSON(),
    };
  }

  static fromJSON(obj: {
    positive: Record<string, number>;
    negative: Record<string, number>;
  }): PNCounter {
    return new PNCounter(
      GCounter.fromJSON(obj.positive),
      GCounter.fromJSON(obj.negative)
    );
  }
}

// ─── PoseCRDT ───────────────────────────────────────────────────────────────
// Position + covariance CRDT with Kalman-weighted fusion for resolution.
// Extends MVRegister specifically for underwater vehicle pose estimation.

export interface PoseValue {
  x: number;
  y: number;
  z: number;
  yaw: number;
  positionVariance: number;
  timestamp: number;
  source: "auv" | "support" | "cloud";
}

export class PoseCRDT {
  private register: MVRegister<PoseValue>;

  constructor(entries?: MVEntry<PoseValue>[]) {
    this.register = new MVRegister(entries ?? []);
  }

  /** Update pose from a specific source. */
  update(
    pose: PoseValue,
    clock: Record<string, number>,
    source: string
  ): PoseCRDT {
    const newReg = this.register.set(pose, clock, source);
    return new PoseCRDT(newReg.entries);
  }

  /** Merge with another PoseCRDT. */
  merge(other: PoseCRDT): PoseCRDT {
    const merged = this.register.merge(other.register);
    return new PoseCRDT(merged.entries);
  }

  /**
   * Resolve concurrent poses using inverse-covariance (Kalman) weighting.
   * Mirrors Rust kalman_reconcile() from lib.rs lines 313-360.
   *
   * x_fused = (sum(w_i * x_i)) / (sum(w_i))
   * w_i = 1 / (sigma^2_i + epsilon)
   */
  resolve(): PoseValue {
    if (this.register.entries.length === 0) {
      return {
        x: 0, y: 0, z: 0, yaw: 0,
        positionVariance: Infinity,
        timestamp: 0,
        source: "cloud",
      };
    }

    return this.register.resolve((entries) => {
      const EPSILON = 1e-10;
      let wTotal = 0;
      let xSum = 0, ySum = 0, zSum = 0, yawSum = 0;
      let maxTimestamp = 0;

      for (const entry of entries) {
        const w = 1.0 / (entry.value.positionVariance + EPSILON);
        wTotal += w;
        xSum += w * entry.value.x;
        ySum += w * entry.value.y;
        zSum += w * entry.value.z;
        yawSum += w * entry.value.yaw;
        maxTimestamp = Math.max(maxTimestamp, entry.value.timestamp);
      }

      return {
        x: xSum / wTotal,
        y: ySum / wTotal,
        z: zSum / wTotal,
        yaw: yawSum / wTotal,
        positionVariance: 1.0 / wTotal,
        timestamp: maxTimestamp,
        source: "cloud",
      };
    });
  }

  toJSON(): MVEntry<PoseValue>[] {
    return this.register.toJSON();
  }
}

// ─── Utilities ──────────────────────────────────────────────────────────────

/** Check if clock A is dominated by clock B (A <= B and A != B). */
function isDominated(
  a: Record<string, number>,
  b: Record<string, number>
): boolean {
  let dominated = true;
  let equal = true;

  for (const key of Object.keys(a)) {
    const aVal = a[key] ?? 0;
    const bVal = b[key] ?? 0;
    if (aVal > bVal) return false;
    if (aVal < bVal) equal = false;
  }

  // Check keys in B that aren't in A
  for (const key of Object.keys(b)) {
    if (!(key in a) && (b[key] ?? 0) > 0) {
      equal = false;
    }
  }

  return dominated && !equal;
}
