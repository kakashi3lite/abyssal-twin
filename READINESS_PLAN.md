# Production Readiness Plan - abyssal-twin

**Date**: 2026-03-06  
**Current Status**: Pre-alpha (functional code, infrastructure gaps)  
**Target**: Production-ready for OCEANS 2027 + Defense Deployment

---

## Executive Summary

The repository is in **better shape than the README suggests**. There is:
- ~1,600 lines of working research code (Rust + Python)
- Comprehensive CI/CD infrastructure (SLSA L3)
- Strong documentation (DISCOVERY_REPORT.md exists)
- Poetry.lock present (416KB - full dependency resolution)

**Critical Path**: Merge Dependabot updates → Fix Docker gaps → Hardware validation

---

## Phase 1: Security & Dependencies (Week 1-2)

### 1.1 Merge Dependabot PRs (Priority: CRITICAL)

**7 Open PRs** - These fix the 3 HIGH vulnerabilities:

| PR | Package | Risk | Action |
|----|---------|------|--------|
| #7 | mlflow 2.22.4 → 3.5.0 | HIGH | **Review breaking changes** - Major version bump |
| #6 | nalgebra 0.33 → 0.34 | MEDIUM | Should be safe (math library) |
| #5 | bincode 1.3 → 3.0 | MEDIUM | **Breaking changes** - Serialization |
| #4 | thiserror 1.0 → 2.0 | LOW | Error handling, likely compatible |
| #3 | docker/setup-buildx-action v3→v4 | LOW | CI only |
| #2 | docker/setup-qemu-action v3→v4 | LOW | CI only |
| #1 | hadolint v3.1.0→v3.3.0 | LOW | Linting only |

**Merge Strategy**:
```bash
# Start with low-risk CI updates
gh pr merge 1 --auto  # hadolint
gh pr merge 2 --auto  # qemu
gh pr merge 3 --auto  # buildx

# Test Rust updates locally first
cd src/iort_dt_federation
cargo check  # with new deps
gh pr merge 4 --auto  # thiserror
gh pr merge 6 --auto  # nalgebra

# Careful review for breaking changes
cargo test  # after nalgebra update
gh pr merge 5 --auto  # bincode - check serialization still works

# Python - major version jump, test thoroughly
poetry run pytest tests/  # after mlflow update
gh pr merge 7 --auto  # mlflow
```

### 1.2 Verify Security Posture

After merges:
```bash
# Should show 0 vulnerabilities
cd /tmp/iort-analysis/iort-dt
git pull origin main
poetry install  # refresh lock
cargo audit     # Rust security check
```

---

## Phase 2: Infrastructure Completion (Week 3-4)

### 2.1 Create Missing Dockerfiles

Based on STRUCTURE_REPORT.md, these are MISSING:

**`docker/stonefish/Dockerfile`** (Complex - 20-30 min build):
```dockerfile
FROM ubuntu:24.04 as builder
RUN apt-get update && apt-get install -y \
    git cmake build-essential \
    libsdl2-dev libglm-dev libglew-dev \
    libopencv-dev libfreetype6-dev
RUN git clone --depth 1 https://github.com/patrickelectric/stonefish.git /tmp/stonefish
WORKDIR /tmp/stonefish/build
cmake .. -DCMAKE_BUILD_TYPE=Release
make -j$(nproc)
make install

FROM ubuntu:24.04
COPY --from=builder /usr/local/lib/libStonefish* /usr/local/lib/
COPY --from=builder /usr/local/include/Stonefish /usr/local/include/Stonefish/
RUN ldconfig
```

**`docker/ros2_workspace/Dockerfile`**:
```dockerfile
FROM iort-dt:base
# ROS2 already in base image
# Copy and build workspace
COPY src/iort_dt_msgs /workspace/src/iort_dt_msgs
WORKDIR /workspace
RUN source /opt/ros/jazzy/setup.bash && \
    colcon build --symlink-install
```

**`src/iort_dt_federation/Dockerfile`** (Already exists? Verify):
- Check if this is actually missing or just in a different location

### 2.2 ROS2 Package Skeleton

Create minimal ROS2 package structure:
```bash
mkdir -p src/iort_dt_msgs/msg
cat > src/iort_dt_msgs/package.xml << 'EOF'
<?xml version="1.0"?>
<package format="3">
  <name>iort_dt_msgs</name>
  <version>0.1.0</version>
  <description>Messages for abyssal-twin</description>
  <maintainer email="s.tanavade@unomaha.edu">Swanand Tanavade</maintainer>
  <license>Apache-2.0</license>
  <buildtool_depend>ament_cmake</buildtool_depend>
  <depend>std_msgs</depend>
  <depend>geometry_msgs</depend>
</package>
EOF
```

---

## Phase 3: Validation & Testing (Week 5-6)

### 3.1 RQ Validation Pipeline

The `rq-validation.yml` exists but needs working Docker images. Once Phase 2 complete:

```bash
# Run full validation
act -j rq1-compression     # Local GitHub Actions
act -j rq3-anomaly-detection
act -j rq-summary
```

### 3.2 End-to-End Test

Create `scripts/test-e2e.sh` as specified in ARCHITECTURE.md:
```bash
#!/bin/bash
# 7-phase validation runner

set -e

echo "=== Phase 1: Build Verification ==="
cargo build --release --manifest-path src/iort_dt_federation/Cargo.toml

echo "=== Phase 2: Unit Tests ==="
cargo test --manifest-path src/iort_dt_federation/Cargo.toml
poetry run pytest tests/unit -v || echo "Known CUSUM failures - see docs"

echo "=== Phase 3: RQ1 Compression ==="
poetry run python experiments/rq1_sync_tradeoff/validate.py

echo "=== Phase 4: RQ3 Anomaly Detection ==="
poetry run python experiments/rq3_anomaly/validate.py

echo "=== Phase 5: RQ2 Federation (Partition Test) ==="
# Docker-based partition test
docker-compose -f docker/docker-compose.simulation.yml up -d
# Run partition simulation
# Cleanup

echo "=== Phase 6: RQ4 Security ==="
poetry run python scripts/attacks/replay_attack.py --duration 60

echo "=== Phase 7: Integration Smoke Test ==="
docker-compose -f docker/docker-compose.simulation.yml ps
```

---

## Phase 4: Documentation Polish (Week 7)

### 4.1 Update README for v0.2.0

When Docker works, update:
- Change status from "Pre-alpha" to "Beta"
- Move items from "Not Yet Functional" to "Working"
- Add Docker quickstart instructions

### 4.2 API Documentation

```bash
# Rust docs
cd src/iort_dt_federation
cargo doc --no-deps --open

# Python docs
poetry run sphinx-quickstart docs/api  # if not exists
poetry run sphinx-apidoc -o docs/api src
```

---

## Phase 5: Release Preparation (Week 8)

### 5.1 Version Tagging

```bash
git tag -a v0.2.0 -m "Beta: Working Docker stack, ROS2 integration
git push origin v0.2.0
```

### 5.2 GitHub Release

- Attach SBOM (auto-generated)
- Attach signed container images
- Release notes from CHANGELOG

---

## Critical Path Dependencies

```
Merge Dependabot (#1-7)
        │
        ▼
Create Dockerfiles
        │
        ▼
Test docker-compose up
        │
        ▼
Run RQ validation
        │
        ▼
Tag v0.2.0-beta
```

**Blockers**:
1. mlflow 3.5.0 may have breaking changes (Poetry major version)
2. bincode 3.0 serialization format may change
3. Stonefish OpenCV build may fail on ARM64

---

## Success Criteria

| Milestone | Criteria | Current | Target |
|-----------|----------|---------|--------|
| **Security** | 0 HIGH CVEs | 3 HIGH | 0 |
| **Build** | `docker-compose up` works | ❌ Fails | ✅ Works |
| **RQ1** | F1 > 0.90 validated | 🟡 Code only | ✅ CI passing |
| **RQ2** | Convergence <60s | 🟡 Unit tests | ✅ E2E passing |
| **RQ3** | ARL₀ > 10,000 | 🟡 Unit tests | ✅ CI passing |
| **RQ4** | Attack detection >95% | 🟡 Scripts exist | ✅ CI passing |

---

## Immediate Actions (Today)

1. **Merge Dependabot PRs #1, #2, #3** (CI updates - safe)
2. **Test nalgebra 0.34 locally** (PR #6)
3. **Create `docker/stonefish/Dockerfile`** (biggest blocker)
4. **Run `cargo test`** to verify Rust code still works

---

## Resources

- **GitHub**: https://github.com/kakashi3lite/abyssal-twin
- **Dependabot PRs**: https://github.com/kakashi3lite/abyssal-twin/pulls
- **Security**: https://github.com/kakashi3lite/abyssal-twin/security/dependabot
- **Local path**: `/tmp/iort-analysis/iort-dt`

---

*Plan created from ground-truth analysis - 2026-03-06*
