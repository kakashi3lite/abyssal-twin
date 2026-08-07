// IoRT-DT: Internet of Robotic Things - Digital Twins
// Copyright (C) 2026 Swanand Tanavade / University of Nebraska at Omaha
// SPDX-License-Identifier: Apache-2.0
//
// RQ2 fleet-resilience simulation harness.
//
// Drives the REAL `FederationManager` (gossip merge + Kalman partition-heal +
// formation-coherence metric) over a Markov packet-loss channel, forces a
// network partition, heals, and MEASURES:
//   - convergence_time_s: seconds from heal until fleet coherence ≥ 95%
//   - steady_coherence_pct: % of (node × AUV) estimates within 2 m of truth
//   - rms_error_m: final RMS position error vs ground truth
//
// This is the empirical replacement for the previously-claimed "<45s partition
// recovery / 98.7% fleet coherence" — the numbers this module produces are
// measured against the actual algorithm, not asserted.
//
// Honesty model (documented in experiments/rq2_federation/README.md):
//   - Each AUV senses its own position each gossip round (σ = sensor noise).
//   - Gossip spreads states through a lossy channel (probability p).
//   - During a partition, cross-group messages are fully dropped and a node's
//     uncertainty about other-group AUVs GROWS with staleness (variance ages) —
//     the standard model that makes inverse-variance Kalman fusion meaningful.
//   - On heal, PartitionHeal messages carry full states; kalman_reconcile fuses
//     fresh (low-variance) with stale (high-variance) estimates.

// Casts in this module are inherent to the model: FederatedDTState stores
// positions as f32 (the wire API) and fleet sizes are << 2^52, so u64/usize→f64
// and f64→f32 casts are precision-safe by construction (mirrors the inline
// `#[allow(clippy::cast_*)]` style used throughout lib.rs). The simulation loop
// is a single self-contained scenario driver — clarity of the flat loop beats
// refactoring it into helpers, so the pedantic style lints are suppressed here.
#![allow(
    clippy::cast_precision_loss,
    clippy::cast_possible_truncation,
    clippy::too_many_lines,
    clippy::needless_range_loop,
    clippy::missing_panics_doc,
    clippy::doc_markdown
)]

use crate::{FederatedDTState, FederationManager, GossipMessage, VectorClock};
use std::collections::HashMap;

// ─── Deterministic PRNG (xorshift64*) — seedable, no external dependency ────

pub struct Rng(u64);

impl Rng {
    #[must_use]
    pub fn new(seed: u64) -> Self {
        Self(seed.max(1))
    }

    #[inline]
    pub fn next_u64(&mut self) -> u64 {
        let mut x = self.0;
        x ^= x >> 12;
        x ^= x << 25;
        x ^= x >> 27;
        self.0 = x;
        x.wrapping_mul(0x2545_F491_4F6C_DD1D)
    }

    #[inline]
    pub fn uniform(&mut self) -> f64 {
        (self.next_u64() >> 11) as f64 / (1u64 << 53) as f64
    }

    /// Standard normal via Box–Muller.
    #[inline]
    pub fn gaussian(&mut self) -> f64 {
        let u1 = self.uniform().max(1e-12);
        let u2 = self.uniform();
        (-2.0 * u1.ln()).sqrt() * (2.0 * std::f64::consts::PI * u2).cos()
    }
}

// ─── Scenario ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct Scenario {
    pub auv_count: u8,
    pub loss_probability: f64,
    /// When false: no partition, no heal, no uncertainty aging — the run is
    /// steady-state gossip for the whole duration (used to measure coherence
    /// under loss WITHOUT a partition event).
    pub has_partition: bool,
    pub partition_start_s: f64,
    pub partition_duration_s: f64,
    pub gossip_interval_s: f64,
    pub speed_ms: f64,
    pub sensor_sigma_m: f64,
    pub post_heal_s: f64,
    pub seed: u64,
}

impl Default for Scenario {
    fn default() -> Self {
        Self {
            auv_count: 4,
            loss_probability: 0.5,
            has_partition: true,
            partition_start_s: 60.0,
            partition_duration_s: 120.0,
            gossip_interval_s: 2.0, // 0.5 Hz — fleet-tier cadence
            speed_ms: 0.5,
            sensor_sigma_m: 0.1,
            post_heal_s: 60.0,
            seed: 42,
        }
    }
}

// ─── Result ──────────────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct FleetSimResult {
    pub convergence_time_s: f64,
    pub steady_coherence_pct: f64,
    pub rms_error_m: f64,
    pub converged: bool,
    pub rounds: u64,
}

// ─── Core simulation ─────────────────────────────────────────────────────────

fn make_state(
    auv_id: u8,
    x: f64,
    y: f64,
    z: f64,
    variance: f64,
    timestamp: f64,
) -> FederatedDTState {
    let mut clock = VectorClock::new();
    clock.tick(auv_id);
    FederatedDTState {
        auv_id,
        timestamp,
        clock,
        x: x as f32,
        y: y as f32,
        z: z as f32,
        yaw: 0.0,
        position_variance: variance as f32,
        anomaly_detected: false,
        anomaly_dimension: 0,
        health_score: 255,
        battery_dv: 245,
        mission_phase: 2,
    }
}

fn group_of(i: usize, auv_count: u8) -> usize {
    usize::from(i >= usize::from(auv_count) / 2)
}

/// RMS position error and within-2m coherence %, across EVERY node's view of
/// EVERY AUV, vs ground truth. This is the fleet-wide metric (not node 0 only).
async fn fleet_metrics(
    nodes: &[FederationManager],
    ground_truth: &HashMap<u8, (f64, f64, f64)>,
) -> (f64, f64) {
    let mut errors: Vec<f64> = Vec::new();
    let mut within = 0usize;
    let mut total = 0usize;
    for node in nodes {
        let states = node.fleet_states.read().await;
        for (id, st) in states.iter() {
            if let Some(g) = ground_truth.get(id) {
                let dx = f64::from(st.x) - g.0;
                let dy = f64::from(st.y) - g.1;
                let dz = f64::from(st.z) - g.2;
                let e = (dx * dx + dy * dy + dz * dz).sqrt();
                errors.push(e);
                total += 1;
                if e < 2.0 {
                    within += 1;
                }
            }
        }
    }
    let rms = if errors.is_empty() {
        f64::INFINITY
    } else {
        (errors.iter().map(|e| e * e).sum::<f64>() / errors.len() as f64).sqrt()
    };
    let coherence_pct = if total == 0 { 0.0 } else { within as f64 / total as f64 * 100.0 };
    (rms, coherence_pct)
}

/// Run the deterministic fleet-resilience simulation and return the final node
/// states as well (used by the trace path to inspect per-estimate errors).
pub async fn run_simulation_with_nodes(
    scenario: &Scenario,
) -> (FleetSimResult, Vec<FederationManager>) {
    let mut rng = Rng::new(scenario.seed);
    let n = usize::from(scenario.auv_count);
    let nodes: Vec<FederationManager> =
        (0..scenario.auv_count).map(FederationManager::new).collect();

    // Ground truth: linear survey tracks along +x (y/z fixed).
    let base_x: Vec<f64> = (0..n).map(|i| f64::from(i as u8) * 25.0).collect();
    let gt = |t: f64, i: usize| base_x[i] + scenario.speed_ms * t;

    // Seed each node with its own noisy initial position.
    for i in 0..n {
        let x = gt(0.0, i) + rng.gaussian() * scenario.sensor_sigma_m;
        let st = make_state(i as u8, x, 0.0, -3000.0, scenario.sensor_sigma_m.powi(2), 0.0);
        nodes[i].update_local_state(st).await.unwrap();
    }

    let heal_t = if scenario.has_partition {
        scenario.partition_start_s + scenario.partition_duration_s
    } else {
        f64::INFINITY // no partition → no heal event
    };
    let end_t = if scenario.has_partition {
        heal_t + scenario.post_heal_s
    } else {
        scenario.partition_start_s + scenario.post_heal_s
    };
    let dt = scenario.gossip_interval_s;
    let mut t = 0.0f64;
    let mut round = 0u64;

    // Steady-coherence window: after convergence + 10 s; or, when the scenario
    // has no partition (heal never occurs), the whole run is steady state.
    let steady_start = if scenario.has_partition {
        f64::INFINITY // set once convergence is detected below
    } else {
        scenario.partition_start_s.min(end_t)
    };

    let mut converged = false;
    let mut convergence_time_s = f64::INFINITY;
    let mut converged_at_s = f64::INFINITY;
    let mut trailing_rms: Vec<f64> = Vec::new();
    let mut coherence_samples: Vec<f64> = Vec::new();
    let mut rms_final = f64::INFINITY;

    while t <= end_t + 1e-9 {
        let partition_active =
            scenario.has_partition && t >= scenario.partition_start_s && t < heal_t;
        let just_healed = scenario.has_partition && (t - heal_t).abs() < 1e-9;

        // 1. Each AUV senses and refreshes its OWN node state.
        for i in 0..n {
            let x = gt(t, i) + rng.gaussian() * scenario.sensor_sigma_m;
            let st =
                make_state(i as u8, x, 0.0, -3000.0, scenario.sensor_sigma_m.powi(2), t);
            nodes[i].update_local_state(st).await.unwrap();
        }

        // 2. Partition heal: full-state PartitionHeal across the fleet (lossy).
        if just_healed {
            for j in 0..n {
                let states = nodes[j].fleet_states.read().await.values().cloned().collect::<Vec<_>>();
                for k in 0..n {
                    if k == j {
                        continue;
                    }
                    if rng.uniform() < scenario.loss_probability {
                        continue;
                    }
                    let msg = GossipMessage::PartitionHeal {
                        from_auv: j as u8,
                        states: states.clone(),
                        disconnection_duration_s: scenario.partition_duration_s,
                    };
                    nodes[k].process_gossip(msg).await.unwrap();
                }
            }
        }

        // 3. Normal anti-entropy gossip (lossy; cross-group blocked in partition).
        for j in 0..n {
            let states = nodes[j].fleet_states.read().await.values().cloned().collect::<Vec<_>>();
            for k in 0..n {
                if k == j {
                    continue;
                }
                if partition_active && group_of(j, scenario.auv_count) != group_of(k, scenario.auv_count)
                {
                    continue; // full partition between groups
                }
                if rng.uniform() < scenario.loss_probability {
                    continue;
                }
                let msg = GossipMessage::StateUpdate {
                    from_auv: j as u8,
                    states: states.clone(),
                };
                nodes[k].process_gossip(msg).await.unwrap();
            }
        }

        // 4. Uncertainty growth during partition: a node's estimate of AUVs it
        //    cannot hear ages (variance grows) so Kalman fusion can re-weight.
        //    NOTE: the timestamp is NOT touched — a real stale state keeps its
        //    last-received timestamp, so fresh post-heal updates (newer
        //    timestamp) are accepted by the timestamp-ordered merge.
        if partition_active {
            for node in &nodes {
                let mut states = node.fleet_states.write().await;
                for st in states.values_mut() {
                    if st.auv_id != node.local_auv_id {
                        st.position_variance += 0.01 * dt as f32; // σ² grows ~0.02/s
                    }
                }
            }
        }

        // 5. Measure fleet coherence vs ground truth.
        let gt_map: HashMap<u8, (f64, f64, f64)> = (0..n)
            .map(|i| (i as u8, (gt(t, i), 0.0, -3000.0)))
            .collect();
        let (rms, coherence) = fleet_metrics(&nodes, &gt_map).await;
        rms_final = rms;

        // Convergence detection: RMS < 2 m sustained for 5 rounds post-heal
        // (RQ2 target: "formation coherence error < 2m RMS after reconciliation"
        // — RMS is robust to sensor-noise jitter in the coherence percentage).
        if scenario.has_partition && t >= heal_t {
            trailing_rms.push(rms);
            if trailing_rms.len() > 5 {
                trailing_rms.remove(0);
            }
            if !converged && trailing_rms.len() == 5
                && trailing_rms.iter().all(|r| *r < 2.0)
            {
                converged = true;
                convergence_time_s = t - heal_t;
                converged_at_s = t;
            }
        }
        // Steady-state coherence: sample only AFTER convergence + 10 s, so the
        // post-heal transient (convergence tail) does not contaminate the
        // coherence metric; for no-partition scenarios, steady_start is preset
        // (the whole run is steady state). Transient recovery is reported
        // separately as convergence_time_s.
        let sample_start = if converged_at_s.is_finite() {
            converged_at_s + 10.0
        } else {
            steady_start
        };
        if t >= sample_start {
            coherence_samples.push(coherence);
        }

        t += dt;
        round += 1;
    }

    let steady_coherence_pct = if coherence_samples.is_empty() {
        f64::NAN
    } else {
        coherence_samples.iter().sum::<f64>() / coherence_samples.len() as f64
    };

    let result = FleetSimResult {
        convergence_time_s,
        steady_coherence_pct,
        rms_error_m: rms_final,
        converged,
        rounds: round,
    };
    (result, nodes)
}

/// Metrics-only variant: runs the simulation and returns just the result.
pub async fn run_simulation(scenario: &Scenario) -> FleetSimResult {
    run_simulation_with_nodes(scenario).await.0
}
