# abyssal-twin

> **Current Status**: Pre-alpha research implementation  
> **Working Components**: RQ2 (Federation), RQ1/RQ3 (Python modules)  
> **Not Yet Functional**: Full Docker stack, ROS2 integration, Stonefish simulation

Research implementation of federated digital twins for autonomous underwater vehicle (AUV) fleets. This repository contains working research code for RQ1-RQ3, with CI/CD infrastructure configured but pending Docker completion for full system integration.

---

## What Exists Now (Ground Truth)

### ✅ Implemented & Working

**RQ2: Federated Coordination (Rust)**
- Location: `src/iort_dt_federation/`
- Size: ~470 lines of production Rust
- Features:
  - Gossip-based anti-entropy protocol
  - Vector clock causality tracking  
  - Weighted Kalman reconciliation
  - Zenoh P2P networking
- Build: `cargo build --release` (works now)
- Test: `cargo test` (works now)

**RQ3: Anomaly Detection (Python)**
- Location: `src/iort_dt_anomaly/`
- Size: ~490 lines
- Features:
  - CUSUM (Page-Hinkley) sequential detector
  - Shiryaev-Roberts Bayesian detector
  - Formal ARL (Average Run Length) bounds
- Install: `poetry install` (works now)

**RQ1: State Compression (Python)**
- Location: `src/iort_dt_compression/`
- Size: ~620 lines
- Features:
  - Pose6D compression (mm/millidegree resolution)
  - Avro + LZ4 serialization
  - Adaptive rate controller
- Install: `poetry install` (works now)

**Development Environment**
- `.devcontainer/Dockerfile` - Ubuntu 24.04 + ROS2 Jazzy + Rust 1.75
- VS Code devcontainer support
- GitHub Actions CI configured (lint, test, security scan)

### 🚧 Work in Progress

**Docker Infrastructure**
- Docker Compose orchestration defined (`docker/docker-compose.simulation.yml`)
- Missing: Service-specific Dockerfiles for:
  - Stonefish simulator
  - ROS2 workspace
  - Federation service
- Status: CI configured but builds will fail until Dockerfiles added

**ROS2 Integration**
- Dev container has ROS2 Jazzy installed
- Missing: Actual ROS2 packages (no CMakeLists.txt, no package.xml)
- Status: Infrastructure ready, implementation pending

**RQ4: Security**
- Certificate generation scripts exist
- DDS-Security governance template exists
- Missing: Actual security integration testing

### 📋 Planned (Not Yet Implemented)

- Stonefish physics simulator integration
- Hardware-in-the-loop validation
- Multi-arch Docker images (arm64 for Jetson)
- Signed container images (SLSA L3 - CI ready, needs working builds)

---

## Repository Structure (Actual)

```
abyssal-twin/
├── src/
│   ├── iort_dt_federation/     # ✅ Rust - WORKING
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs          # Gossip protocol (395 lines)
│   │       └── main.rs         # Binary entry (73 lines)
│   ├── iort_dt_anomaly/        # ✅ Python - WORKING
│   │   └── iort_dt_anomaly/
│   │       ├── __init__.py
│   │       └── detectors.py    # CUSUM/S-R (490 lines)
│   └── iort_dt_compression/    # ✅ Python - WORKING
│       └── iort_dt_compression/
│           ├── __init__.py
│           ├── models.py       # State vectors (320 lines)
│           └── rate_controller.py  # Adaptive control (300 lines)
├── docker/
│   ├── docker-compose.simulation.yml  # ⚠️ References non-existent Dockerfiles
│   └── zenoh/
│       └── acoustic.json5      # Zenoh router config
├── .devcontainer/
│   └── Dockerfile              # ✅ Dev environment
├── .github/
│   └── workflows/              # ✅ CI configured (may fail on Docker builds)
│       ├── ci.yml
│       ├── provenance.yml
│       └── rq-validation.yml
├── tests/
│   └── property/               # ✅ Property-based tests exist
├── experiments/
│   └── rq1_sync_tradeoff/      # ⚠️ Skeleton only
├── docs/                       # 📄 Documentation
├── pyproject.toml              # ✅ Poetry config
└── README.md                   # 📄 This file
```

---

## Quick Start (Verified Working)

### Prerequisites
- Rust 1.75+ (for federation)
- Python 3.12 + Poetry (for anomaly/compression)
- Docker Desktop (optional - for dev container only)

### 1. Build Federation Node (Rust)

```bash
cd src/iort_dt_federation
cargo build --release
./target/release/iort-federation --version
```

### 2. Test Federation

```bash
cargo test
```

### 3. Install Python Modules

```bash
# From repository root
poetry install

# Test import
poetry run python -c "from iort_dt_anomaly.detectors import CUSUMDetector; print('OK')"
```

### 4. Launch Dev Container (Optional)

```bash
# VS Code: "Reopen in Container"
# Or manually:
docker build -f .devcontainer/Dockerfile -t abyssal-dev .
docker run -it -v $(pwd):/workspace abyssal-dev bash
```

### 5. Docker Compose (NOT YET WORKING)

```bash
# ❌ This will fail - Dockerfiles missing
# docker-compose -f docker/docker-compose.simulation.yml up

# ⏳ Coming in v0.2.0
```

---

## Research Questions (Current State)

| RQ | Status | Evidence |
|----|--------|----------|
| **RQ1**: Compression >10:1, F1>0.90 | 🟡 Partial | Python code exists, needs integration testing |
| **RQ2**: Federation convergence | 🟢 Working | Rust gossip protocol implemented and testable |
| **RQ3**: Anomaly detection ARL>10k | 🟡 Partial | CUSUM implemented, needs formal validation data |
| **RQ4**: DDS-Security <30s | 🔴 Missing | Templates only, no implementation |

---

## Development Roadmap

### v0.1.0-alpha (Current)
- [x] Rust federation layer (RQ2)
- [x] Python anomaly detection (RQ3)
- [x] Python compression (RQ1)
- [x] Dev container setup
- [x] CI/CD pipeline scaffold
- [ ] Docker service images ⚠️
- [ ] ROS2 integration ⚠️

### v0.2.0 (Next)
- [ ] Stonefish Dockerfile
- [ ] ROS2 workspace Dockerfile
- [ ] Federation service Dockerfile
- [ ] Working `docker-compose up`
- [ ] RQ1-RQ3 end-to-end validation

### v0.3.0 (Future)
- [ ] RQ4 security implementation
- [ ] Hardware-in-the-loop testing
- [ ] Multi-arch support (ARM64/Jetson)
- [ ] Signed container images

---

## CI/CD Status

| Workflow | Status | Notes |
|----------|--------|-------|
| `ci.yml` | 🟡 Partial | Lint and test work; Docker build will fail |
| `provenance.yml` | 🟡 Configured | Image signing ready; needs working images |
| `rq-validation.yml` | 🟡 Configured | Research gates defined; needs full stack |

See `.github/workflows/` for details. Note: Workflows reference Docker images that don't exist yet.

---

## Contributing

This is active research code. Expect breaking changes.

### What Works Now
- Rust development: `cargo build`, `cargo test`
- Python development: `poetry install`, `poetry run pytest`
- Dev container: Full environment for testing

### What's Needed
- Docker expertise (Stonefish, ROS2 packaging)
- ROS2 developers (node implementation, CMake setup)
- SRE help (completing Docker infrastructure)

See [STRUCTURE_REPORT.md](STRUCTURE_REPORT.md) for detailed ground-truth analysis.

---

## License

Apache 2.0 - See [LICENSE](LICENSE)

---

## Citation

```bibtex
@software{tanavade2026abyssal,
  author = {Tanavade, Swanand},
  title = {abyssal-twin: Federated Digital Twins for AUV Fleets},
  year = {2026},
  url = {https://github.com/kakashi3lite/abyssal-twin}
}
```

---

*Last updated: 2026-03-06 | Ground truth documentation - claims verified against actual files*
