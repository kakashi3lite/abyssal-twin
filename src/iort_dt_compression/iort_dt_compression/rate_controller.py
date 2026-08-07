"""
IoRT-DT Adaptive Rate Controller
RQ1: Variable sync rate based on acoustic channel quality estimation.

The controller uses a PID-inspired algorithm to track estimated channel
capacity and adjust synchronization rate between 0.1 Hz and 10 Hz.

Information-theoretic target: maintain I(X; X̂) > threshold while
minimizing bandwidth utilization.
"""

from __future__ import annotations

import time
from collections import deque
from dataclasses import dataclass, field

import numpy as np


@dataclass
class ChannelMetrics:
    """Real-time acoustic channel quality metrics."""

    bandwidth_bps: float = 9600.0  # bits/sec (measured)
    latency_ms: float = 2000.0  # round-trip latency (ms)
    packet_loss_rate: float = 0.30  # fraction [0.0, 1.0]
    snr_db: float = 10.0  # estimated SNR
    timestamp: float = field(default_factory=time.time)

    @property
    def effective_bandwidth_bps(self) -> float:
        """Effective bandwidth accounting for packet loss."""
        return self.bandwidth_bps * (1.0 - self.packet_loss_rate)

    @property
    def channel_capacity_bps(self) -> float:
        """Shannon channel capacity estimate (simplified AWGN)."""
        snr_linear = 10.0 ** (self.snr_db / 10.0)
        return self.bandwidth_bps * np.log2(1.0 + snr_linear) / np.log2(2.0)

    def is_degraded(self) -> bool:
        """True if channel is in a degraded state."""
        return self.packet_loss_rate > 0.5 or self.latency_ms > 5000.0


@dataclass
class RateControllerConfig:
    """Configuration for the adaptive rate controller."""

    min_rate_hz: float = 0.1  # Minimum sync rate (acoustic blackout)
    max_rate_hz: float = 10.0  # Maximum sync rate (excellent link)
    target_bandwidth_fraction: float = 0.8  # Use max 80% of channel capacity

    # PID gains
    kp: float = 0.5  # Proportional gain
    ki: float = 0.1  # Integral gain
    kd: float = 0.05  # Derivative gain

    # State vector size (bytes) at current compression setting
    state_vector_bytes: int = 42  # AUVStateVector.WIRE_SIZE_BYTES

    # Sliding window for channel estimation
    window_size: int = 20


class AdaptiveRateController:
    """
    PID-based adaptive synchronization rate controller.

    Adjusts DT sync rate to maximize I(X; X̂) subject to:
        rate × state_vector_bytes × 8 ≤ target_bandwidth_fraction × channel_capacity_bps

    RQ1 Contribution: First controller to explicitly optimize the
    sync-rate/detection-accuracy tradeoff for acoustic-constrained DTs.
    """

    def __init__(self, config: RateControllerConfig | None = None) -> None:
        self.config = config or RateControllerConfig()
        self._current_rate_hz: float = 1.0  # Start conservative
        self._integral: float = 0.0
        self._prev_error: float = 0.0
        self._prev_time: float = time.time()
        self._channel_history: deque[ChannelMetrics] = deque(maxlen=self.config.window_size)
        self._rate_history: deque[tuple[float, float]] = deque(maxlen=1000)

    @property
    def current_rate_hz(self) -> float:
        """Current synchronization rate in Hz."""
        return self._current_rate_hz

    @property
    def current_period_s(self) -> float:
        """Current sync period in seconds."""
        return 1.0 / self._current_rate_hz

    def update_channel_metrics(self, metrics: ChannelMetrics) -> None:
        """
        Update channel quality estimate and compute new rate.

        Call this whenever a new channel measurement is available
        (e.g., from ACK timing, or from an acoustic modem status message).
        """
        self._channel_history.append(metrics)
        self._compute_new_rate()

    def _compute_new_rate(self) -> None:
        """PID control loop to compute new sync rate."""
        if not self._channel_history:
            return

        # Estimate current channel capacity (smoothed)
        recent = list(self._channel_history)[-5:]
        avg_capacity = np.mean([m.channel_capacity_bps for m in recent])
        avg_loss = np.mean([m.packet_loss_rate for m in recent])

        # Target: use target_bandwidth_fraction of capacity
        target_capacity_bps = avg_capacity * self.config.target_bandwidth_fraction

        # Maximum achievable rate given state vector size and bandwidth
        bits_per_state = self.config.state_vector_bytes * 8
        max_rate_by_bandwidth = target_capacity_bps / bits_per_state

        # Set target rate
        target_rate = float(
            np.clip(
                max_rate_by_bandwidth,
                self.config.min_rate_hz,
                self.config.max_rate_hz,
            )
        )

        # PID error signal: difference between target and current rate
        error = target_rate - self._current_rate_hz
        now = time.time()
        dt = max(now - self._prev_time, 0.001)  # Prevent division by zero

        # Integral (with anti-windup)
        self._integral = np.clip(
            self._integral + error * dt,
            -self.config.max_rate_hz,
            self.config.max_rate_hz,
        )

        # Derivative
        derivative = (error - self._prev_error) / dt

        # PID output
        output = (
            self.config.kp * error + self.config.ki * self._integral + self.config.kd * derivative
        )

        # Apply output and clamp
        new_rate = float(
            np.clip(
                self._current_rate_hz + output,
                self.config.min_rate_hz,
                self.config.max_rate_hz,
            )
        )

        # Additional: hard reduction if channel is degraded
        if avg_loss > 0.6:
            new_rate = min(new_rate, 0.5)  # Emergency reduction

        self._current_rate_hz = new_rate
        self._prev_error = error
        self._prev_time = now
        self._rate_history.append((now, new_rate))

    def get_rate_history(self) -> list[tuple[float, float]]:
        """Return (timestamp, rate_hz) history for experiment analysis."""
        return list(self._rate_history)

    def theoretical_max_detection_capable_rate(
        self,
        detection_window_s: float = 30.0,
    ) -> float:
        """
        Theoretical minimum rate to detect anomalies within detection_window_s.

        Based on RQ1 analysis: need at least k=3 observations per detection window.
        Lower bound: k / detection_window_s Hz

        Paper reference: Lemma 1 (minimum observable rate for CUSUM detector)
        """
        k_min_observations = 3
        return k_min_observations / detection_window_s

    def estimate_mutual_information(
        self,
        original_states: list[float],
        compressed_states: list[float],
        n_bins: int = 32,
    ) -> float:
        """
        Estimate mutual information I(X; X̂) between original and compressed state.

        Used in RQ1 to characterize information loss from compression.

        Returns: I(X; X̂) in bits
        """
        x = np.array(original_states)
        x_hat = np.array(compressed_states)

        # Joint histogram
        hist_2d, _, _ = np.histogram2d(x, x_hat, bins=n_bins)
        pxy = hist_2d / hist_2d.sum()
        px = pxy.sum(axis=1, keepdims=True)
        py = pxy.sum(axis=0, keepdims=True)

        # Mutual information: I(X;Y) = Σ p(x,y) log(p(x,y) / (p(x)p(y)))
        mask = pxy > 0
        mi = float(np.sum(pxy[mask] * np.log2(pxy[mask] / (px * py)[mask])))
        return mi


class AcousticChannelSimulator:
    """
    Simulates realistic underwater acoustic channel for validation.

    Models:
    - Bursty packet loss (Markov chain: good/bad state)
    - Variable latency (Gaussian centered at mean_latency_ms)
    - Bandwidth throttling (9600 baud default)

    Used in RQ1/RQ4 experiments.
    """

    def __init__(
        self,
        mean_latency_ms: float = 2000.0,
        latency_std_ms: float = 500.0,
        bandwidth_bps: float = 9600.0,
        p_good_to_bad: float = 0.05,  # Markov transition prob: good → bad
        p_bad_to_good: float = 0.30,  # Markov transition prob: bad → good
        loss_in_good: float = 0.05,  # Loss rate in "good" state
        loss_in_bad: float = 0.70,  # Loss rate in "bad" state
        rng_seed: int = 42,
    ) -> None:
        self.mean_latency_ms = mean_latency_ms
        self.latency_std_ms = latency_std_ms
        self.bandwidth_bps = bandwidth_bps
        self.p_good_to_bad = p_good_to_bad
        self.p_bad_to_good = p_bad_to_good
        self.loss_in_good = loss_in_good
        self.loss_in_bad = loss_in_bad
        self._rng = np.random.default_rng(rng_seed)
        self._in_good_state: bool = True
        self._total_packets: int = 0
        self._lost_packets: int = 0

    def transmit(self, packet: bytes) -> tuple[bool, float]:
        """
        Simulate acoustic packet transmission.

        Returns: (received: bool, latency_ms: float)
        """
        # Markov channel state transition
        if self._in_good_state:
            if self._rng.random() < self.p_good_to_bad:
                self._in_good_state = False
        else:
            if self._rng.random() < self.p_bad_to_good:
                self._in_good_state = True

        # Packet loss
        loss_rate = self.loss_in_good if self._in_good_state else self.loss_in_bad
        received = bool(self._rng.random() > loss_rate)

        # Latency (only meaningful if received)
        transmission_delay_ms = (len(packet) * 8 / self.bandwidth_bps) * 1000.0
        propagation_ms = max(
            0.0,
            self._rng.normal(self.mean_latency_ms, self.latency_std_ms),
        )
        total_latency_ms = transmission_delay_ms + propagation_ms

        self._total_packets += 1
        if not received:
            self._lost_packets += 1

        return received, total_latency_ms if received else 0.0

    @property
    def empirical_loss_rate(self) -> float:
        """Measured packet loss rate since initialization."""
        if self._total_packets == 0:
            return 0.0
        return self._lost_packets / self._total_packets

    def get_current_metrics(self) -> ChannelMetrics:
        """Snapshot of current channel metrics for rate controller."""
        return ChannelMetrics(
            bandwidth_bps=self.bandwidth_bps,
            latency_ms=self.mean_latency_ms,
            packet_loss_rate=self.empirical_loss_rate,
            snr_db=15.0 if self._in_good_state else 3.0,
        )
