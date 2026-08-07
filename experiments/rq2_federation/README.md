# RQ2 — Fleet Resilience: Empirical Validation

**Date:** 2026-08-08
**Status:** replaces the previously *claimed* "<45s partition recovery / 98.7%
fleet coherence" with **measured** values from the real federation algorithm.

## Why this exists

The RQ2 fleet-resilience headline numbers ("<45s recovery", "98.7% coherence")
were marketing claims — hardcoded into `README.md`, `dashboard.html`, and
`mission-control/README.md` — with **no experiment behind them** (the
`experiments/rq2_federation/` directory did not exist; CI marked RQ2 validation
"SKIPPED (metrics not yet configured)"). This experiment closes that gap, the
same way Phase 5 closed the Siegmund/ARL₀ gap.

## Methodology (documented, reproducible)

The simulation drives the **actual production algorithm** — the Rust
`FederationManager` in `src/iort_dt_federation/` (timestamp-ordered gossip
merge, inverse-variance Kalman partition-heal, Merkle-root anti-entropy) — not
a re-implementation.

| Parameter | Value | Rationale |
|---|---|---|
| Fleet size | 4 AUVs | RQ2 standard scenario |
| Gossip cadence | 2 s (0.5 Hz) | Fleet-tier telemetry rate |
| Packet loss | 0.3 / 0.5 / 0.7 | C2: 30–70% acoustic loss, Markov-modeled |
| Partition | 60 / 120 / 300 s | including worst-case 5-min acoustic blackout |
| Sensor noise | σ = 0.1 m | realistic localization uncertainty |
| Seed | 42 (deterministic) | reproducible, CI-safe |

**Model of a partition (honest):**
1. Each AUV senses its own position every round and updates its local node.
2. Anti-entropy gossip spreads states through a lossy channel.
3. During a partition, cross-group messages are fully dropped. A node's
   uncertainty about AUVs it cannot hear **grows with staleness** (variance
   ages) — the standard model that makes inverse-variance Kalman fusion the
   optimal re-weighting on reconnect.
4. On heal, `PartitionHeal` messages carry full states; `kalman_reconcile`
   fuses fresh (low-σ²) with stale (high-σ²) estimates.

**Metrics:**
- `convergence_time_s` — heal → fleet coherence ≥ 95% sustained for 5 rounds
- `steady_coherence_pct` — % of (node × AUV) estimates within 2 m of ground
  truth, averaged over the steady-state window (skips the post-heal transient)
- `rms_error_m` — final RMS position error vs ground truth (RQ2 target < 2 m)

## Run

```bash
poetry run python experiments/rq2_federation/validate.py
# or, without poetry:
python3 experiments/rq2_federation/validate.py
```

Output: markdown table + `experiments/rq2_federation/results.json`.

## Results

See `results.json` (generated) and the table printed by `validate.py`. The
numbers published in `README.md` / the dashboard / this repo's docs must match
`results.json` — never hardcode a fleet-resilience figure that the experiment
did not produce.
