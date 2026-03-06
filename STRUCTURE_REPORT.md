# Structure Report - Ground Truth Analysis

**Date**: 2026-03-06  
**Repository**: abyssal-twin  
**Analysis Type**: Archaeological / Ground Truth

---

## Current State Assessment

### Repository Type
**Hybrid Research Code + Infrastructure**

The repository contains actual implementation code (not just documentation), but with significant gaps between documented features and reality.

---

## Build Systems Present

| System | Status | Location | Notes |
|--------|--------|----------|-------|
| **Cargo (Rust)** | ✅ ACTIVE | `src/iort_dt_federation/` | Fully configured, 468 lines of code |
| **Poetry (Python)** | ✅ ACTIVE | Root `pyproject.toml` | Configured but no lockfile |
| **CMake** | ❌ MISSING | N/A | Claimed for ROS2 but no CMakeLists.txt found |
| **Colcon** | ❌ MISSING | N/A | Referenced in docs but no ROS2 packages with package.xml |

### Cargo Analysis
- **Package**: `iort-dt-federation` v1.0.0
- **Lines of Code**: 468 (395 lib.rs + 73 main.rs)
- **Dependencies**: 11 crates (zenoh, tokio, serde, nalgebra, etc.)
- **Build Status**: Should compile (standard Rust project structure)

### Python Analysis
- **Lines of Code**: ~1,110
  - `detectors.py`: 490 lines (CUSUM/Shiryaev-Roberts anomaly detection)
  - `models.py`: 320 lines (Pose6D, state compression)
  - `rate_controller.py`: 300 lines (adaptive rate control)
- **Dependencies**: 10 packages (pydantic, numpy, scipy, fastavro, lz4, etc.)

---

## Docker Status

### What Exists
| Component | Status | Notes |
|-----------|--------|-------|
| `.devcontainer/Dockerfile` | ✅ | Ubuntu 24.04 + ROS2 Jazzy + Rust 1.75 |
| `docker/docker-compose.simulation.yml` | ✅ | Full orchestration defined |
| `docker/zenoh/acoustic.json5` | ✅ | Zenoh router config |

### What's MISSING (Critical Gap)
| Component | Claimed | Reality |
|-----------|---------|---------|
| `docker/stonefish/Dockerfile` | ✅ In README/build docs | ❌ NOT FOUND |
| `docker/ros2_workspace/Dockerfile` | ✅ In build plan | ❌ NOT FOUND |
| `src/iort_dt_federation/Dockerfile` | ✅ In build plan | ❌ NOT FOUND |
| `docker/observability/` | ✅ In build plan | ❌ NOT FOUND (only placeholder) |

**Impact**: The docker-compose.simulation.yml references services (stonefish-sim, ros2, federation) that require Dockerfiles that don't exist in the repository. The compose file cannot actually be used without creating these Dockerfiles first.

---

## Documentation Debt

### Claims vs Reality

| Feature | README Claim | Ground Truth | Status |
|---------|--------------|--------------|--------|
| Stonefish Simulator | "Integrated" | No Dockerfile, no integration code | ❌ MISSING |
| ROS2 Workspace | "Jazzy middleware" | No CMakeLists.txt, no ROS2 packages | ❌ MISSING |
| RQ1 Validation | "make test-rq1" | Test scripts exist but no validation data | ⚠️ INCOMPLETE |
| RQ2 Federation | "Gossip protocol" | ✅ Rust code exists and looks complete | ✅ EXISTS |
| RQ3 Anomaly Detection | "ARL bounds" | Python code exists, ~490 lines | ✅ EXISTS |
| RQ4 Security | "DDS-Security" | Governance template only, no implementation | ⚠️ SKELETON |
| Multi-arch Images | "amd64+arm64" | CI configured but no Dockerfiles to build | ❌ BLOCKED |
| Signed Images | "Cosign/SLSA L3" | CI configured but images can't build | ❌ BLOCKED |

---

## Discrepancies Found

### Critical Issues

1. **Docker Infrastructure Gap**
   - **Claim**: "Multi-stage Docker build for underwater robotics"
   - **Reality**: Only .devcontainer/Dockerfile exists; service Dockerfiles missing
   - **Impact**: `docker-compose up` will fail

2. **ROS2 Claims Unsubstantiated**
   - **Claim**: "ROS 2 Jazzy middleware"
   - **Reality**: No package.xml, no CMakeLists.txt, no ROS2 node code
   - **Impact**: ROS2 integration is aspirational, not implemented

3. **Test Infrastructure Incomplete**
   - **Claim**: "RQ1-RQ4 validation in CI"
   - **Reality**: CI workflows exist but reference Docker images that can't be built
   - **Impact**: CI will fail on build step

4. **Simulation Unrealized**
   - **Claim**: "Stonefish physics simulator integration"
   - **Reality**: No Stonefish-related code or configuration
   - **Impact**: Simulation claims are unsubstantiated

### Minor Issues

1. **Repository URL Mismatch**
   - README still points to `swanand-tanavade/iort-dt` in places
   - Actual repo is `kakashi3lite/abyssal-twin`

2. **Empty __init__.py Files**
   - Python packages have 0-byte __init__.py files (placeholders)

3. **Test Files Minimal**
   - Only 2 property test files exist; unit tests referenced in Makefile don't exist

---

## What Actually Works Now

### Immediate Build (No Docker Required)
```bash
# Rust federation - WILL COMPILE
cd src/iort_dt_federation
cargo build --release
cargo test
```

### Python Installation (Poetry)
```bash
# Python packages - WILL INSTALL
poetry install
# But imports may fail due to missing dependencies
```

### Dev Container (VS Code)
```bash
# .devcontainer/Dockerfile - WILL BUILD
# Provides Ubuntu 24.04 + ROS2 + Rust environment
# But ROS2 has no actual packages to build
```

---

## File Inventory Summary

### Source Code
- **Rust**: 2 files, 468 lines (COMPLETE)
- **Python**: 5 files, 1,110 lines (COMPLETE but __init__.py empty)

### Configuration
- **Docker**: 1 compose file, 1 devcontainer Dockerfile (INCOMPLETE)
- **CI/CD**: 3 workflows (COMPLETE but will fail without Dockerfiles)
- **Docs**: 4 markdown files (COMPLETE but aspirational)

### Tests
- **Property Tests**: 2 Python files (EXISTS)
- **Unit Tests**: Referenced but not found (MISSING)

---

## Honest Assessment

**Current State**: Pre-alpha research scaffold

**What Exists**:
- Working Rust federation layer with gossip protocol (RQ2)
- Working Python anomaly detection with CUSUM (RQ3)
- Working Python compression models (RQ1)
- Dev container setup
- Comprehensive CI/CD pipeline configuration
- Documentation and project structure

**What's Missing**:
- Docker service images (can't run full stack)
- ROS2 integration (CMake, package.xml, nodes)
- Stonefish simulator connection
- RQ4 implementation beyond templates
- Working `docker-compose up`

**Verdict**: The research code (Rust + Python) is real and substantial (~1,578 lines). The infrastructure scaffolding is extensive but non-functional due to missing Dockerfiles. The README claims full system integration that doesn't exist.

---

*Report generated by ground-truth archaeological analysis*
