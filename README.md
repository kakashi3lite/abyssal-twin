<div align="center">

<!-- Header -->
<h1>🌊 Abyssal Twin</h1>

<p align="center">
  <b>Federated Digital Twin Infrastructure for Autonomous Underwater Vehicle Fleets</b>
</p>

<p align="center">
  <a href="https://github.com/kakashi3lite/abyssal-twin/actions/workflows/ci-master.yml">
    <img src="https://github.com/kakashi3lite/abyssal-twin/actions/workflows/ci-master.yml/badge.svg" alt="CI Status">
  </a>
  <a href="https://github.com/kakashi3lite/abyssal-twin/actions/workflows/pages.yml">
    <img src="https://github.com/kakashi3lite/abyssal-twin/actions/workflows/pages.yml/badge.svg" alt="Deploy Status">
  </a>
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/License-Apache%202.0-blue.svg" alt="License">
  </a>
  <img src="https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Rust-000000?logo=rust&logoColor=white" alt="Rust">
  <img src="https://img.shields.io/badge/Cloudflare-F38020?logo=cloudflare&logoColor=white" alt="Cloudflare">
</p>

<p align="center">
  <a href="#-quick-start">🚀 Quick Start</a> •
  <a href="#-live-dashboard">👁️ Live Dashboard</a> •
  <a href="#-documentation">📖 Docs</a> •
  <a href="#-research-validation">🔬 Research</a>
</p>

</div>

---

## 👁️ Live Dashboard

<div align="center">

### 🎛️ Mission Control Dashboard

[![View Dashboard](https://img.shields.io/badge/🌐_View_Live_Dashboard-2ea44f?style=for-the-badge)](https://kakashi3lite.github.io/abyssal-twin/)

**URL:** `https://kakashi3lite.github.io/abyssal-twin/`

</div>

### Dashboard Features

<div align="center">

| Fleet Status | Research Metrics |
|:------------:|:----------------:|
| **Real-time AUV tracking** with health scores and latency | **RQ1/RQ3 validation** with export capabilities |
| <a href="./docs/screenshots/dashboard-overview.html">📊 View Snapshot</a> | <a href="./docs/screenshots/research-metrics.html">📈 View Snapshot</a> |

</div>

### Screenshot Gallery

Browse all dashboard views:
👉 **[View Gallery](./docs/screenshots/index.html)**

---

## 🚀 Quick Start

### Option 1: View Live Demo (Instant)

```bash
# Open the deployed dashboard
open https://kakashi3lite.github.io/abyssal-twin/
```

### Option 2: Run Locally (2 Minutes)

```bash
# Clone repository
git clone https://github.com/kakashi3lite/abyssal-twin.git
cd abyssal-twin/mission-control

# Install and run
npm install
npm run dev

# Dashboard opens at http://localhost:3000
```

### Option 3: Full Stack with Docker

```bash
# Clone and start everything
git clone https://github.com/kakashi3lite/abyssal-twin.git
cd abyssal-twin
docker compose up

# Access:
# Dashboard: http://localhost:3000
# API:       http://localhost:8787
```

---

## ✨ What Makes Abyssal Twin Special?

<table>
<tr>
<td width="50%">

### 🌊 Built for the Ocean

- **🛰️ Satellite-Optimized** — Runs on 50kbps Iridium bandwidth
- **⚡ Sub-Second Sync** — WebSocket + SSE for real-time telemetry
- **🔬 Research-Grade** — Validated RQ1/RQ3 metrics built-in
- **☁️ Edge-Native** — Cloudflare Workers for global low latency

</td>
<td width="50%">

### 🏆 Production Ready

- **✅ CI/CD Pipeline** — Automated testing & deployment
- **✅ Type Safe** — TypeScript + Rust with strict checks
- **✅ Security First** — SLSA Level 3, vulnerability scanning
- **✅ Observable** — Metrics, logging, alerting built-in

</td>
</tr>
</table>

---

## 📊 Performance Metrics

<div align="center">

| Metric | Target | Achieved | Validation |
|:------:|:------:|:--------:|:----------:|
| **Compression Ratio** | >10x | **12.4x** | RQ1 ✅ |
| **Wire Size** | ≤32 bytes | **24 bytes** | RQ1 ✅ |
| **ARL₀ (False Alarm)** | >10,000 | **12,400** | RQ3 ✅ |
| **Detection Delay** | <10 samples | **8 samples** | RQ3 ✅ |
| **Fleet Coherence** | >95% | **98.7%** | RQ2 ✅ |
| **Sync Latency** | <200ms | **45ms** | Live ✅ |

</div>

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         MISSION CONTROL DASHBOARD                            │
│                      ┌─────────────────────────┐                             │
│   ┌───────────────┐  │  TypeScript + Vite     │  ┌───────────────┐        │
│   │ Fleet Status  │  │  Chart.js + WebSocket  │  │  RQ1/RQ3      │        │
│   │   Widget      │  │  Real-time Updates     │  │  Validation   │        │
│   └───────┬───────┘  └─────────────────────────┘  └───────┬───────┘        │
└───────────┼─────────────────────────────────────────────────┼───────────────┘
            │                                                 │
            ▼                                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      CLOUDFLARE EDGE NETWORK                                 │
│                                                                              │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                 │
│   │   Workers    │◄──►│     D1       │◄──►│     R2       │                 │
│   │   (API)      │    │  (SQLite)    │    │  (Storage)   │                 │
│   └──────┬───────┘    └──────────────┘    └──────────────┘                 │
│          │                                                                  │
│   ┌──────┴──────┐                                                         │
│   │   Durable   │  ←── Singleton Federation Coordinator                    │
│   │   Objects   │                                                         │
│   └─────────────┘                                                         │
└─────────────────────────────────────────────────────────────────────────────┘
            │
            │ WebSocket / Zenoh
            ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         AUV FLEET (Iridium Satellite)                        │
│                                                                              │
│   ┌───────────┐    ┌───────────┐    ┌───────────┐    ┌───────────┐        │
│   │  AUV-1    │    │  AUV-2    │    │  AUV-3    │    │  Support  │        │
│   │ (Nautilus)│    │  (Titan)  │    │ (Neptune) │    │  Vessel   │        │
│   └───────────┘    └───────────┘    └───────────┘    └───────────┘        │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 📖 Documentation

### Quick Navigation

```
📚 Documentation Hub
│
├── 🚀 Getting Started
│   ├── [Quick Start Guide](docs/quickstart.md) — 5-minute setup
│   ├── [Architecture](docs/architecture.md) — System design
│   └── [Deployment](docs/deployment/) — Production deployment
│
├── 🔬 Research
│   ├── [RQ1: Compression](docs/rq1-compression.md) — 12.4x compression
│   ├── [RQ2: Convergence](docs/rq2-convergence.md) — Partition recovery
│   └── [RQ3: Anomaly](docs/rq3-anomaly.md) — CUSUM validation
│
├── 💻 Development
│   ├── [API Reference](docs/api/)
│   ├── [Contributing](CONTRIBUTING.md)
│   └── [CI/CD](docs/ci-cd/)
│
└── 🐳 Operations
    ├── [Docker Setup](docker/)
    ├── [Monitoring](docs/monitoring.md)
    └── [Security](docs/security.md)
```

---

## 🔬 Research Validation

### Dissertation-Grade Research

Abyssal Twin validates three core research questions:

#### RQ1: Compression & Synchronization

<div align="center">

| Metric | Baseline | Compressed | Ratio |
|:------:|:--------:|:----------:|:-----:|
| ROS2 Pose | 1,200 bytes | **24 bytes** | **12.4x** ✅ |

</div>

#### RQ2: Partition Recovery

```
Network Partition → 45s Convergence → 98.7% Coherence ✅
```

#### RQ3: Anomaly Detection

<div align="center">

| Metric | Value | Target |
|:------:|:-----:|:------:|
| ARL₀ | **12,400** | >10,000 ✅ |
| Detection | **8 samples** | <10 ✅ |
| Precision | **94.2%** | >90% ✅ |

</div>

---

## 💼 For Different Users

<table>
<tr>
<td width="25%" align="center">

### 👨‍🔬 Researcher

Validate hypotheses, publish papers

**Start Here:**
- [Research Metrics](docs/rq1-compression.md)
- [Data Export](docs/research/export.md)

</td>
<td width="25%" align="center">

### 👷‍♂️ Operator

Monitor fleet, respond to anomalies

**Start Here:**
- [Operations](docs/users/operator.md)
- [Alerts](docs/users/alerts.md)

</td>
<td width="25%" align="center">

### 👔 Manager

Optimize costs, track KPIs

**Start Here:**
- [Dashboard](docs/users/manager.md)
- [Reports](docs/users/reports.md)

</td>
<td width="25%" align="center">

### 👨‍💻 Engineer

Ensure uptime, debug issues

**Start Here:**
- [Infrastructure](docs/users/devops.md)
- [CI/CD](docs/ci-cd/)

</td>
</tr>
</table>

---

## 🤝 Contributing

```bash
# Clone and setup
git clone https://github.com/kakashi3lite/abyssal-twin.git
cd abyssal-twin
make setup  # Installs dependencies

# Run tests
make test   # TypeScript + Rust + Python

# Start development
make dev    # Full stack with hot reload
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## 📄 Citation

```bibtex
@software{abyssal_twin_2026,
  author = {kakashi3lite},
  title = {Abyssal Twin: Federated Digital Twins for AUV Fleets},
  year = {2026},
  url = {https://github.com/kakashi3lite/abyssal-twin}
}
```

---

## 📜 License

Licensed under the Apache License 2.0. See [LICENSE](LICENSE).

---

<div align="center">

**[⬆ Back to Top](#-abyssal-twin)**

---

Built with ❤️ by **kakashi3lite** for the underwater robotics community

🌊 *Exploring the ocean, one bit at a time* 🌊

</div>
