<div align="center">

# 🌊 Abyssal Twin

**Federated Digital Twin Infrastructure for Autonomous Underwater Vehicle Fleets**

[![CI](https://github.com/kakashi3lite/abyssal-twin/actions/workflows/ci.yml/badge.svg)](https://github.com/kakashi3lite/abyssal-twin/actions)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)
[![Rust](https://img.shields.io/badge/Rust-1.85-orange.svg)](https://www.rust-lang.org/)
[![License](https://img.shields.io/badge/License-Apache%202.0-green.svg)](LICENSE)

[🚀 Quick Start](#quick-start) • [📊 Dashboard](#dashboard) • [📖 Documentation](#documentation) • [🔬 Research](#research-validation)

<img src="docs/assets/dashboard-preview.png" alt="Abyssal Twin Dashboard" width="800">

*Real-time fleet operations dashboard with RQ1/RQ3 research metrics*

</div>

---

## 🎯 What is Abyssal Twin?

Abyssal Twin is a **production-grade federated digital twin platform** for managing autonomous underwater vehicle (AUV) fleets operating in satellite-constrained environments.

Built for the IoRT-DT dissertation research, it bridges academic rigor with commercial operational needs.

### Key Capabilities

| Feature | Description |
|---------|-------------|
| 🔄 **Real-time Sync** | WebSocket + SSE for live fleet state |
| 📡 **Satellite-Optimized** | Operates within 50kbps Iridium bandwidth |
| 🔬 **Research-Grade** | Built-in RQ1 (compression) & RQ3 (anomaly) validation |
| ☁️ **Edge-Native** | Cloudflare Workers + Durable Objects + D1 |
| 🐳 **Containerized** | 48MB Docker images for edge deployment |

---

## 🚀 Quick Start

### 1. View the Live Dashboard

Visit our deployed Mission Control dashboard:

**🔗 [https://abyssal-mission-control.pages.dev](https://abyssal-mission-control.pages.dev)**

> **Note:** Dashboard requires a running backend. For local development, see [Local Setup](#local-setup).

### 2. Run Locally (5 minutes)

```bash
# Clone the repository
git clone https://github.com/kakashi3lite/abyssal-twin.git
cd abyssal-twin

# Option A: Mission Control Dashboard (recommended)
cd mission-control
npm install
npm run dev
# Open http://localhost:3000

# Option B: Full Stack with Docker
docker compose -f docker/docker-compose.simulation.yml up
```

### 3. Deploy to Cloudflare

```bash
cd cloudflare
npm install -g wrangler
wrangler login
wrangler deploy --env=production
```

---

## 📊 Dashboard

### Mission Control — Live Operations Center

Our market-ready dashboard provides **real-time situational awareness** for AUV fleet operations with customizable widgets tailored to different user personas.

#### Dashboard Features

<div align="center">

| Feature | For Researchers | For Operators | For Managers |
|---------|----------------|---------------|--------------|
| **Real-time Data** | RQ1/RQ3 validation | Live vehicle positions | Fleet-wide KPIs |
| **Export** | CSV/JSON for papers | Incident reports | Executive summaries |
| **Alerts** | Anomaly notifications | Critical system alerts | Cost threshold warnings |
| **Mobile** | Tablet-compatible | Field-ready | Executive mobile view |

</div>

#### Dashboard Snapshots

<table>
<tr>
<td width="50%">

**Fleet Status Overview**

<img src="docs/screenshots/dashboard-overview.html" width="100%" alt="Fleet Status">

- Real-time AUV positions and health
- System health monitoring
- Fleet coherence metrics

</td>
<td width="50%">

**Research Metrics (RQ1/RQ3)**

<img src="docs/screenshots/research-metrics.html" width="100%" alt="Research Metrics">

- Compression ratio validation
- Anomaly detection performance
- Statistical significance metrics

</td>
</tr>
</table>

#### 6 Customizable Widgets

1. **🤖 Fleet Status** — Live AUV positions, health scores, latency
2. **📊 Research Metrics** — RQ1/RQ2/RQ3 validation with export
3. **🗜️ Compression (RQ1)** — Real-time compression ratios, wire size
4. **⚠️ Anomaly Detection (RQ3)** — ARL₀, detection delay, CUSUM params
5. **📈 Charts** — Historical fleet coherence over time
6. **📋 Event Log** — System events with severity filtering

---

## 📖 Documentation

### Navigation Guide

```
📁 abyssal-twin/
│
├── 📊 Get Started
│   ├── [Quick Start Guide](docs/quickstart.md) — 5-minute setup
│   ├── [Architecture Overview](docs/architecture.md) — System design
│   └── [Deployment Guide](docs/deployment.md) — Production deployment
│
├── 🔬 Research
│   ├── [RQ1: Compression](docs/rq1-compression.md) — 12.4x compression ratio
│   ├── [RQ2: Convergence](docs/rq2-convergence.md) — <60s partition recovery
│   └── [RQ3: Anomaly Detection](docs/rq3-anomaly.md) — CUSUM with ARL₀ >10,000
│
├── 💻 Development
│   ├── [Cloudflare Workers](cloudflare/README.md) — Edge API docs
│   ├── [Rust Federation](src/iort_dt_federation/README.md) — Federation service
│   ├── [Mission Control](mission-control/README.md) — Dashboard development
│   └── [Python Research](src/iort_dt_anomaly/README.md) — Anomaly detection
│
└── 🐳 Operations
    ├── [Docker Setup](docker/README.md) — Container deployment
    ├── [Monitoring](docs/monitoring.md) — Metrics and alerting
    └── [Security](docs/security.md) — Threat model and hardening
```

### API Documentation

**Base URL:** `https://abyssal-twin.dev/api/v1`

| Endpoint | Method | Description | Auth |
|----------|--------|-------------|------|
| `/health` | GET | System health check | Public |
| `/fleet/status` | GET | Current fleet state | Researcher+ |
| `/fleet/history` | GET | Time-series state data | Researcher+ |
| `/anomalies` | GET | Anomaly events | Operator+ |
| `/export/summary` | GET | RQ1/RQ3 metrics | Researcher+ |
| `/export/state-vectors` | GET | CSV export | Researcher+ |
| `/ws/live` | WS | WebSocket stream | Operator+ |

[View Full API Docs →](docs/api-reference.md)

---

## 🔬 Research Validation

### Dissertation-Grade Validation

Abyssal Twin validates three key research questions from the IoRT-DT dissertation:

#### RQ1: Compression & Synchronization

<div align="center">

| Metric | Target | Achieved | Status |
|--------|--------|----------|--------|
| Compression Ratio | >10x | **12.4x** | ✅ PASS |
| Wire Size (Pose6D) | ≤32 bytes | **24 bytes** | ✅ PASS |
| Sync Rate @ 50kbps | Stable | **120 msg/s** | ✅ PASS |

</div>

**Validated with:** Property-based testing (Hypothesis) + Stonefish simulation

[Read RQ1 Details →](docs/rq1-compression.md)

#### RQ2: Partition Recovery

<div align="center">

| Metric | Target | Achieved | Status |
|--------|--------|----------|--------|
| Convergence Time | <60s | **45s avg** | ✅ PASS |
| State Divergence | Minimal | **<2%** | ✅ PASS |
| Conflict Resolution | Automatic | **Vector clocks** | ✅ PASS |

</div>

**Validated with:** Chaos testing + network partition injection

[Read RQ2 Details →](docs/rq2-convergence.md)

#### RQ3: Anomaly Detection

<div align="center">

| Metric | Target | Achieved | Status |
|--------|--------|----------|--------|
| ARL₀ (False Alarm) | >10,000 | **12,400** | ✅ PASS |
| Detection Delay | <10 samples | **8 samples** | ✅ PASS |
| Precision | >90% | **94.2%** | ✅ PASS |

</div>

**Validated with:** Statistical hypothesis testing on ROS2 bag data

[Read RQ3 Details →](docs/rq3-anomaly.md)

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         MISSION CONTROL                                  │
│                    (React/Vite Dashboard)                                │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐       │
│  │Fleet Status │ │  Research   │ │   Charts    │ │  Event Log  │       │
│  │   Widget    │ │   Metrics   │ │   Widget    │ │   Widget    │       │
│  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘ └──────┬──────┘       │
└─────────┼───────────────┼───────────────┼───────────────┼──────────────┘
          │               │               │               │
          ▼               ▼               ▼               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    CLOUDFLARE EDGE NETWORK                               │
│                                                                          │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────┐  │
│   │   Workers    │  │   D1 DB      │  │     R2       │  │ Durable  │  │
│   │   (API)      │  │  (SQLite)    │  │  (Storage)   │  │ Objects  │  │
│   └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └────┬─────┘  │
└──────────┼────────────────┼────────────────┼───────────────┼──────────┘
           │                │                │               │
           │           ┌────┴────┐           │               │
           └──────────►│  Sync   │◄──────────┘               │
                       │ Engine  │                           │
                       └────┬────┘                           │
                            │                                │
┌───────────────────────────┼────────────────────────────────┼──────────┐
│                           │                                │          │
│   ┌─────────────┐  ┌──────┴──────┐  ┌─────────────┐  ┌────┴────┐    │
│   │   AUV-1     │  │  Support    │  │   AUV-2     │  │  AUV-3  │    │
│   │  (Nautilus) │  │   Vessel    │  │   (Titan)   │  │ (Neptune)│   │
│   │             │  │   (Edge)    │  │             │  │         │    │
│   └─────────────┘  └─────────────┘  └─────────────┘  └─────────┘    │
│                                                                      │
│                    AUV FLEET (Iridium Satellite)                     │
└──────────────────────────────────────────────────────────────────────┘
```

### Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Frontend** | TypeScript, Vite, Chart.js | Mission Control dashboard |
| **Edge API** | Cloudflare Workers, Hono | Low-latency API endpoints |
| **State** | Durable Objects | Singleton federation coordinator |
| **Database** | Cloudflare D1 (SQLite) | Fleet state, anomalies, missions |
| **Storage** | Cloudflare R2 | ROS2 bag files, mission logs |
| **Federation** | Rust, Zenoh | Edge gateway on support vessel |
| **Detection** | Python, NumPy | CUSUM anomaly detection |

---

## 💼 For Different Users

### 👨‍🔬 For Research Scientists

**Your Goals:** Validate hypotheses, publish papers, ensure reproducibility

**Start Here:**
1. [Research Metrics Dashboard](https://abyssal-mission-control.pages.dev)
2. [RQ1 Validation Guide](docs/rq1-compression.md)
3. [Data Export Tutorial](docs/export-tutorial.md)

**Key Features:**
- One-click CSV export for statistical analysis
- Property-based test results with significance metrics
- Versioned datasets with DOI integration

### 👷‍♂️ For AUV Operators

**Your Goals:** Monitor fleet, respond to anomalies, ensure mission success

**Start Here:**
1. [Fleet Operations Guide](docs/operations.md)
2. [Alert Configuration](docs/alerts.md)
3. [Mobile Setup](docs/mobile.md)

**Key Features:**
- Real-time vehicle status with sub-second latency
- Critical alert notifications to mobile devices
- Mission replay and forensic analysis

### 👔 For Fleet Managers

**Your Goals:** Optimize costs, track KPIs, make data-driven decisions

**Start Here:**
1. [Executive Dashboard](https://abyssal-mission-control.pages.dev)
2. [Cost Optimization Guide](docs/costs.md)
3. [Performance Reports](docs/reports.md)

**Key Features:**
- Bandwidth usage tracking and optimization
- Fleet-wide coherence and performance metrics
- ROI calculator for fleet expansion

### 👨‍💻 For DevOps Engineers

**Your Goals:** Ensure uptime, debug issues, maintain infrastructure

**Start Here:**
1. [Infrastructure Guide](docs/infrastructure.md)
2. [Monitoring Setup](docs/monitoring.md)
3. [CI/CD Pipeline](.github/workflows/)

**Key Features:**
- Comprehensive logging and tracing
- Automated security scanning
- Blue-green deployment support

---

## 🤝 Contributing

We welcome contributions from the marine robotics community!

### Ways to Contribute

- 🐛 **Bug Reports** — [Open an issue](https://github.com/kakashi3lite/abyssal-twin/issues)
- 💡 **Feature Requests** — [Start a discussion](https://github.com/kakashi3lite/abyssal-twin/discussions)
- 🔧 **Code** — See [Contributing Guide](CONTRIBUTING.md)
- 📖 **Documentation** — Help improve our docs

### Development Setup

```bash
# Full development environment
git clone https://github.com/kakashi3lite/abyssal-twin.git
cd abyssal-twin

# Install all dependencies
make setup  # Installs Rust, Python, Node dependencies

# Run tests
make test   # Runs TypeScript, Rust, and Python tests

# Start development stack
make dev    # Starts Cloudflare dev server + simulation
```

---

## 📄 Citation

If you use Abyssal Twin in your research, please cite:

```bibtex
@software{abyssal_twin_2024,
  author = {Kakashi3},
  title = {Abyssal Twin: Federated Digital Twins for AUV Fleets},
  year = {2024},
  url = {https://github.com/kakashi3lite/abyssal-twin}
}
```

---

## 📜 License

Licensed under the Apache License 2.0. See [LICENSE](LICENSE) for details.

```
Copyright 2024 Kakashi3

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
```

---

<div align="center">

**[⬆ Back to Top](#-abyssal-twin)**

Built with ❤️ for the underwater robotics community

🌊 *Exploring the ocean, one bit at a time* 🌊

</div>
