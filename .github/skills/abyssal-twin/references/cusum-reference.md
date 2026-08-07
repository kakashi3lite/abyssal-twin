# CUSUM Anomaly Detection — Algorithm & Validation Reference

## Algorithm Definition

The CUSUM (Cumulative Sum) detector monitors DT residuals for mean shifts. A residual: $r(t) = x_{physical}(t) - x_{digital\_twin}(t)$. Under nominal conditions, $r(t) \sim \mathcal{N}(\mu_0, \sigma_0)$. A fault causes a shift: $\mu_0 \rightarrow \mu_0 + \delta$.

### Decision Statistics

$$S^+(t) = \max(0, S^+(t-1) + z(t) - k)$$
$$S^-(t) = \max(0, S^-(t-1) - z(t) - k)$$

Where:
- $z(t)$ = standardized residual (z-score from NominalDistribution)
- $k$ = reference value (typically 0.5, half the expected shift in sigma units)
- $h$ = decision threshold (determines ARL₀)

**Alarm**: $S^+(t) > h$ (positive shift) or $S^-(t) > h$ (negative shift)

### Parameters

| Parameter | Value | Rationale |
|---|---|---|
| `threshold_h` | 10.5 (Phase 5 recalibrated) | Empirical 7-dim ARL₀ CI₉₅ low > 10,000; per-dim theoretical ≈ 36,316 |
| `reference_k` | 0.5 | Half the expected 1σ shift |
| `min_detectable_shift` | 1.0σ | Matches thruster degradation profile |

> **Phase 5 (2026-08-08):** the pre-recalibration default was `h=10.0` (per-dim
> theoretical ARL₀ ≈ 22,026). Monte Carlo (10K runs) showed the **7-dimension
> any-alarm** ARL₀ — the deployed fleet metric — had 95% CI lower bound
> **≈9.7k, FAILING the >10,000 guarantee** under multi-dimension compounding
> (the Siegmund divergence the reference mandates checking). Recalibrated to
> `h=10.5`: empirical 7-dim ARL₀ ≈ 16,842 (CI₉₅ low 15,996), detection delay
> ≈17s at 1.5σ/0.5Hz (still far under the 120s target). See
> `tests/property/test_rq5_empirical_arl0.py` and
> `scripts/attacks/validate_arl0_montecarlo.py`.

### Implementation

File: `src/iort_dt_anomaly/iort_dt_anomaly/detectors.py`

```python
class CUSUMDetector:
    def update(self, z_score: float) -> Optional[AnomalyAlert]:
        self.s_plus = max(0.0, self.s_plus + z_score - self.config.reference_k)
        self.s_minus = max(0.0, self.s_minus - z_score - self.config.reference_k)
        if self.s_plus > self.config.threshold_h:
            self.reset()
            return AnomalyAlert(direction="increase", ...)
        if self.s_minus > self.config.threshold_h:
            self.reset()
            return AnomalyAlert(direction="decrease", ...)
        return None
```

## ARL₀ Calculation — THE CRITICAL CAVEAT

### Siegmund Approximation (Theoretical)

$$\text{ARL}_0 \approx \frac{e^{2kh} - 1}{2k^2} - \frac{h}{k}$$

For $k=0.5$, $h=10.5$: $\text{ARL}_0 \approx 36,316$ (per-dimension)

### Empirical Reality (Phase 5 — Monte Carlo validated)

**The Siegmund approximation deviates from the true ARL₀ (documented 20-40%, Basseville & Nikiforov, 1993).** The approximation assumes:
1. Gaussian noise with known parameters
2. Stationary process
3. Asymptotic behavior (large h)

Real ocean acoustics violate ALL three assumptions. The codebase's `ARLBounds` class extends these bounds for Markovian packet loss:

$$\text{ARL}_0^{\text{loss}} \approx \frac{\text{ARL}_0^{\text{nominal}}}{1 - p_{\text{loss}}}$$

**Measured values (h=10.5, k=0.5, 10,000 Monte Carlo runs, seed=42):**

| Metric | Theoretical (Siegmund) | Empirical (Monte Carlo) |
|---|---|---|
| Per-dimension ARL₀ | 36,316 | 96,103 (CI₉₅ [94,746, 97,460]) |
| 7-dim any-alarm ARL₀ | (n/a) | 16,566 (CI₉₅ [16,244, 16,887]) |
| Detection delay (1.5σ, 0.5Hz) | <120s target | 16.9s |
| ARL₀ @ 30% packet loss | (n/a) | 114,664 |
| ARL₀ @ 70% packet loss | (n/a) | 157,128 |

**Key finding:** monitoring 7 residual dimensions compounds the any-alarm
false-alarm rate (~0.17× per-dim). At the old `h=10.0` this dropped the 7-dim
CI₉₅ low below 10,000 — the guarantee FAILED empirically. The threshold was
recalibrated to `h=10.5` so the deployed detector clears the target with margin.

### Correct Validation Procedure

```python
from iort_dt_anomaly.detectors import ARLBounds

# Step 1: Compute theoretical threshold
h = ARLBounds.compute_threshold_for_arl0(target_arl0=10000, k=0.5)

# Step 2: Run Monte Carlo empirical validation
empirical_arl0 = ARLBounds.verify_guarantees(
    detector_class=CUSUMDetector,
    n_runs=10000,
    sample_rate_hz=1.0,
    noise_distribution="gaussian",  # or "laplacian" for ocean noise
    verbose=True,
)

# Step 3: Publish BOTH values
# "Theoretical ARL₀ (Siegmund): 22,026. Empirical ARL₀ (Monte Carlo 10K runs): 9,247."
```

## Shiryaev-Roberts Detector (Alternative)

For gradual drift detection (gyro bias, sensor drift, propeller fouling):

$$R(t) = (1 + R(t-1)) \cdot \exp(\text{LLR}(z(t), \delta))$$

Where $\text{LLR}(z, \delta) = \delta \cdot z - 0.5 \cdot \delta^2$

- `threshold_a` = 500.0
- `shift_hypothesis` = 1.0σ
- Optimal under Bayesian criterion (minimizes expected detection delay)

## Monitored Dimensions

| Dimension | Physical Meaning | Expected Nominal σ |
|---|---|---|
| surge | Forward acceleration residual | 0.1 m/s² |
| sway | Lateral acceleration residual | 0.1 m/s² |
| heave | Vertical acceleration residual | 0.15 m/s² |
| roll | Roll angle residual | 0.5° |
| pitch | Pitch angle residual | 0.5° |
| yaw | Heading residual | 1.0° |
| thruster_current | Motor current draw | 0.5 A |
| depth_residual | Depth estimate error | 0.3 m |
| imu_bias | IMU bias drift | 0.01°/s |

## Known Test Failures — RESOLVED (2026-08-07)

The two failing RQ3 tests (`test_cusum_detects_thruster_fault_in_simulation`, `test_cusum_outperforms_threshold_baseline`) were **test bugs, not detector bugs**: the fault-injection math produced 0.4-0.5σ shifts — at/below the CUSUM reference value `k=0.5`, where CUSUM is mathematically blind (`z - k ≤ 0`). The tests' own comments claimed "~1.5σ", and `ARLBounds.verify_guarantees` models a 20% thruster fault as 1.5σ. Fixed by injecting `1.5 * nominal_std` (the documented model). Do NOT lower `k`/`h` to catch smaller shifts — that destroys the ARL₀ > 10,000 guarantee.

**Guidance**: when writing CUSUM tests, keep the injected shift ≥ `min_detectable_shift` (1.0σ) and ≥ `k` (0.5σ). For a 20-25% thruster fault, use 1.5σ per the verified model.

## When to Use CUSUM vs Shiryaev-Roberts

| Scenario | Use | Reason |
|---|---|---|
| Sudden thruster failure (step change) | CUSUM | Optimal for step detection |
| Gradual sensor drift (ramp) | Shiryaev-Roberts | Optimal for drift detection |
| Propeller fouling (variance increase) | Shiryaev-Roberts | Better at variance change detection |
| Unknown fault type | Both (ensemble) | Run both, alert on either |
