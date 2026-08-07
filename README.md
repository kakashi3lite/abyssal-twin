<div align="center">

# 🌊 Abyssal Twin

**Federated Digital Twin Infrastructure for Autonomous Underwater Exploration**

[![Build](https://img.shields.io/badge/build-passing-success?style=for-the-badge&logo=github-actions&logoColor=white)](https://github.com/kakashi3lite/abyssal-twin/actions)[![Production](https://img.shields.io/badge/Production-Live%20Worker-00e5ff?style=for-the-badge&logo=cloudflare&logoColor=white)](https://abyssal-twin.swanandtanavade100.workers.dev/)[![Live Demo](https://img.shields.io/badge/Live%20Demo-▶-blue?style=for-the-badge&logo=github&logoColor=white)](https://kakashi3lite.github.io/abyssal-twin/)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue?style=for-the-badge&logo=apache&logoColor=white)](./LICENSE)

<img src="https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&style=flat-square" alt="TypeScript">
<img src="https://img.shields.io/badge/Rust-1.85-DEA584?logo=rust&style=flat-square" alt="Rust">
<img src="https://img.shields.io/badge/Python-3.12-3776AB?logo=python&style=flat-square" alt="Python">
<img src="https://img.shields.io/badge/React-18-61DAFB?logo=react&style=flat-square" alt="React">
<img src="https://img.shields.io/badge/Tailwind-3.4-06B6D4?logo=tailwindcss&style=flat-square" alt="Tailwind">

<br>

[🚀 Production Dashboard](https://abyssal-twin.swanandtanavade100.workers.dev/) • 
[🌐 Access-Protected](https://abyssal-twin.dalecabra.com/) • 
[🕹️ GitHub Pages Demo](https://kakashi3lite.github.io/abyssal-twin/) • 
[📖 Documentation](./docs) • 
[🔧 API Reference](#api-reference) • 
[📊 Metrics](#research-foundations)

</div>

---

<div align="center">

### ✨ [Experience the Live Demo](https://kakashi3lite.github.io/abyssal-twin/)

*Watch autonomous underwater vehicles navigate the abyss in real-time*

</div>

---

## 📋 Table of Contents

- [Overview](#-overview)
- [Live Dashboard](#-live-dashboard)
- [Quick Start](#-quick-start)
- [Architecture](#-architecture)
- [Capabilities](#-capabilities)
- [Research Foundations](#-research-foundations)
- [API Reference](#-api-reference)
- [Development](#-development)
- [License](#-license)

---

## 🎯 Overview

> *"Where others see only darkness and pressure, we see data and possibility."*

Abyssal Twin orchestrates fleets of autonomous underwater vehicles (AUVs) through Earth's most challenging communication environments. Operating at abyssal depths—where satellite signals cannot penetrate and acoustic bandwidth is measured in bytes—our platform maintains continuous situational awareness through an elegant federation of edge intelligence, predictive analytics, and gossamer-light state synchronization.

```mermaid
%%{init: {'theme': 'dark'}}%%
graph LR
    A[🤖 AUV Fleet<br/><small>Stonefish + ROS 2</small>] -->|"📡 Zenoh P2P<br/>47-byte packets"| B[🚢 Edge Gateway<br/><small>Rust + SQLite</small>]
    B -->|"☁️ HTTPS + zstd"| C[⚡ Cloudflare Worker<br/><small>Hono + Durable Objects</small>]
    C -->|"📊 WebSocket / SSE"| D[🖥️ Mission Control<br/><small>React + Mapbox</small>]
    C -.->|"🎮 /api/v1/simulate"| D

    style A fill:#1a2332,stroke:#64d2ff,stroke-width:2px,color:#e0e6ed
    style B fill:#1a2332,stroke:#4ade80,stroke-width:2px,color:#e0e6ed
    style C fill:#1a2332,stroke:#fbbf24,stroke-width:2px,color:#e0e6ed
    style D fill:#1a2332,stroke:#f87171,stroke-width:2px,color:#e0e6ed
```

---

## 🚀 Live Dashboard

<div align="center">

[![Dashboard Preview](https://img.shields.io/badge/🌊%20Open%20Enterprise%20Dashboard-007ACC?style=for-the-badge&logo=github&logoColor=white&labelColor=0a0e27)](https://kakashi3lite.github.io/abyssal-twin/)

<br>

🔗 **Production (Cloudflare Worker + Access):** https://abyssal-twin.dalecabra.com
🔗 **Direct (workers.dev):** https://abyssal-twin.swanandtanavade100.workers.dev
🔗 **Research demo (GitHub Pages):** https://kakashi3lite.github.io/abyssal-twin/

<br>

| Feature | Description | Status |
|---------|-------------|--------|
| 🗺️ **Global Fleet Map** | Real-time geospatial visualization (Mapbox GL) | ✅ Live |
| 🛡️ **Safety Engine** | Predictive Point-of-No-Return calculations | ✅ Live |
| 📼 **Mission Replay** | Black-box forensics with timeline scrubbing | ✅ Live |
| 🦀 **Rust-WASM Engine** | Browser-side Kalman / CUSUM / PNR / 47-byte decode | ✅ Live |
| 📊 **Fleet Analytics** | Live telemetry & health monitoring | ✅ Live |

</div>

> 💡 **Tip**: The production dashboard streams the live fleet via SSE behind
> Cloudflare Access (single sign-on). The GitHub Pages mirror runs in demo
> mode with synthetic abyssal missions — no hardware required.

---

## 🏃 Quick Start

Choose your path:

<details>
<summary><b>🐳 Full Stack (Docker)</b> — Complete simulation environment</summary>

```bash
git clone https://github.com/kakashi3lite/abyssal-twin.git
cd abyssal-twin

# Orchestrate the full stack
docker compose -f docker/docker-compose.simulation.yml up

# In a second terminal, awaken the dashboard
cd mission-control
npm install
npm run dev  # http://localhost:3000
```
</details>

<details>
<summary><b>⚡ Dashboard Only</b> — Frontend with synthetic data</summary>

```bash
cd mission-control
npm install
npm run dev  # Auto-activates demo mode
```
</details>

<details>
<summary><b>🔧 Backend + Frontend</b> — Local API integration</summary>

```bash
# Terminal 1 — Edge infrastructure
cd cloudflare
npm install
npx wrangler dev  # http://localhost:8787

# Terminal 2 — Mission Control
cd mission-control
npm install
VITE_API_BASE=http://localhost:8787 npm run dev
```
</details>

---

## 🏛️ Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLOUD TIER                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    ☁️ Cloudflare Workers                             │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────────┐  │    │
│  │  │   Hono API  │  │   Durable   │  │   Simulation Engine         │  │    │
│  │  │   Routes    │  │   Objects   │  │   (Abyssal Physics)         │  │    │
│  │  └─────────────┘  └─────────────┘  └─────────────────────────────┘  │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                                      ▲
                                      │ HTTPS / WebSocket
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           EDGE TIER (Vessel)                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                        🚢 Rust Gateway                               │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────────┐  │    │
│  │  │   Zenoh     │  │   SQLite    │  │   Sync Engine               │  │    │
│  │  │   Bridge    │  │   Cache     │  │   (Offline-capable)         │  │    │
│  │  └─────────────┘  └─────────────┘  └─────────────────────────────┘  │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                                      ▲
                                      │ Acoustic / Optical
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            FLEET TIER (AUV)                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                         🤖 AUV Fleet                                 │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────────┐  │    │
│  │  │   Gossip    │  │   CUSUM     │  │   47-byte Pose6D            │  │    │
│  │  │  Protocol   │  │  Detection  │  │   Compression               │  │    │
│  │  └─────────────┘  └─────────────┘  └─────────────────────────────┘  │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Module Structure

| Module | Technology | Purpose |
|--------|-----------|---------|
| `cloudflare/` | TypeScript/Hono | Cloud edge functions & API |
| `edge-gateway/` | Rust | Vessel-side protocol bridge |
| `mission-control/` | React/TypeScript | Human interface |
| `src/iort_dt_federation/` | Rust | AUV gossip protocol |
| `src/iort_dt_anomaly/` | Python | CUSUM detection |
| `src/iort_dt_compression/` | Python | State compression |

---

## 🎨 Capabilities

<div align="center">

### The Art of Subsea Telemetry

</div>

#### 🗜️ Compression as Poetry
Where others see constraints, we find elegance. A complete AUV state vector travels in **47 bytes**.

```
┌────────────────────────────────────────────────────────────┐
│  ROS2 Baseline: 1,200 bytes                                │
│  Abyssal Twin:     47 bytes  ← 25.5× reduction             │
│                                                            │
│  [████████████] 1,200 B  vs  [█] 47 B                      │
└────────────────────────────────────────────────────────────┘
```

#### 🔄 Resilience Through Federation
When acoustic modems fall silent, our gossip protocol ensures **no vessel drifts into oblivion**.

| Metric | Target | Achieved |
|--------|--------|----------|
| Partition Recovery | <60s | **8–20s measured** ✅ (RQ2 sim, all loss levels) |
| Fleet Coherence | >95% | **99.7% @30% loss / 96% @50%** ✅ (measured; ~85% @70% loss — channel physics) |

#### 🔮 Foresight in the Deep
CUSUM anomaly detection grants operators **<90s detection latency** with **ARL₀ > 12,400**.

---

## 📊 Research Foundations

<div align="center">

| RQ | Research Question | Target | Achieved | Status |
|----|-------------------|--------|----------|--------|
| **RQ1** | Wire compression ratio | >10× | **25.5×** | ✅ |
| **RQ2** | Partition recovery time | <60s | **8–20s (measured)** | ✅ |
| **RQ2** | State coherence | >95% | **99.7% @30% loss (measured)** | ✅ |
| **RQ3** | False alarm rate | >10,000 | **12,400** | ✅ |
| **RQ3** | Detection latency | <120s | **<90s** | ✅ |

</div>

> **Empirical validation contract** — every headline number is *measured*, not
> asserted. RQ2 (partition recovery + coherence) is validated by driving the
> real federation algorithm over a Markov packet-loss channel with partition +
> heal (`experiments/rq2_federation/`, deterministic seed 42 — see `results.json`);
> RQ3's ARL₀ was empirically recalibrated to `h=10.5` via 10K-run Monte Carlo
> (`scripts/attacks/validate_arl0_montecarlo.py`). No figure in this README is
> hardcoded without a reproducing experiment.

---

## 🔌 API Reference

### REST Endpoints

```http
GET  /api/v1/health              → Service health (public)
GET  /                          → Mission Control dashboard (static assets)
GET  /api/v1/simulate           → SSE stream (simulated fleet)
GET  /api/v1/fleet/stream       → SSE stream (live fleet, auth)
GET  /ws/live                   → WebSocket (federation, auth)
GET  /api/v1/fleet/status       → Fleet snapshot (auth)
POST /api/v1/ingest             → Edge batch upload (service token)
GET  /api/v1/anomalies          → Anomaly history (auth)
GET  /api/v1/export/summary     → Research metrics (auth)
```

### Environment Configuration

The dashboard is served from the SAME origin as the API (worker `[assets]`
binding), so the defaults are same-origin (relative URLs) — the Cloudflare
Access cookie flows automatically. Override only when self-hosting elsewhere.

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_BASE` | *(empty — same origin)* | REST API base |
| `VITE_WS_URL` | `/ws/live` | WebSocket endpoint |
| `VITE_SSE_URL` | `/api/v1/fleet/stream` | SSE stream |
| `VITE_MAPBOX_TOKEN` | — | Geospatial visualization |

---

## 🚀 Deployment

### Production — Cloudflare Worker + Mission Control assets (canonical)

The dashboard and API are deployed as a single Cloudflare Worker. The React
Mission Control build is served by the worker's `[assets]` binding from the
**same Access-protected origin** as the API — one origin, one cookie, zero CORS.

**Live:**
- Direct: https://abyssal-twin.swanandtanavade100.workers.dev
- Access-protected (SSO): https://abyssal-twin.dalecabra.com
- Health: `GET /api/v1/health`

**Deploy (GitHub Actions → `deploy.yml`):**
```bash
# Required repo secrets (Settings → Secrets → Actions):
gh secret set CLOUDFLARE_API_TOKEN   # Cloudflare API token (Edit Cloudflare Workers)
gh secret set CLOUDFLARE_ACCOUNT_ID  # Cloudflare account ID
gh secret set VITE_MAPBOX_TOKEN      # Mapbox public token
# Deploy on push to main (manual approval for production):
wrangler deploy --env=production
wrangler d1 migrations apply abyssal-fleet --env=production
```

**Resources (verified live):** D1 `abyssal-fleet` (migrations 0001–0003),
R2 `abyssal-missions`, Durable Object `FederationCoordinator`
(`new_sqlite_classes`), `INGEST_TOKEN` secret for the edge gateway.

### GitHub Pages (research demo)

The dashboard auto-builds to GitHub Pages on push to `main` for a hardware-free
synthetic demo (no backend — runs in simulation mode):

🔗 https://kakashi3lite.github.io/abyssal-twin/

> ⚠️ The standalone Cloudflare **Pages** deployment is deprecated: a Pages
> bundle cannot reach the API (CORS is locked to the Access origin) and the
> old baked base (`api.abyssal-twin.dev`) is NXDOMAIN. The worker-assets
> deployment above is the single canonical path.

---

## 🛠️ Development

### Prerequisites

- Node.js 20+
- Rust 1.85+
- Python 3.12+
- Docker (optional)

### Local Development

```bash
# Clone repository
git clone https://github.com/kakashi3lite/abyssal-twin.git
cd abyssal-twin

# Install dependencies
cd mission-control && npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

### Telemetry Simulation

When `SimulationEngine` is active, sensors produce:

| Field | Range | Behavior |
|-------|-------|----------|
| Depth | 3,000–3,050 m | ±25m sinusoidal oscillation |
| Pressure | ~300–305 bar | 1 bar ≈ 10m seawater |
| Battery | 100% → 0% | ~8 hour mission life |
| Heading | 0–360° | Lawnmower survey patterns |

---

## 📜 License

<div align="center">

**Apache License 2.0**

Copyright 2025 Swanand Tanavade (kakashi3lite)

[![License](https://img.shields.io/badge/Read%20Full%20License-Apache%202.0-blue?style=flat-square)](./LICENSE)

</div>

```
Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```

---

<div align="center">

### Acknowledgments

*To the oceanographers who venture into darkness, the engineers who build vessels of curiosity, and the operators who guide them home—this work is dedicated to your pursuit of understanding the unknown.*

---

**[🌊 Launch Dashboard](https://kakashi3lite.github.io/abyssal-twin/)** • **[📖 Documentation](./docs)** • **[🐛 Issues](https://github.com/kakashi3lite/abyssal-twin/issues)**

<br>

*Per aspera ad abyssum.*

</div>
