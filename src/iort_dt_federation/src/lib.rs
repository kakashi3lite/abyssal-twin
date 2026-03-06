// IoRT-DT: Internet of Robotic Things - Digital Twins
// Copyright (C) 2026 Swanand Tanavade / University of Nebraska at Omaha
// SPDX-License-Identifier: Apache-2.0
//
// IoRT-DT Federation Protocol
// RQ2: Gossip-based DT coordination with partition tolerance
//
// Algorithm:
//   1. Anti-entropy gossip: Each node periodically exchanges Merkle tree digests
//      with randomly selected peers. State divergence is identified and patched.
//   2. Vector clocks: Track causality across AUV fleet (handles partitions).
//   3. Weighted Kalman fusion: Upon reconnection, reconcile multiple DT estimates
//      using inverse-covariance weighting.
//
// Target metrics (RQ2):
//   - Formation coherence error: <2m RMS after reconciliation
//   - Convergence time: <60s after 120s partition
//   - Bandwidth: >50% reduction vs full-state broadcast
//
// Reference: IoFDT (Sakaguchi et al., 2024) extended to acoustic networks

use std::collections::HashMap;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use anyhow::Result;
use nalgebra::{DMatrix, DVector};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tokio::sync::RwLock;
use std::sync::Arc;
use tracing::{debug, info, warn};

// ─── Data Structures ──────────────────────────────────────────────────────────

/// Vector clock for causality tracking across the AUV fleet.
/// Each AUV maintains a logical clock that increments on state updates.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct VectorClock {
    pub clocks: HashMap<u8, u64>,  // auv_id → logical time
}

impl VectorClock {
    pub fn new() -> Self {
        Self { clocks: HashMap::new() }
    }

    /// Increment the clock for a given AUV.
    pub fn tick(&mut self, auv_id: u8) {
        let entry = self.clocks.entry(auv_id).or_insert(0);
        *entry += 1;
    }

    /// Merge with another vector clock (take component-wise maximum).
    pub fn merge(&mut self, other: &VectorClock) {
        for (auv_id, &remote_time) in &other.clocks {
            let local_time = self.clocks.entry(*auv_id).or_insert(0);
            *local_time = (*local_time).max(remote_time);
        }
    }

    /// Compare clocks for causality ordering.
    pub fn happens_before(&self, other: &VectorClock) -> bool {
        self.clocks.iter().all(|(id, &t)| {
            t <= *other.clocks.get(id).unwrap_or(&0)
        }) && self != other
    }

    pub fn to_bytes(&self) -> Vec<u8> {
        bincode::serialize(self).unwrap_or_default()
    }
}

/// Compressed DT state for federation gossip.
/// Designed for acoustic efficiency: 64 bytes maximum.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FederatedDTState {
    pub auv_id: u8,
    pub timestamp: f64,           // Unix timestamp
    pub clock: VectorClock,

    // Position (meters, float32 for acoustic efficiency)
    pub x: f32,
    pub y: f32,
    pub z: f32,

    // Heading (radians, float32)
    pub yaw: f32,

    // Covariance diagonal (localization uncertainty — used in Kalman fusion)
    pub position_variance: f32,   // σ² in meters²

    // Health status
    pub anomaly_detected: bool,
    pub anomaly_dimension: u8,    // Which dimension triggered (0=none)
    pub health_score: u8,         // 0-255 (255=perfect)

    // Mission state
    pub mission_phase: u8,        // 0=idle, 1=transit, 2=survey, 3=emergency
}

impl FederatedDTState {
    /// Compute a stable hash for Merkle tree construction.
    pub fn merkle_hash(&self) -> [u8; 32] {
        let mut hasher = Sha256::new();
        hasher.update(&self.auv_id.to_le_bytes());
        hasher.update(&self.timestamp.to_le_bytes());
        hasher.update(&self.x.to_le_bytes());
        hasher.update(&self.y.to_le_bytes());
        hasher.update(&self.z.to_le_bytes());
        hasher.update(&self.clock.to_bytes());
        hasher.finalize().into()
    }
}

/// Merkle tree over the fleet DT state.
/// Used for efficient anti-entropy: nodes compare root hashes first,
/// then drill down to find divergent leaves — minimizing acoustic traffic.
#[derive(Debug, Clone)]
pub struct MerkleTree {
    pub leaves: Vec<[u8; 32]>,    // One hash per AUV
    pub root: [u8; 32],
}

impl MerkleTree {
    /// Build Merkle tree from fleet states.
    pub fn from_states(states: &[FederatedDTState]) -> Self {
        let leaves: Vec<[u8; 32]> = states.iter().map(|s| s.merkle_hash()).collect();
        let root = Self::compute_root(&leaves);
        Self { leaves, root }
    }

    fn compute_root(leaves: &[[u8; 32]]) -> [u8; 32] {
        if leaves.is_empty() {
            return [0u8; 32];
        }
        if leaves.len() == 1 {
            return leaves[0];
        }
        let mut current_level = leaves.to_vec();
        while current_level.len() > 1 {
            let mut next_level = Vec::new();
            for chunk in current_level.chunks(2) {
                let mut hasher = Sha256::new();
                hasher.update(chunk[0]);
                hasher.update(if chunk.len() > 1 { chunk[1] } else { chunk[0] });
                next_level.push(hasher.finalize().into());
            }
            current_level = next_level;
        }
        current_level[0]
    }

    /// Identify divergent AUV indices between two Merkle trees.
    pub fn diff_leaves(&self, other: &MerkleTree) -> Vec<usize> {
        self.leaves
            .iter()
            .zip(other.leaves.iter())
            .enumerate()
            .filter(|(_, (a, b))| a != b)
            .map(|(i, _)| i)
            .collect()
    }
}

// ─── Gossip Protocol ─────────────────────────────────────────────────────────

/// Gossip message exchanged between federation nodes.
#[derive(Debug, Serialize, Deserialize)]
pub enum GossipMessage {
    /// Phase 1: Announce Merkle root (very small, ~32 bytes)
    MerkleRoot {
        from_auv: u8,
        root: [u8; 32],
        n_auvs: u8,
    },
    /// Phase 2: Request specific leaf states (sent when roots differ)
    RequestLeaves {
        from_auv: u8,
        requested_auv_ids: Vec<u8>,
    },
    /// Phase 3: Provide requested states
    StateUpdate {
        from_auv: u8,
        states: Vec<FederatedDTState>,
    },
    /// Partition heal: "I'm reconnected, here's my view"
    PartitionHeal {
        from_auv: u8,
        states: Vec<FederatedDTState>,
        disconnection_duration_s: f64,
    },
}

/// Fleet-wide federation manager.
/// Runs the gossip protocol and maintains the federated DT state.
pub struct FederationManager {
    pub local_auv_id: u8,
    pub fleet_states: Arc<RwLock<HashMap<u8, FederatedDTState>>>,
    pub gossip_interval: Duration,
    pub partition_timeout: Duration,
    pub last_seen: Arc<RwLock<HashMap<u8, SystemTime>>>,
}

impl FederationManager {
    pub fn new(local_auv_id: u8) -> Self {
        Self {
            local_auv_id,
            fleet_states: Arc::new(RwLock::new(HashMap::new())),
            gossip_interval: Duration::from_millis(500),
            partition_timeout: Duration::from_secs(30),
            last_seen: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Update local DT state and trigger gossip round.
    pub async fn update_local_state(&self, state: FederatedDTState) -> Result<()> {
        let mut states = self.fleet_states.write().await;
        states.insert(state.auv_id, state);
        Ok(())
    }

    /// Process incoming gossip message.
    pub async fn process_gossip(
        &self,
        message: GossipMessage,
    ) -> Result<Option<GossipMessage>> {
        match message {
            GossipMessage::MerkleRoot { from_auv, root, n_auvs: _ } => {
                let states = self.fleet_states.read().await;
                let local_states: Vec<FederatedDTState> = states.values().cloned().collect();
                drop(states);

                let local_tree = MerkleTree::from_states(&local_states);

                if local_tree.root != root {
                    // Roots differ: request divergent leaves
                    debug!("Merkle root mismatch with AUV {}, requesting diff", from_auv);

                    // For simplicity, request all — in practice, use leaf comparison
                    let all_ids: Vec<u8> = local_states.iter().map(|s| s.auv_id).collect();
                    return Ok(Some(GossipMessage::RequestLeaves {
                        from_auv: self.local_auv_id,
                        requested_auv_ids: all_ids,
                    }));
                }

                // Roots match: no action needed
                Ok(None)
            }

            GossipMessage::StateUpdate { from_auv: _, states } => {
                // Merge incoming states using causal ordering
                let mut local_states = self.fleet_states.write().await;
                for remote_state in states {
                    let should_update = match local_states.get(&remote_state.auv_id) {
                        None => true,
                        Some(local) => {
                            // Accept if remote has higher timestamp (simplified)
                            // Full implementation uses vector clock ordering
                            remote_state.timestamp > local.timestamp
                        }
                    };
                    if should_update {
                        local_states.insert(remote_state.auv_id, remote_state);
                    }
                }
                Ok(None)
            }

            GossipMessage::PartitionHeal { from_auv, states, disconnection_duration_s } => {
                info!(
                    "Partition heal from AUV {}: was disconnected for {:.1}s",
                    from_auv, disconnection_duration_s
                );

                // Apply weighted Kalman fusion for reconciliation
                let reconciled = self.kalman_reconcile(states).await?;
                let mut local_states = self.fleet_states.write().await;
                for state in reconciled {
                    local_states.insert(state.auv_id, state);
                }

                Ok(None)
            }

            _ => Ok(None),
        }
    }

    /// Weighted Kalman filter reconciliation upon partition heal.
    ///
    /// When connectivity is restored, each node may have different estimates
    /// of fleet position. We fuse them using inverse-covariance weighting:
    ///
    ///   x_fused = (Σ w_i x_i) / (Σ w_i)
    ///   w_i = 1 / σ²_i  (inverse position variance)
    ///
    /// This is the optimal linear estimator under Gaussian uncertainty.
    pub async fn kalman_reconcile(
        &self,
        remote_states: Vec<FederatedDTState>,
    ) -> Result<Vec<FederatedDTState>> {
        let local_states = self.fleet_states.read().await;
        let mut reconciled = Vec::new();

        for remote in &remote_states {
            let reconciled_state = if let Some(local) = local_states.get(&remote.auv_id) {
                // Fuse local and remote estimates
                let w_local = 1.0 / (local.position_variance + 1e-10);
                let w_remote = 1.0 / (remote.position_variance + 1e-10);
                let w_total = w_local + w_remote;

                FederatedDTState {
                    auv_id: remote.auv_id,
                    timestamp: f64::max(local.timestamp, remote.timestamp),
                    clock: {
                        let mut merged = local.clock.clone();
                        merged.merge(&remote.clock);
                        merged
                    },
                    x: (w_local * local.x + w_remote * remote.x) / w_total,
                    y: (w_local * local.y + w_remote * remote.y) / w_total,
                    z: (w_local * local.z + w_remote * remote.z) / w_total,
                    yaw: (w_local * local.yaw + w_remote * remote.yaw) / w_total,
                    // Fused variance (harmonic mean of variances)
                    position_variance: 1.0 / w_total,
                    // Propagate anomaly detection (OR logic — conservative)
                    anomaly_detected: local.anomaly_detected || remote.anomaly_detected,
                    anomaly_dimension: if remote.anomaly_detected {
                        remote.anomaly_dimension
                    } else {
                        local.anomaly_dimension
                    },
                    health_score: local.health_score.min(remote.health_score),
                    mission_phase: remote.mission_phase,  // Remote is more recent
                }
            } else {
                // No local state: accept remote directly
                remote.clone()
            };

            reconciled.push(reconciled_state);
        }

        Ok(reconciled)
    }

    /// Build local gossip message (Merkle root announcement).
    pub async fn build_gossip_announcement(&self) -> GossipMessage {
        let states = self.fleet_states.read().await;
        let state_vec: Vec<FederatedDTState> = states.values().cloned().collect();
        let tree = MerkleTree::from_states(&state_vec);

        GossipMessage::MerkleRoot {
            from_auv: self.local_auv_id,
            root: tree.root,
            n_auvs: state_vec.len() as u8,
        }
    }

    /// Compute formation coherence error (RQ2 metric).
    /// Returns RMS position error across federated DT estimates vs provided ground truth.
    pub async fn formation_coherence_error(
        &self,
        ground_truth: &HashMap<u8, (f64, f64, f64)>,  // auv_id → (x, y, z)
    ) -> f64 {
        let states = self.fleet_states.read().await;
        let errors: Vec<f64> = states
            .iter()
            .filter_map(|(id, state)| {
                ground_truth.get(id).map(|(gt_x, gt_y, gt_z)| {
                    let dx = state.x as f64 - gt_x;
                    let dy = state.y as f64 - gt_y;
                    let dz = state.z as f64 - gt_z;
                    (dx * dx + dy * dy + dz * dz).sqrt()
                })
            })
            .collect();

        if errors.is_empty() {
            return f64::INFINITY;
        }

        let mse = errors.iter().map(|e| e * e).sum::<f64>() / errors.len() as f64;
        mse.sqrt()  // RMS error
    }
}

// ─── Library Entry Point ──────────────────────────────────────────────────────

pub mod prelude {
    pub use super::{
        FederatedDTState, FederationManager, GossipMessage, MerkleTree, VectorClock,
    };
}
