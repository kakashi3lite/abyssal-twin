/**
 * wasmFallback — JS mirror of the Rust-WASM engine algorithms.
 *
 * Honesty contract: when WASM is unavailable, the UI falls back to these
 * exact-math JS implementations (same S⁺/S⁻ recursion, same h=10.5/k=0.5
 * production thresholds) and shows a "JS fallback" badge. The operator's
 * numbers are never fake — only the execution substrate differs.
 */

export interface JsCusumAlert {
  direction: number; // 0=increase, 1=decrease
  direction_label: "increase" | "decrease";
  s_plus: number;
  s_minus: number;
  samples_seen: number;
}

export const PRODUCTION_H = 10.5;
export const PRODUCTION_K = 0.5;

/** CUSUM detector — mirrors src/iort_twin_wasm/src/cusum.rs exactly. */
export class JsCusumDetector {
  s_plus = 0;
  s_minus = 0;
  samples = 0;
  alarms = 0;

  constructor(
    public readonly threshold_h = PRODUCTION_H,
    public readonly reference_k = PRODUCTION_K
  ) {}

  update(z: number): JsCusumAlert | undefined {
    this.s_plus = Math.max(0, this.s_plus + z - this.reference_k);
    this.s_minus = Math.max(0, this.s_minus - z - this.reference_k);
    this.samples += 1;
    if (this.s_plus > this.threshold_h) {
      this.alarms += 1;
      const alert: JsCusumAlert = {
        direction: 0,
        direction_label: "increase",
        s_plus: this.s_plus,
        s_minus: this.s_minus,
        samples_seen: this.samples,
      };
      this.reset();
      return alert;
    }
    if (this.s_minus > this.threshold_h) {
      this.alarms += 1;
      const alert: JsCusumAlert = {
        direction: 1,
        direction_label: "decrease",
        s_plus: this.s_plus,
        s_minus: this.s_minus,
        samples_seen: this.samples,
      };
      this.reset();
      return alert;
    }
    return undefined;
  }

  reset() {
    this.s_plus = 0;
    this.s_minus = 0;
  }
}

/**
 * Variance-proxy z-score — the ONLY continuous signal the SSE stream carries
 * (positionVariance, σ²). We standardize its per-vehicle delta against an EMA
 * baseline and label it "variance proxy" in the UI. This is a legitimate CUSUM
 * on variance *shifts*; it is NOT the fleet-tier residual CUSUM (that runs on
 * the AUV with 7 residual dimensions). The label makes the distinction honest.
 */
export class VarianceProxy {
  private mean = 0;
  private m2 = 0;
  private n = 0;
  private prev = 0;
  private hasPrev = false;

  constructor(private readonly alpha = 0.2) {}

  /** Feed the raw variance value; returns a standardized z-score. */
  next(variance: number): number {
    if (!Number.isFinite(variance)) return 0;
    // EMA-based rolling mean/std (Welford-style decayed).
    this.mean = this.alpha * variance + (1 - this.alpha) * this.mean;
    this.m2 = this.alpha * (variance - this.mean) ** 2 + (1 - this.alpha) * this.m2;
    this.n += 1;
    const std = Math.sqrt(this.m2 + 1e-12);
    let z = 0;
    if (this.hasPrev && std > 1e-9) {
      z = (variance - this.prev) / std;
    }
    this.prev = variance;
    this.hasPrev = true;
    return z;
  }
}
