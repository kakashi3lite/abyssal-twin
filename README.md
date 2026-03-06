# IoRT-DT: Federated Digital Twins for Autonomous Underwater Vehicles

[![CI](https://github.com/swanand-tanavade/iort-dt/actions/workflows/ci.yml/badge.svg)](https://github.com/swanand-tanavade/iort-dt/actions)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![ROS2](https://img.shields.io/badge/ROS2-Jazzy-brightgreen.svg)](https://docs.ros.org/en/jazzy/)
[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.placeholder.svg)](https://doi.org/10.5281/zenodo.placeholder)

Research implementation accompanying:  
**"IoRT-DT: Internet of Robotic Things — Digital Twins for AUV Fleets"**  
Swanand Tanavade · PhD Dissertation · University of Nebraska at Omaha · 2029

---

## 🚀 Quickstart (15 Minutes)

```bash
# Prerequisites: Docker + Docker Compose
git clone --recurse-submodules https://github.com/swanand-tanavade/iort-dt.git
cd iort-dt
make bootstrap          # One-time setup (certs, configs)
docker compose -f docker/docker-compose.simulation.yml up

# In a second terminal:
make demo               # Inject fault → detect → federate alert
```

Open **http://localhost:3000** → Grafana dashboard (admin/admin)

---

## 🧪 Research Questions & Targets

| RQ | Question | Target | Validation |
|----|----------|--------|-----------|
| **RQ1** | Minimum DT sync rate under acoustic constraints | >10:1 compression, F1>0.9 at 0.5 Hz | `make test-rq1` |
| **RQ2** | Federated DT coordination with partition tolerance | <2m RMS error, <60s convergence | `make test-rq2` |
| **RQ3** | Physics-informed anomaly detection with formal ARL bounds | ARL₀>10,000, detection <120s | `make test-rq3` |
| **RQ4** | DDS-Security under acoustic bandwidth starvation | Handshake <30s, <15% overhead | `make test-rq4` |

---

## 🏗️ Architecture

```
L7: Intelligence    ─ LLM mission planning (Year 3)
L6: Federation      ─ ★★★ Gossip-based DT coordination (Rust/Zenoh)   ← Novel
L5: Observability   ─ Grafana + Prometheus (COTS integration)
L4: Anomaly Detect  ─ ★★★ CUSUM/Shiryaev-Roberts with ARL bounds       ← Novel
L3: DT Engine       ─ Stonefish physics simulator (upstream)
L2: Security        ─ ★★  DDS-Security hardened for acoustic channels   ← Novel
L1: Communication   ─ ROS 2 Jazzy + rmw_zenoh (upstream)
L0: Physical        ─ BlueROV2 / ArduSub (commodity)
```

---

## 📁 Repository Structure

```
iort-dt/
├── src/                    # ROS 2 packages (colcon workspace)
│   ├── iort_dt_msgs/       # Custom message types
│   ├── iort_dt_compression/# RQ1: Avro+LZ4 state compression
│   ├── iort_dt_anomaly/    # RQ3: CUSUM/S-R detectors
│   ├── iort_dt_federation/ # RQ2: Rust gossip protocol
│   ├── iort_dt_security/   # RQ4: Acoustic-aware DDS-Security
│   └── iort_dt_bringup/    # Launch files, scenarios
├── experiments/            # Reproducible RQ validation scripts
├── configs/                # Stonefish models, scenarios, security
├── docs/theory/            # LaTeX proofs (paper appendices)
└── docker/                 # Simulation & HIL orchestration
```

---

## 📖 Reproducing Paper Results

```bash
# Figure 1: Sync rate vs detection F1 (RQ1)
make paper-figures FIGURE=1

# Table 2: ARL₀ bounds (RQ3)
make paper-figures FIGURE=2

# All figures (requires ~2h on 8-core machine)
make paper-figures
```

Results are logged to MLflow at **http://localhost:5000**

---

## 🔒 Open-Source Commitments

- **License:** Apache 2.0 (defense/industry friendly)
- **Sustainability:** Modular — each layer works without others
- **Hardware-ready:** Stonefish abstraction layer supports DAVE/HoloOcean swap
- **Upstream friendly:** Contributions back to Stonefish, rmw_zenoh

---

## 📚 Citation

```bibtex
@phdthesis{tanavade2029iortdt,
  author  = {Tanavade, Swanand},
  title   = {Federated Digital Twin Architectures for Autonomous Underwater Vehicle Fleets},
  school  = {University of Nebraska at Omaha},
  year    = {2029},
  note    = {Software: https://github.com/swanand-tanavade/iort-dt}
}
```

---

## 🤝 Related Work

- [IoFDT Framework](https://arxiv.org/abs/2410.XXXX) — Yu, Sakaguchi & Saad (2024)
- [AURA](https://arxiv.org/abs/2511.03075) — Buchholz et al. (2025) · *No code released*
- [Stonefish](https://github.com/patrykcieslak/stonefish) — Grimaldi et al. (ICRA 2025)
- [Yan et al. 2026](https://doi.org/10.1038/s44172-026-XXXXX) — DT-driven AUV swarms
