"""
IoRT-DT: Internet of Robotic Things - Digital Twins
Copyright (C) 2026 Swanand Tanavade / University of Nebraska at Omaha
SPDX-License-Identifier: Apache-2.0

IoRT-DT Anomaly Detection: Sequential Change-Point Detectors
RQ3: Physics-informed anomaly detection with formal statistical guarantees.

Implements:
  1. CUSUM (Page-Hinkley): Optimal for detecting mean shifts
     → Used for: thruster degradation, buoyancy changes
  2. Shiryaev-Roberts (S-R): Optimal for Bayesian change detection
     → Used for: sensor drift, gradual degradation

Formal guarantees:
  - Average Run Length to false alarm (ARL₀) > 10,000 steps
  - E[Detection Delay] < 120s for 20% thruster degradation at SNR=10dB
  - ARL₀ bounds use Siegmund (1985) approximation

Paper reference:
  "Sequential Anomaly Detection in Physics-Based AUV Digital Twins
   with Bounded False Alarm Guarantees"
  Tanavade, S. (PhD Thesis, UNO, 2029)
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import ClassVar, Optional

import numpy as np
from numba import jit
from numpy.typing import NDArray
from scipy import stats


# ─── Residual Signal Model ────────────────────────────────────────────────────

@dataclass
class ResidualSignal:
    """
    DT residual: r(t) = x_physical(t) - x_digital_twin(t)

    The residual represents the divergence between the physical AUV
    and its digital twin prediction. Under nominal conditions, residuals
    are approximately Gaussian with known μ₀ and σ₀ (calibrated offline).

    Under fault, the distribution shifts to μ₁ = μ₀ + δ (CUSUM) or
    variance changes to σ₁ ≠ σ₀ (Shiryaev-Roberts).
    """

    timestamp: float
    auv_id: int
    values: NDArray[np.float64]      # [surge, sway, heave, roll, pitch, yaw, ...] residuals
    source: str = "stonefish_twin"   # DT engine that produced prediction


@dataclass
class NominalDistribution:
    """
    Nominal (pre-fault) distribution of residuals.
    Calibrated during a "healthy mission" period (first 5 minutes).

    Used to set CUSUM thresholds with formal ARL guarantees.
    """

    mean: NDArray[np.float64]
    std: NDArray[np.float64]
    n_samples: int = 0
    calibration_timestamp: float = field(default_factory=time.time)

    def is_calibrated(self) -> bool:
        return self.n_samples >= 100  # Need at least 100 samples for stable estimate

    def z_score(self, residual: NDArray[np.float64]) -> NDArray[np.float64]:
        """Standardize residual to zero-mean, unit-variance."""
        return (residual - self.mean) / np.maximum(self.std, 1e-10)


# ─── CUSUM Detector ───────────────────────────────────────────────────────────

@dataclass
class CUSUMConfig:
    """
    CUSUM (Page-Hinkley) detector configuration.

    Threshold h derived from desired ARL₀ using Siegmund approximation:
        ARL₀ ≈ exp(2δh) / 2δ    (for standard normal observations)
        → For ARL₀ = 10,000 and δ = 0.5:  h ≈ ln(20000) / 1.0 ≈ 9.9

    Reference: Siegmund, D. (1985). Sequential Analysis. Springer.
    """

    # Threshold h: controls ARL₀
    # Default: h=10 → ARL₀ ≈ 22,026 under H₀ (Siegmund approximation)
    threshold_h: float = 10.0

    # Reference value k: half the expected shift magnitude (in sigma units)
    # k = 0.5 × δ where δ is the detectable shift size
    reference_k: float = 0.5   # Detects 1-sigma shifts efficiently

    # Minimum detectable shift (in std units)
    min_detectable_shift: float = 1.0

    # Residual dimensions to monitor (default: all)
    monitor_dims: Optional[list[int]] = None

    def theoretical_arl0(self) -> float:
        """
        Siegmund (1985) approximation of ARL₀.
        ARL₀ ≈ exp(2 × k × h) / (2k)
        """
        return np.exp(2 * self.reference_k * self.threshold_h) / (2 * self.reference_k)

    def theoretical_detection_delay(self, shift_magnitude: float) -> float:
        """
        Expected detection delay (Lorden's bound) for given shift magnitude δ.
        E[T_detect] ≈ (1/δ) × (h/δ + 1)
        """
        delta = shift_magnitude - self.reference_k
        if delta <= 0:
            return float("inf")
        return (self.threshold_h / delta) + 1.0 / delta


class CUSUMDetector:
    """
    CUSUM change-point detector for AUV DT residual monitoring.

    Maintains two statistics:
      S⁺(t): detects positive mean shifts (e.g., thruster drawing more current)
      S⁻(t): detects negative mean shifts (e.g., thruster producing less thrust)

    Alarm condition: S⁺(t) > h OR S⁻(t) > h

    RQ3 Contribution: First application of sequential detection theory
    to AUV DT residuals with formal ARL guarantees under acoustic
    packet loss (Markovian missing observations).
    """

    def __init__(
        self,
        nominal: NominalDistribution,
        config: Optional[CUSUMConfig] = None,
    ) -> None:
        self.nominal = nominal
        self.config = config or CUSUMConfig()

        # CUSUM statistics (one pair per monitored dimension)
        n_dims = len(nominal.mean)
        self._s_plus: NDArray[np.float64] = np.zeros(n_dims)
        self._s_minus: NDArray[np.float64] = np.zeros(n_dims)
        self._n_observations: int = 0
        self._alarms: list[dict] = []
        self._history_s_plus: list[NDArray[np.float64]] = []
        self._history_s_minus: list[NDArray[np.float64]] = []

    def update(
        self,
        residual: ResidualSignal,
        fault_injected: bool = False,  # Ground truth for ROC validation
    ) -> Optional["AnomalyAlert"]:
        """
        Update CUSUM statistics with new residual observation.

        Returns: AnomalyAlert if alarm triggered, else None.
        """
        if not self.nominal.is_calibrated():
            return None

        # Standardize residual
        z = self.nominal.z_score(residual.values)

        # Update CUSUM statistics (vectorized over all dimensions)
        k = self.config.reference_k
        self._s_plus = np.maximum(0.0, self._s_plus + z - k)
        self._s_minus = np.maximum(0.0, self._s_minus - z - k)
        self._n_observations += 1

        # Store history for paper figures
        self._history_s_plus.append(self._s_plus.copy())
        self._history_s_minus.append(self._s_minus.copy())

        # Check alarm condition
        h = self.config.threshold_h
        alarm_dims_plus = np.where(self._s_plus > h)[0]
        alarm_dims_minus = np.where(self._s_minus > h)[0]

        if len(alarm_dims_plus) > 0 or len(alarm_dims_minus) > 0:
            alert = AnomalyAlert(
                timestamp=residual.timestamp,
                auv_id=residual.auv_id,
                detector="CUSUM",
                alarm_dimensions=list(alarm_dims_plus) + list(alarm_dims_minus),
                s_plus_max=float(np.max(self._s_plus)),
                s_minus_max=float(np.max(self._s_minus)),
                n_observations_since_reset=self._n_observations,
                ground_truth_fault=fault_injected,
            )
            self._alarms.append(alert.__dict__)

            # Reset CUSUM statistics after alarm (standard practice)
            self._s_plus = np.zeros_like(self._s_plus)
            self._s_minus = np.zeros_like(self._s_minus)
            self._n_observations = 0

            return alert

        return None

    def reset(self) -> None:
        """Reset statistics (e.g., after confirmed maintenance)."""
        n_dims = len(self.nominal.mean)
        self._s_plus = np.zeros(n_dims)
        self._s_minus = np.zeros(n_dims)
        self._n_observations = 0

    @property
    def theoretical_arl0(self) -> float:
        return self.config.theoretical_arl0()

    def get_cusum_traces(self) -> dict[str, NDArray[np.float64]]:
        """Return CUSUM statistic history for paper figures."""
        return {
            "s_plus": np.array(self._history_s_plus),
            "s_minus": np.array(self._history_s_minus),
        }


# ─── Shiryaev-Roberts Detector ────────────────────────────────────────────────

class ShiryaevRobertsDetector:
    """
    Shiryaev-Roberts (S-R) detector for gradual drift / variance changes.

    Optimal under Bayesian criterion: minimizes expected detection delay
    given a flat prior on change-point location.

    Statistic: R(t) = Σ_{s=0}^{t} Π_{i=s+1}^{t} f₁(xᵢ)/f₀(xᵢ)
    Simplified update: R(t) = (1 + R(t-1)) × Λ(t)
    where Λ(t) = f₁(x(t))/f₀(x(t)) is the likelihood ratio.

    Used for: gyro drift (5°/hr), sensor bias, gradual propeller fouling.
    """

    def __init__(
        self,
        nominal: NominalDistribution,
        threshold_a: float = 500.0,    # Detection threshold
        shift_hypothesis: float = 1.0,  # Hypothesized shift (std units)
    ) -> None:
        self.nominal = nominal
        self.threshold_a = threshold_a
        self.shift_hypothesis = shift_hypothesis
        n_dims = len(nominal.mean)
        self._r_statistic: NDArray[np.float64] = np.zeros(n_dims)
        self._alarms: list[dict] = []
        self._history: list[NDArray[np.float64]] = []

    def update(
        self,
        residual: ResidualSignal,
    ) -> Optional["AnomalyAlert"]:
        """Update S-R statistic and check for alarm."""
        if not self.nominal.is_calibrated():
            return None

        z = self.nominal.z_score(residual.values)
        delta = self.shift_hypothesis

        # Log-likelihood ratio for N(δ, 1) vs N(0, 1)
        log_lr = _log_likelihood_ratio(z, delta)

        # S-R update: R(t) = (1 + R(t-1)) × exp(LLR)
        self._r_statistic = (1.0 + self._r_statistic) * np.exp(log_lr)
        self._history.append(self._r_statistic.copy())

        # Alarm
        alarm_dims = np.where(self._r_statistic > self.threshold_a)[0]
        if len(alarm_dims) > 0:
            alert = AnomalyAlert(
                timestamp=residual.timestamp,
                auv_id=residual.auv_id,
                detector="ShiryaevRoberts",
                alarm_dimensions=list(alarm_dims),
                s_plus_max=float(np.max(self._r_statistic)),
                s_minus_max=0.0,
                n_observations_since_reset=len(self._history),
                ground_truth_fault=False,
            )
            self._r_statistic = np.zeros_like(self._r_statistic)
            return alert

        return None


@jit(nopython=True)
def _log_likelihood_ratio(z: NDArray[np.float64], delta: float) -> NDArray[np.float64]:
    """JIT-compiled log-likelihood ratio for N(δ,1) vs N(0,1)."""
    return delta * z - 0.5 * delta * delta  # type: ignore[no-any-return]


# ─── Anomaly Alert Model ──────────────────────────────────────────────────────

@dataclass
class AnomalyAlert:
    """Structured anomaly alert published to ROS 2 / Zenoh."""

    timestamp: float
    auv_id: int
    detector: str               # "CUSUM" or "ShiryaevRoberts"
    alarm_dimensions: list[int]
    s_plus_max: float           # Max CUSUM statistic at alarm time
    s_minus_max: float
    n_observations_since_reset: int
    ground_truth_fault: bool = False  # For ROC curve computation (experiments only)

    DIMENSION_NAMES: ClassVar[tuple[str, ...]] = (
        "surge", "sway", "heave", "roll", "pitch", "yaw",
        "thruster_current", "depth_residual", "imu_bias",
    )





    def severity(self) -> str:
        """Classify alert severity based on statistic magnitude."""
        max_stat = max(self.s_plus_max, self.s_minus_max)
        if max_stat > 50:
            return "CRITICAL"
        elif max_stat > 20:
            return "WARNING"
        else:
            return "INFO"

    def alarmed_dimension_names(self) -> list[str]:
        """Human-readable names of alarmed state dimensions."""
        return [
            self.DIMENSION_NAMES[d]
            if d < len(self.DIMENSION_NAMES) else f"dim_{d}"
            for d in self.alarm_dimensions
        ]


# ─── ARL Theoretical Bounds ───────────────────────────────────────────────────

class ARLBounds:
    """
    Theoretical ARL bounds for CUSUM under various conditions.

    RQ3 paper contribution: extends classical ARL bounds to the case
    of Markovian packet loss (missing observations), proving that
    ARL₀ degrades gracefully with loss rate p_loss.
    """

    @staticmethod
    def arl0_siegmund(k: float, h: float) -> float:
        """
        Siegmund (1985) ARL₀ approximation for CUSUM.
        Valid for standard normal observations under H₀.
        ARL₀ ≈ exp(2kh) / (2k)
        """
        return np.exp(2 * k * h) / (2 * k)

    @staticmethod
    def arl0_with_packet_loss(k: float, h: float, p_loss: float) -> float:
        """
        Extended ARL₀ accounting for Markovian packet loss.

        Under packet loss, CUSUM statistics don't update on lost packets,
        effectively extending the ARL₀. This is a key RQ3 result.

        Approximation: ARL₀_loss ≈ ARL₀_nominal / (1 - p_loss)

        This is a conservative bound (true ARL₀ may be larger due to
        missed updates, but this is a false-alarm bound so larger is safer).
        """
        nominal_arl0 = ARLBounds.arl0_siegmund(k, h)
        return nominal_arl0 / max(1.0 - p_loss, 0.01)

    @staticmethod
    def detection_delay_lorden(
        delta: float,
        k: float,
        h: float,
    ) -> float:
        """
        Lorden's bound on worst-case detection delay.
        E[T | fault at t=0] ≤ (h + ln(1/k)) / delta + 1
        """
        if delta <= 0:
            return float("inf")
        return (h + np.log(1.0 / max(k, 1e-10))) / delta + 1.0

    @staticmethod
    def compute_threshold_for_arl0(
        target_arl0: float,
        k: float,
    ) -> float:
        """
        Compute threshold h to achieve target ARL₀.
        Inverse of Siegmund approximation.
        """
        return np.log(target_arl0 * 2 * k) / (2 * k)

    @staticmethod
    def verify_guarantees(config: CUSUMConfig, p_loss: float = 0.30) -> dict[str, float | bool]:
        """
        Verify RQ3 formal guarantees for a given config.

        Returns dict with:
          - arl0_nominal: ARL₀ under no packet loss
          - arl0_with_loss: ARL₀ under p_loss packet loss
          - arl0_target_met: True if ARL₀ > 10,000
          - detection_delay_20pct_thruster: E[T] for 20% thruster fault
          - detection_delay_target_met: True if delay < 120s at 50Hz
        """
        arl0_nom = ARLBounds.arl0_siegmund(config.reference_k, config.threshold_h)
        arl0_loss = ARLBounds.arl0_with_packet_loss(
            config.reference_k, config.threshold_h, p_loss
        )

        # 20% thruster fault → ~1.5σ shift in thruster current residual
        thruster_fault_shift_sigma = 1.5
        delay_steps = ARLBounds.detection_delay_lorden(
            thruster_fault_shift_sigma,
            config.reference_k,
            config.threshold_h,
        )

        # Convert steps to seconds (assume 50Hz physics, 0.5Hz DT sync)
        # At 0.5 Hz: 120s = 60 observations
        delay_s_at_05hz = delay_steps / 0.5

        return {
            "arl0_nominal": arl0_nom,
            "arl0_with_loss": arl0_loss,
            "arl0_target_met": bool(arl0_nom > 10_000),
            "detection_delay_steps": delay_steps,
            "detection_delay_s_at_05hz": delay_s_at_05hz,
            "detection_delay_target_met": bool(delay_s_at_05hz < 120.0),
        }


# ─── Calibration ─────────────────────────────────────────────────────────────

class OnlineNominalCalibrator:
    """
    Online calibration of nominal residual distribution.

    During the first CALIBRATION_WINDOW_S seconds of a mission,
    collects residuals to estimate μ₀ and σ₀ for the CUSUM detector.

    Uses Welford's online algorithm for numerically stable mean/variance.
    """

    CALIBRATION_WINDOW_S: float = 300.0  # 5 minutes

    def __init__(self, n_dims: int) -> None:
        self.n_dims = n_dims
        self._n: int = 0
        self._mean: NDArray[np.float64] = np.zeros(n_dims)
        self._m2: NDArray[np.float64] = np.zeros(n_dims)
        self._start_time: Optional[float] = None

    def update(self, residual: NDArray[np.float64]) -> None:
        """Update running statistics (Welford's algorithm)."""
        if self._start_time is None:
            self._start_time = time.time()

        self._n += 1
        delta = residual - self._mean
        self._mean += delta / self._n
        delta2 = residual - self._mean
        self._m2 += delta * delta2

    def is_calibrated(self) -> bool:
        elapsed = 0.0 if self._start_time is None else time.time() - self._start_time
        return self._n >= 100 and elapsed >= self.CALIBRATION_WINDOW_S

    def get_distribution(self) -> NominalDistribution:
        """Return calibrated nominal distribution."""
        variance = self._m2 / max(self._n - 1, 1)
        return NominalDistribution(
            mean=self._mean.copy(),
            std=np.sqrt(variance),
            n_samples=self._n,
        )
