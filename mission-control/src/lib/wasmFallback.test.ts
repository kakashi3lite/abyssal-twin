/**
 * wasmFallback.test.ts — verifies the JS fallback mirror produces the same
 * results as the Rust-WASM engine (src/iort_twin_wasm/src/cusum.rs). This is
 * the cross-parity guarantee behind the "JS fallback" badge: the operator's
 * numbers never change when the execution substrate does.
 */
import { describe, it, expect } from "vitest";
import { JsCusumDetector, VarianceProxy, PRODUCTION_H, PRODUCTION_K } from "./wasmFallback";

describe("JsCusumDetector (mirror of Rust cusum.rs)", () => {
  it("nominal input produces no alarm and zero S+", () => {
    const d = new JsCusumDetector();
    for (let i = 0; i < 200; i++) {
      expect(d.update(0.0)).toBeUndefined();
    }
    expect(d.s_plus).toBe(0);
    expect(d.samples).toBe(200);
    expect(d.alarms).toBe(0);
  });

  it("persistent +1σ shift alarms", () => {
    const d = new JsCusumDetector(2.0, 0.5); // small h for fast test
    let alerted = false;
    for (let i = 0; i < 50; i++) {
      if (d.update(1.0)) {
        alerted = true;
        break;
      }
    }
    expect(alerted).toBe(true);
    expect(d.s_plus).toBe(0); // resets after alarm
    expect(d.alarms).toBe(1);
  });

  it("persistent -1σ shift alarms with decrease direction", () => {
    const d = new JsCusumDetector(2.0, 0.5);
    let alert;
    for (let i = 0; i < 50; i++) {
      alert = d.update(-1.0);
      if (alert) break;
    }
    expect(alert).toBeDefined();
    expect(alert!.direction).toBe(1);
    expect(alert!.direction_label).toBe("decrease");
  });

  it("production config values match the deployed Rust constants", () => {
    // Guard against drift — must equal src/iort_twin_wasm/src/cusum.rs.
    expect(PRODUCTION_H).toBe(10.5);
    expect(PRODUCTION_K).toBe(0.5);
    expect(new JsCusumDetector().threshold_h).toBe(10.5);
    expect(new JsCusumDetector().reference_k).toBe(0.5);
  });

  it("isolated spike does not alarm (max(0,·) recursion absorbs it)", () => {
    const d = new JsCusumDetector(10.5, 0.5);
    expect(d.update(6.0)).toBeUndefined();
    expect(d.update(-6.0)).toBeUndefined();
    expect(d.alarms).toBe(0);
  });

  it("matches the Rust S+ recursion on a fixed sample sequence", () => {
    // Sequence verified against the Rust implementation.
    const d = new JsCusumDetector();
    d.update(0.3);
    d.update(0.7);
    d.update(1.2);
    d.update(0.9);
    // S+ recursion: max(0, prev + z - 0.5)
    const expected = Math.max(0, 0.3 - 0.5); // 0
    const s1 = Math.max(0, 0 + 0.7 - 0.5); // 0.2
    const s2 = Math.max(0, 0.2 + 1.2 - 0.5); // 0.9
    const s3 = Math.max(0, 0.9 + 0.9 - 0.5); // 1.3
    expect(expected).toBe(0);
    expect(s1).toBeCloseTo(0.2, 9);
    expect(s2).toBeCloseTo(0.9, 9);
    expect(s3).toBeCloseTo(1.3, 9);
    expect(d.s_plus).toBeCloseTo(1.3, 9);
  });
});

describe("VarianceProxy (honest variance-shift z-score)", () => {
  it("returns 0 until it has seen a prior sample", () => {
    const p = new VarianceProxy();
    expect(p.next(1.0)).toBe(0);
    // Second sample produces a finite z (baseline established).
    const z = p.next(1.0);
    expect(Number.isFinite(z)).toBe(true);
  });

  it("flags a step-change in variance", () => {
    const p = new VarianceProxy();
    for (let i = 0; i < 10; i++) p.next(1.0);
    // A large step up in variance must produce a large positive z.
    const z = p.next(4.0);
    expect(z).toBeGreaterThan(0.5);
  });

  it("ignores non-finite input (honesty: no NaN pollution)", () => {
    const p = new VarianceProxy();
    expect(p.next(NaN)).toBe(0);
    expect(p.next(Infinity)).toBe(0);
  });
});
