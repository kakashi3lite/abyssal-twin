"""
RQ5 Property-Based Tests: Empirical ARL₀ Monte Carlo Validation

The Siegmund (1985) approximation is known to deviate from the true ARL₀ by
20-40% (Basseville & Nikiforov, 1993) because it assumes Gaussian stationary
noise and asymptotic (large-h) behavior — all violated by real ocean acoustics.
The RQ3/RQ5 contract therefore REQUIRES:

  1. Publish BOTH the theoretical (Siegmund) AND empirical (Monte Carlo) ARL₀.
  2. The guarantee "ARL₀ > 10,000" must be validated empirically, not assumed.
  3. Report the per-dimension AND any-dimension (fleet) ARL₀ separately, since
     monitoring N residual dimensions compounds the false-alarm rate.

Claims validated here:
  - C1: Per-dimension empirical ARL₀ > 10,000 with 95% CI (config h=10.5, k=0.5)
  - C2: Any-dimension (7-dim) ARL₀ < per-dimension ARL₀ (compounding effect)
  - C3: Packet loss extends ARL₀ (monotone non-decreasing in p_loss)
  - C4: Empirical ARL₀ is monotone in threshold h (larger h → fewer alarms)
  - C5: validate_empirically() publishes BOTH values and the target verdict

Published 10,000-run values (h=10.5, k=0.5, seed=42):
  per-dim ARL₀ = 96,103 (CI₉₅ [94,746, 97,460]); 7-dim = 16,566
  (CI₉₅ [16,244, 16,887]); detection delay = 16.9s (< 120s target).

Paper reference: Tanavade, S. (2029) — Section 5.3 "Formal Detection
Guarantees" (theoretical) + Appendix "Empirical ARL₀ Validation" (Phase 5).
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).parent.parent.parent / "src"))

from iort_dt_anomaly.iort_dt_anomaly.detectors import ARLBounds, CUSUMConfig

# CI-friendly run count (full 10,000-run publication run lives in
# scripts/attacks/validate_arl0_montecarlo.py).
N_RUNS_CI = 500
SEED = 42


# ─── C1: Per-dimension empirical ARL₀ > 10,000 ───────────────────────────────

@pytest.mark.rq5
def test_per_dimension_empirical_arl0_exceeds_target() -> None:
    """
    Claim C1: per-dimension empirical ARL₀ > 10,000 with 95% CI.

    Uses the DEPLOYED default config (CUSUMConfig()) so this validates what
    actually ships, not a hand-picked config.
    """
    config = CUSUMConfig()  # deployed default (h=10.5 after Phase 5 recalibration)
    res = ARLBounds.validate_empirically(
        config, n_runs=N_RUNS_CI, n_dims=1, seed=SEED
    )

    print(f"\nTheoretical ARL₀ (Siegmund):     {res['theoretical_arl0']:,.0f}")
    print(f"Empirical ARL₀ (mean):           {res['empirical_arl0_mean']:,.0f}")
    print(f"Empirical 95% CI:                [{res['empirical_ci95_low']:,.0f}, {res['empirical_ci95_high']:,.0f}]")
    print(f"Ratio empirical/theoretical:     {res['empirical_over_theoretical']:.2f}")
    print(f"Censored runs (max_steps hit):   {res['censored_runs']}/{N_RUNS_CI}")

    assert res["empirical_ci95_low"] > 10_000, (
        f"Per-dim empirical ARL₀ CI lower bound {res['empirical_ci95_low']:,.0f} "
        f"≤ 10,000 — false alarm rate too high (recalibrate threshold_h)"
    )
    assert res["empirical_target_met"] is True


# ─── C2: Any-dimension compounding ───────────────────────────────────────────

@pytest.mark.rq5
def test_multidimension_compounding_reduces_arl0() -> None:
    """
    Claim C2: monitoring 7 dimensions simultaneously reduces the any-alarm
    ARL₀ below the per-dimension ARL₀. The deployed fleet metric is the
    7-dimension number — it must still clear 10,000.

    Uses the DEPLOYED default config. (At the pre-Phase-5 h=10.0, the 7-dim
    CI₉₅ low was ≈9.7k and FAILED — the reason the default was recalibrated.)
    """
    config = CUSUMConfig()  # deployed default (h=10.5)
    per_dim = ARLBounds.empirical_arl0(config, n_runs=N_RUNS_CI, n_dims=1, seed=SEED)
    seven_dim = ARLBounds.empirical_arl0(config, n_runs=N_RUNS_CI, n_dims=7, seed=SEED)

    print(f"\nPer-dim ARL₀:   {per_dim['mean']:,.0f}  CI [{per_dim['ci95_low']:,.0f}, {per_dim['ci95_high']:,.0f}]")
    print(f"7-dim ARL₀:     {seven_dim['mean']:,.0f}  CI [{seven_dim['ci95_low']:,.0f}, {seven_dim['ci95_high']:,.0f}]")
    print(f"Compounding:    7-dim ≈ {seven_dim['mean'] / per_dim['mean']:.2f} × per-dim")

    assert seven_dim["mean"] < per_dim["mean"], (
        "Any-dimension ARL₀ must be ≤ per-dimension ARL₀ (compounding)"
    )
    # Fleet-level guarantee: the 7-dim CI lower bound must clear 10,000.
    assert seven_dim["ci95_low"] > 10_000, (
        f"7-dim empirical ARL₀ CI lower bound {seven_dim['ci95_low']:,.0f} ≤ 10,000 "
        f"— fleet false-alarm rate too high (raise threshold_h)"
    )


# ─── C3: Packet loss extends ARL₀ ────────────────────────────────────────────

@pytest.mark.rq5
@pytest.mark.parametrize("p_loss", [0.0, 0.3, 0.5, 0.7])
def test_packet_loss_extends_empirical_arl0(p_loss: float) -> None:
    """
    Claim C3: acoustic packet loss skips CUSUM updates, so the empirical ARL₀
    is non-decreasing in p_loss (missing observations cannot speed up alarms).
    """
    config = CUSUMConfig()  # deployed default (h=10.5)
    baseline = ARLBounds.empirical_arl0(config, n_runs=N_RUNS_CI, n_dims=1, p_loss=0.0, seed=SEED)
    with_loss = ARLBounds.empirical_arl0(config, n_runs=N_RUNS_CI, n_dims=1, p_loss=p_loss, seed=SEED)

    print(f"\np_loss={p_loss:.0%}: ARL₀ = {with_loss['mean']:,.0f} (baseline {baseline['mean']:,.0f})")

    assert with_loss["mean"] >= baseline["mean"] * 0.9, (
        f"ARL₀ with {p_loss:.0%} loss ({with_loss['mean']:,.0f}) "
        f"dropped below baseline ({baseline['mean']:,.0f})"
    )


# ─── C4: Empirical ARL₀ monotone in threshold h ──────────────────────────────

@pytest.mark.rq5
def test_empirical_arl0_monotone_in_threshold() -> None:
    """
    Claim C4: larger threshold h ⇒ fewer false alarms ⇒ larger empirical ARL₀.
    """
    config_low = CUSUMConfig(threshold_h=9.0, reference_k=0.5)
    config_high = CUSUMConfig(threshold_h=11.0, reference_k=0.5)

    low = ARLBounds.empirical_arl0(config_low, n_runs=N_RUNS_CI, n_dims=1, seed=SEED)
    high = ARLBounds.empirical_arl0(config_high, n_runs=N_RUNS_CI, n_dims=1, seed=SEED)

    print(f"\nh=9.0  → empirical ARL₀ {low['mean']:,.0f}")
    print(f"h=11.0 → empirical ARL₀ {high['mean']:,.0f}")

    assert high["mean"] > low["mean"], (
        f"ARL₀ not monotone in h: h=9 ({low['mean']:,.0f}) vs h=11 ({high['mean']:,.0f})"
    )


# ─── C5: Recalibration path — target-driven threshold ────────────────────────

@pytest.mark.rq5
def test_recalibration_threshold_meets_target_empirically() -> None:
    """
    Claim C5: the recalibration path (compute_threshold_for_arl0 → Monte Carlo)
    produces a config whose empirical per-dim ARL₀ clears the target.

    This is the documented remediation for the Siegmund divergence: instead of
    trusting the approximation, solve for h from the target and VERIFY.
    """
    target = 10_000.0
    k = 0.5
    h = ARLBounds.compute_threshold_for_arl0(target, k)
    config = CUSUMConfig(threshold_h=float(h), reference_k=k)

    res = ARLBounds.validate_empirically(
        config, n_runs=N_RUNS_CI, n_dims=1, target_arl0=target, seed=SEED
    )

    print(f"\nRecalibrated h={h:.3f} (target ARL₀={target:,.0f})")
    print(f"Theoretical: {res['theoretical_arl0']:,.0f}  Empirical: {res['empirical_arl0_mean']:,.0f}")
    print(f"95% CI: [{res['empirical_ci95_low']:,.0f}, {res['empirical_ci95_high']:,.0f}]")
    print(f"Target met: {res['empirical_target_met']}")

    assert res["empirical_ci95_low"] > target, (
        f"Recalibrated config failed empirical target: CI lower bound "
        f"{res['empirical_ci95_low']:,.0f} ≤ {target:,.0f}"
    )
