#!/usr/bin/env python3
"""
RQ5 Publication Run: Full Empirical ARL₀ Monte Carlo Validation (10,000 runs)

The Siegmund (1985) approximation deviates 20-40% from the true ARL₀ under
realistic (non-Gaussian, non-stationary, multi-dimension) conditions. The
RQ3/RQ5 contract REQUIRES publishing BOTH the theoretical and empirical ARL₀.

This script performs the full 10,000-run Monte Carlo and prints the paper
table values. Run with:
    poetry run python scripts/attacks/validate_arl0_montecarlo.py [--n-runs 10000]

Published values (h=10.5, k=0.5, seed=42):
    Theoretical (Siegmund, per-dim):       36,316
    Empirical (per-dim, 10K runs):         ~67,000   (CI₉₅ ≈ ±800)
    Empirical (7-dim any-alarm, 10K):      ~16,800   (CI₉₅ low > 15,000)
    Detection delay (1.5σ at 0.5 Hz):      ~17s      (target < 120s)

Paper reference: Tanavade, S. (2029) — Section 5.3 + Appendix "Empirical ARL₀"
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent / "src"))

from iort_dt_anomaly.iort_dt_anomaly.detectors import (  # noqa: E402
    ARLBounds,
    CUSUMConfig,
)


def main() -> int:
    parser = argparse.ArgumentParser(description="RQ5 empirical ARL₀ publication run")
    parser.add_argument("--n-runs", type=int, default=10_000, help="Monte Carlo runs")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--h", type=float, default=None, help="threshold (default: CUSUMConfig)")
    args = parser.parse_args()

    config = CUSUMConfig(threshold_h=args.h) if args.h is not None else CUSUMConfig()
    k = config.reference_k
    n = args.n_runs
    seed = args.seed

    print("=" * 68)
    print("RQ5 — Empirical ARL₀ Monte Carlo Validation")
    print(f"Config: h={config.threshold_h}, k={k}, n_runs={n}, seed={seed}")
    print("=" * 68)

    theoretical = config.theoretical_arl0()
    print(f"\nTheoretical ARL₀ (Siegmund, per-dimension): {theoretical:,.0f}")

    # Per-dimension
    t0 = time.time()
    per_dim = ARLBounds.empirical_arl0(config, n_runs=n, n_dims=1, seed=seed)
    print(
        f"\n[1] Empirical ARL₀ (per-dimension, {n:,} runs): "
        f"{per_dim['mean']:,.0f}  (95% CI [{per_dim['ci95_low']:,.0f}, "
        f"{per_dim['ci95_high']:,.0f}], censored {per_dim['censored_runs']})"
    )
    print(f"    Empirical/Theoretical ratio: {per_dim['mean'] / theoretical:.2f}")

    # 7-dimension (deployed fleet metric)
    seven_dim = ARLBounds.empirical_arl0(config, n_runs=n, n_dims=7, seed=seed)
    print(
        f"\n[2] Empirical ARL₀ (7-dim any-alarm, {n:,} runs): "
        f"{seven_dim['mean']:,.0f}  (95% CI [{seven_dim['ci95_low']:,.0f}, "
        f"{seven_dim['ci95_high']:,.0f}], censored {seven_dim['censored_runs']})"
    )
    print(f"    Fleet guarantee ARL₀>10,000: {'✅ PASS' if seven_dim['ci95_low'] > 10_000 else '❌ FAIL'}")

    # Packet-loss sensitivity (per-dim)
    print("\n[3] Packet-loss sensitivity (per-dimension ARL₀):")
    for p in (0.0, 0.3, 0.5, 0.7):
        r = ARLBounds.empirical_arl0(config, n_runs=min(n, 2_000), n_dims=1, p_loss=p, seed=seed)
        print(f"    p_loss={p:.0%}: {r['mean']:,.0f}  CI [{r['ci95_low']:,.0f}, {r['ci95_high']:,.0f}]")

    # Detection delay (must stay < 120s at 0.5 Hz)
    delay_steps = ARLBounds.detection_delay_lorden(1.5, k, config.threshold_h)
    delay_s = delay_steps / 0.5
    print(f"\n[4] Detection delay (1.5σ fault, 0.5 Hz): {delay_s:.1f}s  (target < 120s) "
          f"{'✅' if delay_s < 120 else '❌'}")

    print(f"\nTotal wall time: {time.time() - t0:.1f}s")
    print("\nPublication table:")
    print(f"  Theoretical ARL₀ (Siegmund):            {theoretical:,.0f}")
    print(f"  Empirical ARL₀ per-dim ({n:,} runs):   {per_dim['mean']:,.0f}  "
          f"CI₉₅ [{per_dim['ci95_low']:,.0f}, {per_dim['ci95_high']:,.0f}]")
    print(f"  Empirical ARL₀ 7-dim ({n:,} runs):     {seven_dim['mean']:,.0f}  "
          f"CI₉₅ [{seven_dim['ci95_low']:,.0f}, {seven_dim['ci95_high']:,.0f}]")
    return 0 if seven_dim["ci95_low"] > 10_000 else 1


if __name__ == "__main__":
    sys.exit(main())
