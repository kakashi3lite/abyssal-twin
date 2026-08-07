# 📚 Abyssal Twin Documentation

Welcome to the Abyssal Twin documentation. Select your path:

---

## 🚀 Getting Started

New to Abyssal Twin? Start here.

- **[5-Minute Quick Start](quickstart.md)** — Get running locally
- **[Architecture Overview](architecture.md)** — Understand the system
- **[Deployment Guide](deployment/cloudflare-pages.md)** — Deploy to production

---

## 📊 Dashboard

The Mission Control dashboard is your window into fleet operations.

- **[Dashboard Overview](../mission-control/README.md)** — Features & capabilities
- **[User Guide](dashboard/user-guide.md)** — How to use each widget
- **[Customization](dashboard/customization.md)** — Tailor to your needs
- **[Mobile Setup](dashboard/mobile.md)** — Field operations

### Screenshots

- [Fleet Status Overview](screenshots/dashboard-overview.html)
- [Research Metrics](screenshots/research-metrics.html)

---

## 🔬 Research

Dissertation-grade validation for IoRT-DT.

- **[RQ1: Compression](rq1-compression.md)** — 12.4x compression ratio validation
- **[RQ2: Convergence](rq2-convergence.md)** — Partition recovery in <60s
- **[RQ3: Anomaly Detection](rq3-anomaly.md)** — CUSUM with ARL₀ >10,000
- **[Data Export](research/export.md)** — CSV/JSON for statistical analysis

---

## 💻 Development

Building on Abyssal Twin?

### Frontend
- [Mission Control](../mission-control/README.md) — Dashboard development
- [Component Library](development/components.md) — Reusable UI components
- [State Management](development/state.md) — Real-time data flow

### Backend
- [Cloudflare Workers](../cloudflare/README.md) — Edge API development
- [Durable Objects](development/durable-objects.md) — Federation coordinator
- [Database Schema](development/database.md) — D1 schema reference

### Edge Gateway
- [Rust Federation](../src/iort_dt_federation/README.md) — Edge gateway service
- [Zenoh Integration](development/zenoh.md) — DDS/ROS2 bridge
- [Deployment](deployment/edge-gateway.md) — Jetson/ARM64 deployment

### Research Modules
- [Python Anomaly Detection](../src/iort_dt_anomaly/README.md)
- [Simulation Setup](development/simulation.md) — Stonefish integration

---

## 🐳 Operations

Running Abyssal Twin in production?

- **[Docker Setup](../docker/README.md)** — Container deployment
- [Monitoring](operations/monitoring.md) — Metrics & alerting
- [Security](operations/security.md) — Threat model & hardening
- [Backup & Recovery](operations/backup.md) — Data protection
- [Troubleshooting](operations/troubleshooting.md) — Common issues

---

## 🎯 Use Cases

Tailored guides for different users.

### 👨‍🔬 Research Scientists
- [Academic Setup](users/researcher.md)
- [Reproducibility Guide](users/reproducibility.md)
- [Publication Checklist](users/publication.md)

### 👷‍♂️ AUV Operators
- [Operations Guide](users/operator.md)
- [Alert Configuration](users/alerts.md)
- [Mission Planning](users/mission-planning.md)

### 👔 Fleet Managers
- [Executive Dashboard](users/manager.md)
- [Cost Optimization](users/costs.md)
- [Performance Reports](users/reports.md)

### 👨‍💻 DevOps Engineers
- [Infrastructure](users/devops.md)
- [CI/CD Pipeline](users/cicd.md)
- [Security Audit](users/security-audit.md)

---

## 📖 Reference

Quick lookup information.

- [API Reference](api/reference.md) — REST & WebSocket endpoints
- [Environment Variables](api/environment.md)
- [Error Codes](api/errors.md)
- [Glossary](reference/glossary.md)

---

## 🤝 Contributing

Help improve Abyssal Twin.

- [Contributing Guide](../CONTRIBUTING.md)
- [Code Style](contributing/style.md)
- [Testing Guide](contributing/testing.md)
- [Documentation Standards](contributing/documentation.md)

---

## 📞 Support

Need help?

- 🐛 [Report a Bug](https://github.com/kakashi3lite/abyssal-twin/issues)
- 💡 [Request Feature](https://github.com/kakashi3lite/abyssal-twin/discussions)
- 📧 [Email Support](mailto:support@abyssal-twin.dev)

---

<div align="center">

**[⬅ Back to Main README](../README.md)**

</div>
