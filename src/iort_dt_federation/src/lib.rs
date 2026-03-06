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

// ─── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    /// Helper: build a minimal DT state for testing.
    fn make_state(auv_id: u8, x: f32, y: f32, z: f32, variance: f32) -> FederatedDTState {
        let mut clock = VectorClock::new();
        clock.tick(auv_id);
        FederatedDTState {
            auv_id,
            timestamp: 1000.0 + auv_id as f64,
            clock,
            x,
            y,
            z,
            yaw: 0.0,
            position_variance: variance,
            anomaly_detected: false,
            anomaly_dimension: 0,
            health_score: 255,
            mission_phase: 1,
        }
    }

    // ── VectorClock ──────────────────────────────────────────────────────

    #[test]
    fn vector_clock_new_is_empty() {
        let vc = VectorClock::new();
        assert!(vc.clocks.is_empty());
    }

    #[test]
    fn vector_clock_tick_increments() {
        let mut vc = VectorClock::new();
        vc.tick(0);
        assert_eq!(vc.clocks[&0], 1);
        vc.tick(0);
        assert_eq!(vc.clocks[&0], 2);
        vc.tick(1);
        assert_eq!(vc.clocks[&1], 1);
    }

    #[test]
    fn vector_clock_merge_takes_max() {
        let mut a = VectorClock::new();
        a.tick(0); a.tick(0); // {0: 2}

        let mut b = VectorClock::new();
        b.tick(0); // {0: 1}
        b.tick(1); b.tick(1); b.tick(1); // {1: 3}

        a.merge(&b);
        assert_eq!(a.clocks[&0], 2, "should keep local max");
        assert_eq!(a.clocks[&1], 3, "should adopt remote for unseen key");
    }

    #[test]
    fn vector_clock_happens_before() {
        let mut a = VectorClock::new();
        a.tick(0); // {0: 1}

        let mut b = VectorClock::new();
        b.tick(0); b.tick(0); // {0: 2}

        assert!(a.happens_before(&b), "a < b");
        assert!(!b.happens_before(&a), "b is not before a");
    }

    #[test]
    fn vector_clock_concurrent_events() {
        let mut a = VectorClock::new();
        a.tick(0); // {0: 1}

        let mut b = VectorClock::new();
        b.tick(1); // {1: 1}

        // Neither happens before the other (concurrent)
        assert!(!a.happens_before(&b));
        assert!(!b.happens_before(&a));
    }

    #[test]
    fn vector_clock_equal_is_not_happens_before() {
        let mut a = VectorClock::new();
        a.tick(0);
        let b = a.clone();
        assert!(!a.happens_before(&b), "equal clocks are not ordered");
    }

    #[test]
    fn vector_clock_serialization_round_trip() {
        let mut vc = VectorClock::new();
        vc.tick(0); vc.tick(1); vc.tick(1);
        let bytes = vc.to_bytes();
        assert!(!bytes.is_empty());
        let deserialized: VectorClock = bincode::deserialize(&bytes)
            .expect("should deserialize");
        assert_eq!(vc, deserialized);
    }

    // ── MerkleTree ───────────────────────────────────────────────────────

    #[test]
    fn merkle_tree_empty_returns_zeros() {
        let tree = MerkleTree::from_states(&[]);
        assert_eq!(tree.root, [0u8; 32]);
        assert!(tree.leaves.is_empty());
    }

    #[test]
    fn merkle_tree_single_leaf_is_its_own_root() {
        let state = make_state(0, 1.0, 2.0, -5.0, 0.5);
        let tree = MerkleTree::from_states(&[state.clone()]);
        assert_eq!(tree.leaves.len(), 1);
        assert_eq!(tree.root, state.merkle_hash());
    }

    #[test]
    fn merkle_tree_identical_states_produce_same_root() {
        let states = vec![
            make_state(0, 1.0, 2.0, -5.0, 0.5),
            make_state(1, 3.0, 4.0, -8.0, 1.0),
        ];
        let tree_a = MerkleTree::from_states(&states);
        let tree_b = MerkleTree::from_states(&states);
        assert_eq!(tree_a.root, tree_b.root);
    }

    #[test]
    fn merkle_tree_different_states_produce_different_roots() {
        let states_a = vec![make_state(0, 1.0, 2.0, -5.0, 0.5)];
        let states_b = vec![make_state(0, 1.0, 2.0, -6.0, 0.5)]; // z differs
        let tree_a = MerkleTree::from_states(&states_a);
        let tree_b = MerkleTree::from_states(&states_b);
        assert_ne!(tree_a.root, tree_b.root);
    }

    #[test]
    fn merkle_tree_diff_leaves_finds_divergence() {
        let s0 = make_state(0, 1.0, 2.0, -5.0, 0.5);
        let s1 = make_state(1, 3.0, 4.0, -8.0, 1.0);
        let s1_changed = make_state(1, 3.0, 4.0, -9.0, 1.0); // z changed

        let tree_a = MerkleTree::from_states(&[s0.clone(), s1]);
        let tree_b = MerkleTree::from_states(&[s0, s1_changed]);

        let diff = tree_a.diff_leaves(&tree_b);
        assert_eq!(diff, vec![1], "only leaf 1 should differ");
    }

    #[test]
    fn merkle_tree_no_diff_when_identical() {
        let states = vec![
            make_state(0, 1.0, 2.0, -5.0, 0.5),
            make_state(1, 3.0, 4.0, -8.0, 1.0),
        ];
        let tree_a = MerkleTree::from_states(&states);
        let tree_b = MerkleTree::from_states(&states);
        assert!(tree_a.diff_leaves(&tree_b).is_empty());
    }

    // ── FederatedDTState ─────────────────────────────────────────────────

    #[test]
    fn merkle_hash_is_deterministic() {
        let state = make_state(0, 1.0, 2.0, -5.0, 0.5);
        let h1 = state.merkle_hash();
        let h2 = state.merkle_hash();
        assert_eq!(h1, h2);
    }

    #[test]
    fn merkle_hash_differs_for_different_positions() {
        let a = make_state(0, 1.0, 2.0, -5.0, 0.5);
        let b = make_state(0, 1.0, 2.0, -5.1, 0.5);
        assert_ne!(a.merkle_hash(), b.merkle_hash());
    }

    // ── FederationManager ────────────────────────────────────────────────

    #[tokio::test]
    async fn manager_update_local_state() {
        let mgr = FederationManager::new(0);
        let state = make_state(0, 1.0, 2.0, -5.0, 0.5);
        mgr.update_local_state(state).await.expect("should succeed");

        let states = mgr.fleet_states.read().await;
        assert_eq!(states.len(), 1);
        assert!(states.contains_key(&0));
    }

    #[tokio::test]
    async fn manager_gossip_announcement_empty_fleet() {
        let mgr = FederationManager::new(0);
        let msg = mgr.build_gossip_announcement().await;
        match msg {
            GossipMessage::MerkleRoot { from_auv, n_auvs, .. } => {
                assert_eq!(from_auv, 0);
                assert_eq!(n_auvs, 0);
            }
            _ => panic!("expected MerkleRoot"),
        }
    }

    #[tokio::test]
    async fn manager_gossip_announcement_reflects_fleet_size() {
        let mgr = FederationManager::new(0);
        mgr.update_local_state(make_state(0, 0.0, 0.0, 0.0, 1.0)).await.unwrap();
        mgr.update_local_state(make_state(1, 5.0, 5.0, -3.0, 1.0)).await.unwrap();

        let msg = mgr.build_gossip_announcement().await;
        match msg {
            GossipMessage::MerkleRoot { n_auvs, .. } => assert_eq!(n_auvs, 2),
            _ => panic!("expected MerkleRoot"),
        }
    }

    #[tokio::test]
    async fn kalman_reconcile_favors_lower_variance() {
        let mgr = FederationManager::new(0);

        // Local state: position (10, 0, 0) with high certainty (low variance)
        let local = make_state(1, 10.0, 0.0, 0.0, 0.1);
        mgr.update_local_state(local).await.unwrap();

        // Remote state: position (20, 0, 0) with low certainty (high variance)
        let remote = make_state(1, 20.0, 0.0, 0.0, 10.0);
        let reconciled = mgr.kalman_reconcile(vec![remote]).await.unwrap();

        assert_eq!(reconciled.len(), 1);
        // Fused x should be much closer to 10.0 (the more certain estimate)
        let fused_x = reconciled[0].x;
        assert!(fused_x < 12.0, "fused x={fused_x} should be close to 10.0");
        assert!(fused_x > 9.0, "fused x={fused_x} should be above 9.0");
    }

    #[tokio::test]
    async fn kalman_reconcile_equal_variance_averages() {
        let mgr = FederationManager::new(0);

        let local = make_state(1, 10.0, 0.0, 0.0, 1.0);
        mgr.update_local_state(local).await.unwrap();

        let remote = make_state(1, 20.0, 0.0, 0.0, 1.0);
        let reconciled = mgr.kalman_reconcile(vec![remote]).await.unwrap();

        // Equal variance: fused x should be the mean = 15.0
        let fused_x = reconciled[0].x;
        assert!((fused_x - 15.0).abs() < 0.01, "fused x={fused_x} should be ~15.0");
    }

    #[tokio::test]
    async fn kalman_reconcile_no_local_accepts_remote() {
        let mgr = FederationManager::new(0);
        // Don't insert any local state for AUV 5

        let remote = make_state(5, 42.0, 13.0, -7.0, 2.0);
        let reconciled = mgr.kalman_reconcile(vec![remote.clone()]).await.unwrap();

        assert_eq!(reconciled.len(), 1);
        assert_eq!(reconciled[0].x, 42.0);
        assert_eq!(reconciled[0].y, 13.0);
    }

    #[tokio::test]
    async fn formation_coherence_error_perfect_match() {
        let mgr = FederationManager::new(0);
        mgr.update_local_state(make_state(0, 1.0, 2.0, -5.0, 0.5)).await.unwrap();

        let gt = HashMap::from([(0u8, (1.0, 2.0, -5.0))]);
        let error = mgr.formation_coherence_error(&gt).await;
        assert!(error < 0.01, "perfect match should have ~0 error, got {error}");
    }

    #[tokio::test]
    async fn formation_coherence_error_empty_fleet() {
        let mgr = FederationManager::new(0);
        let gt = HashMap::from([(0u8, (0.0, 0.0, 0.0))]);
        let error = mgr.formation_coherence_error(&gt).await;
        assert!(error.is_infinite(), "empty fleet should return infinity");
    }

    #[tokio::test]
    async fn process_gossip_matching_root_returns_none() {
        let mgr = FederationManager::new(0);
        let state = make_state(0, 1.0, 2.0, -5.0, 0.5);
        mgr.update_local_state(state).await.unwrap();

        let announcement = mgr.build_gossip_announcement().await;
        if let GossipMessage::MerkleRoot { root, .. } = announcement {
            let msg = GossipMessage::MerkleRoot {
                from_auv: 1,
                root,
                n_auvs: 1,
            };
            let response = mgr.process_gossip(msg).await.unwrap();
            assert!(response.is_none(), "matching roots should produce no response");
        }
    }

    #[tokio::test]
    async fn process_gossip_mismatched_root_requests_leaves() {
        let mgr = FederationManager::new(0);
        mgr.update_local_state(make_state(0, 1.0, 2.0, -5.0, 0.5)).await.unwrap();

        let fake_root = [0xABu8; 32]; // definitely different
        let msg = GossipMessage::MerkleRoot {
            from_auv: 1,
            root: fake_root,
            n_auvs: 1,
        };
        let response = mgr.process_gossip(msg).await.unwrap();
        assert!(matches!(response, Some(GossipMessage::RequestLeaves { .. })));
    }

    #[tokio::test]
    async fn process_gossip_state_update_merges_newer() {
        let mgr = FederationManager::new(0);

        // Insert old state for AUV 1
        let old = FederatedDTState {
            timestamp: 100.0,
            ..make_state(1, 0.0, 0.0, 0.0, 1.0)
        };
        mgr.update_local_state(old).await.unwrap();

        // Send newer state via gossip
        let newer = FederatedDTState {
            timestamp: 200.0,
            x: 50.0,
            ..make_state(1, 0.0, 0.0, 0.0, 1.0)
        };
        let msg = GossipMessage::StateUpdate {
            from_auv: 1,
            states: vec![newer],
        };
        mgr.process_gossip(msg).await.unwrap();

        let states = mgr.fleet_states.read().await;
        assert_eq!(states[&1].x, 50.0, "should accept newer state");
    }
}
