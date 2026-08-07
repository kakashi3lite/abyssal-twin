// IoRT-DT: Vector Clock for causality tracking across the AUV fleet.
// Port of Rust VectorClock from src/iort_dt_federation/src/lib.rs (lines 36-78).
// Each AUV maintains a logical clock that increments on state updates.

/** Maps auv_id -> logical time. Mirrors Rust HashMap<u8, u64>. */
export class VectorClock {
  public clocks: Map<number, number>;

  constructor(clocks?: Map<number, number>) {
    this.clocks = clocks ?? new Map();
  }

  /** Increment the clock for a given AUV. */
  tick(auvId: number): void {
    const current = this.clocks.get(auvId) ?? 0;
    this.clocks.set(auvId, current + 1);
  }

  /** Merge with another vector clock (component-wise maximum). */
  merge(other: VectorClock): void {
    for (const [auvId, remoteTime] of other.clocks) {
      const localTime = this.clocks.get(auvId) ?? 0;
      this.clocks.set(auvId, Math.max(localTime, remoteTime));
    }
  }

  /**
   * Causality ordering: returns true if this clock strictly happens-before other.
   * All local entries must be <= corresponding other entries, and clocks must differ.
   */
  happensBefore(other: VectorClock): boolean {
    if (this.equals(other)) return false;

    for (const [id, t] of this.clocks) {
      if (t > (other.clocks.get(id) ?? 0)) return false;
    }
    return true;
  }

  /** Deep equality check. */
  equals(other: VectorClock): boolean {
    if (this.clocks.size !== other.clocks.size) return false;
    for (const [id, t] of this.clocks) {
      if (other.clocks.get(id) !== t) return false;
    }
    return true;
  }

  /** Serialize to a compact JSON-friendly format for storage / wire. */
  toJSON(): Record<string, number> {
    const obj: Record<string, number> = {};
    for (const [id, t] of this.clocks) {
      obj[String(id)] = t;
    }
    return obj;
  }

  /** Deserialize from the JSON format produced by toJSON(). */
  static fromJSON(obj: Record<string, number>): VectorClock {
    const clocks = new Map<number, number>();
    for (const [key, value] of Object.entries(obj)) {
      clocks.set(Number(key), value);
    }
    return new VectorClock(clocks);
  }

  /** Serialize to bytes for Merkle tree hashing (deterministic key order). */
  toBytes(): Uint8Array {
    const sorted = [...this.clocks.entries()].sort((a, b) => a[0] - b[0]);
    // Each entry: 1 byte auv_id + 8 bytes uint64 (as float64 for JS compat)
    const buf = new ArrayBuffer(sorted.length * 9);
    const view = new DataView(buf);
    let offset = 0;
    for (const [auvId, time] of sorted) {
      view.setUint8(offset, auvId);
      // Store as float64 since JS numbers are f64 (safe for integers < 2^53)
      view.setFloat64(offset + 1, time, true);
      offset += 9;
    }
    return new Uint8Array(buf);
  }
}
