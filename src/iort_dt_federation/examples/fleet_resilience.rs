// RQ2 fleet-resilience experiment CLI.
//
// Usage:
//   cargo run --release --manifest-path src/iort_dt_federation/Cargo.toml \
//     --example fleet_resilience -- --auv-count 4 --loss 0.5 --partition 120 --seed 42
//
// Prints one JSON object per run (machine-parseable by
// experiments/rq2_federation/validate.py):
//   {"auv_count":4,"loss":0.5,"partition_duration_s":120,"seed":42,
//    "convergence_time_s":...,"steady_coherence_pct":...,"rms_error_m":...,
//    "converged":true,"rounds":...}

use iort_dt_federation::simulation::{run_simulation, Scenario};
use std::collections::HashMap;
use std::env;

fn parse_f64(name: &str, args: &[String], default: f64) -> f64 {
    args.iter()
        .position(|a| a == name)
        .and_then(|i| args.get(i + 1))
        .and_then(|v| v.parse().ok())
        .unwrap_or(default)
}

fn parse_u64(name: &str, args: &[String], default: u64) -> u64 {
    args.iter()
        .position(|a| a == name)
        .and_then(|i| args.get(i + 1))
        .and_then(|v| v.parse().ok())
        .unwrap_or(default)
}

#[tokio::main]
async fn main() {
    let args: Vec<String> = env::args().collect();
    let scenario = Scenario {
        auv_count: parse_u64("--auv-count", &args, 4) as u8,
        loss_probability: parse_f64("--loss", &args, 0.5),
        partition_start_s: parse_f64("--start", &args, 60.0),
        partition_duration_s: parse_f64("--partition", &args, 120.0),
        post_heal_s: parse_f64("--post-heal", &args, 60.0),
        seed: parse_u64("--seed", &args, 42),
        ..Scenario::default()
    };

    let r = run_simulation(&scenario).await;
    println!(
        "{{\"auv_count\":{},\"loss\":{},\"partition_duration_s\":{},\"seed\":{},\
\"convergence_time_s\":{:.2},\"steady_coherence_pct\":{:.2},\"rms_error_m\":{:.4},\
\"converged\":{},\"rounds\":{}}}",
        scenario.auv_count,
        scenario.loss_probability,
        scenario.partition_duration_s,
        scenario.seed,
        r.convergence_time_s,
        r.steady_coherence_pct,
        r.rms_error_m,
        r.converged,
        r.rounds
    );

    if args.iter().any(|a| a == "--trace") {
        trace_states(&scenario).await;
    }
}

/// Dump per-node × per-AUV final estimate error vs ground truth (debug aid for
/// understanding which estimates fall outside the 2 m tolerance at high loss).
#[allow(clippy::cast_precision_loss)]
async fn trace_states(scenario: &Scenario) {
    use iort_dt_federation::simulation::run_simulation_with_nodes;

    let (_, nodes) = run_simulation_with_nodes(scenario).await;
    let n = usize::from(scenario.auv_count);
    let base_x: Vec<f64> = (0..n).map(|i| f64::from(i as u8) * 25.0).collect();
    let final_t = scenario.partition_start_s + scenario.partition_duration_s
        + scenario.post_heal_s;

    let mut gt_map: HashMap<u8, (f64, f64, f64)> = HashMap::new();
    for i in 0..n {
        gt_map.insert(i as u8, (base_x[i] + scenario.speed_ms * final_t, 0.0, -3000.0));
    }

    for node in &nodes {
        let states = node.fleet_states.read().await;
        for (id, st) in states.iter() {
            let g = gt_map.get(id).copied().unwrap_or((0.0, 0.0, 0.0));
            let err = ((f64::from(st.x) - g.0).powi(2)
                + (f64::from(st.y) - g.1).powi(2)
                + (f64::from(st.z) - g.2).powi(2))
                .sqrt();
            println!(
                "[trace] node={} auv={} err={:.3}m var={:.4} ts={:.1} {}",
                node.local_auv_id,
                id,
                err,
                st.position_variance,
                st.timestamp,
                if err < 2.0 { "OK" } else { ">2m" }
            );
        }
    }
}
