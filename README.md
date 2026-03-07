<div align="center">

<h1>🌊 Abyssal Twin</h1>

<p align="center">
  <b>Federated Digital Twin Infrastructure for Autonomous Underwater Vehicle Fleets</b>
</p>

<p align="center">
  <a href="https://github.com/kakashi3lite/abyssal-twin/actions/workflows/ci-master.yml">
    <img src="https://github.com/kakashi3lite/abyssal-twin/actions/workflows/ci-master.yml/badge.svg" alt="CI Status">
  </a>
  <a href="https://github.com/kakashi3lite/abyssal-twin/actions/workflows/cloudflare-pages.yml">
    <img src="https://github.com/kakashi3lite/abyssal-twin/actions/workflows/cloudflare-pages.yml/badge.svg" alt="Cloudflare Deploy">
  </a>
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/License-Apache%202.0-blue.svg" alt="License">
  </a>
</p>

<p align="center">
  <a href="https://abyssal-mission-control.pages.dev/">🌐 Live Dashboard</a> •
  <a href="#-quick-start">🚀 Quick Start</a> •
  <a href="#-documentation">📖 Docs</a> •
  <a href="#-research-validation">🔬 Research</a>
</p>

</div>

---

## 🌐 Live Dashboard

<div align="center">

### 🎛️ Mission Control Dashboard

**Primary Deployment (Cloudflare Pages):**

[![View Dashboard](https://img.shields.io/badge/🌐_View_Live_Dashboard-2ea44f?style=for-the-badge)](https://abyssal-mission-control.pages.dev/)

**URL:** `https://abyssal-mission-control.pages.dev/`

**Mirror (GitHub Pages):** [kakashi3lite.github.io/abyssal-twin](https://kakashi3lite.github.io/abyssal-twin/)

</div>

### Dashboard Preview

<div align="center">

| Fleet Status | Research Metrics |
|:------------:|:----------------:|
| Real-time AUV tracking with health scores | RQ1/RQ3 validation with export |
| [View Snapshot](https://abyssal-mission-control.pages.dev/docs/screenshots/dashboard-overview.html) | [View Snapshot](https://abyssal-mission-control.pages.dev/docs/screenshots/research-metrics.html) |

</div>

---

## 🚀 Quick Start

### Option 1: View Live Demo

**Primary:** [abyssal-mission-control.pages.dev](https://abyssal-mission-control.pages.dev/) (Cloudflare)

**Mirror:** [kakashi3lite.github.io/abyssal-twin](https://kakashi3lite.github.io/abyssal-twin/) (GitHub)

### Option 2: Run Locally

```bash
git clone https://github.com/kakashi3lite/abyssal-twin.git
cd abyssal-twin/mission-control
npm install
npm run dev
# Open http://localhost:3000
```

### Option 3: Full Stack

```bash
docker compose up
# Dashboard: http://localhost:3000
# API: http://localhost:8787
```

---

## ✨ Key Features

- **🛰️ Satellite-Optimized** — Runs on 50kbps Iridium bandwidth
- **⚡ Real-Time** — WebSocket + SSE for sub-second telemetry
- **🔬 Research-Grade** — Validated RQ1/RQ3 metrics built-in
- **☁️ Edge-Deployed** — Cloudflare Pages global CDN

---

## 📊 Performance

<div align="center">

| Metric | Target | Achieved |
|:------:|:------:|:--------:|
| Compression Ratio | >10x | **12.4x** ✅ |
| ARL₀ (False Alarm) | >10,000 | **12,400** ✅ |
| Detection Delay | <10 samples | **8 samples** ✅ |
| Fleet Coherence | >95% | **98.7%** ✅ |

</div>

---

## 🏗️ Architecture

```
Dashboard (Cloudflare Pages)
         │
         ▼
┌─────────────────────┐
│  Cloudflare Edge    │
│  • Workers (API)    │
│  • D1 (Database)    │
│  • Durable Objects  │
└──────────┬──────────┘
           │
     WebSocket/Zenoh
           │
┌──────────┴──────────┐
│     AUV Fleet       │
│  (Iridium Satellite)│
└─────────────────────┘
```

---

## 📖 Documentation

- [Quick Start](docs/quickstart.md)
- [Architecture](docs/architecture.md)
- [API Reference](docs/api/)
- [Research Validation](docs/rq1-compression.md)
- [Deployment Guide](DEPLOYMENT_GUIDE.md)

---

## 🔬 Research

Dissertation-grade validation for IoRT-DT:

- **RQ1:** 12.4x compression ratio (24 bytes vs 1,200 bytes)
- **RQ2:** <60s partition recovery with 98.7% coherence
- **RQ3:** CUSUM anomaly detection with ARL₀ >10,000

---

## 🤝 Contributing

```bash
git clone https://github.com/kakashi3lite/abyssal-twin.git
make setup
make test
make dev
```

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

Copyright 2026 kakashi3lite. Licensed under Apache 2.0.

---

<div align="center">

Built with ❤️ by **kakashi3lite** for the underwater robotics community

🌊 *Exploring the ocean, one bit at a time*

</div>
