# Discovery Report

**Repository:** [kakashi3lite/abyssal-twin](https://github.com/kakashi3lite/abyssal-twin)
**Date:** 2026-03-06
**Commit:** `e587a61` (main)
**Purpose:** Pre-production audit. Every claim verified against actual files.

---

## Verification Answers

| Question | Answer |
|----------|--------|
| Stonefish commit hash referenced? | **None.** No Stonefish source is cloned, pinned, or referenced anywhere. `.devcontainer/Dockerfile` installs SDL2/GLEW dev libs but never builds Stonefish itself. |
| Python version in `pyproject.toml`? | **`^3.12`** (line 13) |
| `#[test]` functions in Rust? | **0.** `proptest = "1.4"` is declared as a dev-dependency but no test functions exist. |
| `.devcontainer/Dockerfile` line count? | **64 lines** |

---

## Asset Inventory

### What Actually Works

| Component | Language | Path | Lines | Verified How |
|-----------|----------|------|------:|--------------|
| Gossip federation protocol | Rust | `src/iort_dt_federation/src/lib.rs` | 395 | `cargo build --release` compiles, exports `prelude` module |
| Federation binary | Rust | `src/iort_dt_federation/src/main.rs` | 73 | Entry point compiles, reads env vars, runs gossip loop |
| CUSUM / Shiryaev-Roberts detectors | Python | `src/iort_dt_anomaly/iort_dt_anomaly/detectors.py` | 490 | Importable, 9 property tests pass |
| Pose6D state vector codec | Python | `src/iort_dt_compression/iort_dt_compression/models.py` | 320 | Importable, 7 property tests pass |
| Adaptive rate controller | Python | `src/iort_dt_compression/iort_dt_compression/rate_controller.py` | 300 | Importable, used by test_rq1_bounds |
| RQ1 property tests | Python | `tests/property/test_rq1_bounds.py` | 281 | 7 test functions (Hypothesis) |
| RQ3 property tests | Python | `tests/property/test_rq3_arl.py` | 352 | 9 test functions (Hypothesis) |
| RQ1 experiment runner | Python | `experiments/rq1_sync_tradeoff/run.py` | 410 | Sync-rate vs F1 sweep, matplotlib figures |
| DDS cert generation | Bash | `scripts/ci/generate_certs.sh` | 128 | ECDSA P-256, per-AUV permissions XML |
| Replay attack simulation | Python | `scripts/attacks/replay_attack.py` | 269 | RQ4 red-team script |
| Zenoh acoustic config | JSON5 | `docker/zenoh/acoustic.json5` | -- | Zenoh router configuration |
| DDS governance template | XML | `configs/security/governance.xml.template` | -- | Access control + encryption policy |
| Dev container | Dockerfile | `.devcontainer/Dockerfile` | 64 | Ubuntu 24.04 + ROS 2 Jazzy + Rust 1.75 |
| CI pipeline | YAML | `.github/workflows/ci.yml` | -- | Lint, Rust build, RQ1/RQ3/RQ4 tests |
| Provenance pipeline | YAML | `.github/workflows/provenance.yml` | -- | Trivy, Hadolint, cosign, SBOM |
| RQ validation pipeline | YAML | `.github/workflows/rq-validation.yml` | -- | Research gate checks |
| STRIDE threat model | Markdown | `docs/security/threat_model.md` | -- | 17 threats, CVSS scored |
| Simulation limitations | Markdown | `docs/SIMULATION_LIMITATIONS.md` | -- | Validation scope transparency |

**Totals:** 2 Rust files (468 lines), 7 Python files (2,422 lines), 3 CI workflows, 1 Dockerfile.

### What Is Declared but Missing

| Declared In | Referenced Path | Status |
|-------------|-----------------|--------|
| `docker-compose.simulation.yml` | `docker/stonefish/Dockerfile` | Does not exist |
| `docker-compose.simulation.yml` | `docker/ros2_workspace/Dockerfile` | Does not exist |
| `docker-compose.simulation.yml` | `src/iort_dt_federation/Dockerfile` | Does not exist |
| `docker-compose.simulation.yml` | `docker/observability/prometheus.yml` | Does not exist |
| `docker-compose.simulation.yml` | `docker/observability/grafana/dashboards/` | Does not exist |
| `docker-compose.simulation.yml` | `docker/observability/grafana/datasources/` | Does not exist |
| `docker-compose.simulation.yml` | `configs/auv_models/` | Does not exist |
| `docker-compose.simulation.yml` | `configs/scenarios/` | Does not exist |
| `Makefile` (test-rq1) | `tests/unit/test_compression.py` | Does not exist |
| `Makefile` (test-rq3) | `tests/unit/test_anomaly.py` | Does not exist |
| `Makefile` (test-rq4) | `tests/unit/test_security.py` | Does not exist |
| `Makefile` (test-rq1) | `experiments/rq1_sync_tradeoff/validate.py` | Does not exist |
| `Makefile` (test-rq3) | `experiments/rq3_anomaly/validate.py` | Does not exist |
| `Makefile` (test-rq4) | `experiments/rq4_security/validate.py` | Does not exist |
| `Makefile` (red-team) | `scripts/attacks/spoofing_attack.py` | Does not exist |
| `Makefile` (paper-figures) | `experiments/rq3_anomaly/run.py` | Does not exist |
| `Makefile` (paper-figures) | `experiments/rq3_anomaly/run_arl.py` | Does not exist |
| `Makefile` (paper-figures) | `experiments/rq4_security/run.py` | Does not exist |
| `rq-validation.yml` | `experiments/rq2_federation/validate.py` | Does not exist |
| Entire category | Any ROS 2 package (`package.xml`, `CMakeLists.txt`) | Does not exist |
| Entire category | Any `.msg`, `.srv`, `.action` file | Does not exist |
| Entire category | Any launch file | Does not exist |
| Entire category | Web UI (`ui/` directory) | Does not exist |
| Entire category | Terraform / Helm / Kubernetes | Does not exist |
| Entire category | `.env` or `.env.example` | Does not exist |
| Entire category | `Poetry.lock` | Does not exist |
| Entire category | `Cargo.lock` | Does not exist |

---

## Blockers List

### Critical (Blocks `docker-compose up`)

| ID | Blocker | Impact | Fix Effort |
|----|---------|--------|------------|
| B-1 | 3 missing Dockerfiles (stonefish, ros2_workspace, federation) | `docker compose build` fails immediately | High -- Stonefish build is complex |
| B-2 | 8 missing volume mount paths (observability, auv_models, scenarios) | Services crash on missing bind mounts | Low -- create directories and placeholder configs |
| B-3 | No `Poetry.lock` | Non-reproducible Python builds | Low -- run `poetry lock` |
| B-4 | No `Cargo.lock` | Non-reproducible Rust builds, CI cache key broken (`hashFiles('Cargo.lock')` returns empty) | Low -- run `cargo generate-lockfile` |

### High (Blocks CI / Green Main Branch)

| ID | Blocker | Impact | Fix Effort |
|----|---------|--------|------------|
| B-5 | Makefile references 11 non-existent scripts | `make test-rq1`, `make test-rq3`, `make test-rq4`, `make red-team`, `make paper-figures` all fail | Medium -- write stubs or fix paths |
| B-6 | `rq-validation.yml` references non-existent validation scripts | Workflow fails on every push | Medium -- write stubs or disable jobs |
| B-7 | `ci.yml` Docker build job references non-existent Dockerfiles | Job fails (currently `continue-on-error: true`) | Blocked by B-1 |
| B-8 | 0 Rust tests | `cargo test` succeeds but tests nothing; Makefile claims tests pass | Medium -- write unit + proptest tests |

### Medium (Code Quality / Correctness)

| ID | Issue | File | Line | Fix |
|----|-------|------|------|-----|
| B-9 | `ClassVar` used but not imported | `detectors.py` | 319 | Add `ClassVar` to `from typing import` |
| B-10 | Wire size docstring says "42 bytes" but `WIRE_SIZE_BYTES = 47` | `models.py` | 35 vs 126 | Update comment to match constant |
| B-11 | Broad `except Exception` swallows errors | `replay_attack.py` | 111, 157 | Narrow exception types |

---

## Risk Matrix

### License Risk: LOW

All dependencies use permissive licenses. No GPL/LGPL contamination detected.

| Category | Dependencies | Licenses |
|----------|-------------|----------|
| Rust | zenoh, serde, nalgebra, tokio, sha2, anyhow, thiserror, chrono, bincode | Apache-2.0 / MIT |
| Python | pydantic, numpy, scipy, fastavro, lz4, numba, matplotlib, mlflow, prometheus-client, zenoh | BSD / MIT / Apache-2.0 |
| Project | `LICENSE` file | Apache-2.0 |

**Commercial use:** Safe. No copyleft dependencies.

### Dependency Stability Risk: LOW

| Check | Result |
|-------|--------|
| `git =` dependencies in Cargo.toml | **0** -- all version-pinned |
| `unsafe` blocks in Rust | **0** -- clean |
| Bare `unwrap()` in Rust | **0** -- uses `unwrap_or` / `unwrap_or_else` variants |
| Bare `except:` in Python | **0** -- uses `except Exception` (still broad, but typed) |
| `TODO` / `FIXME` in codebase | **0** |
| `unimplemented!` / `panic!` in Rust | **0** |
| `NotImplementedError` in Python | **0** |

### Supply Chain Risk: MEDIUM

| Check | Result | Action Needed |
|-------|--------|---------------|
| `Cargo.lock` committed | No | Generate and commit -- required for reproducible builds |
| `Poetry.lock` committed | No | Generate and commit |
| `cargo audit` clean | Unknown -- cannot run without `Cargo.lock` | Generate lock, then audit |
| Dependabot | Configured (`.github/dependabot.yml`) | 3 high vulnerabilities flagged by GitHub |
| SBOM | `provenance.yml` configured but not yet producing artifacts | Blocked by missing Docker images |
| Image signing | Cosign configured in `provenance.yml` | Blocked by missing Docker images |

### Security Posture: MEDIUM

| Check | Result |
|-------|--------|
| DDS-Security governance | Template exists (`governance.xml.template`), not active |
| Certificate generation | Working (`generate_certs.sh` produces ECDSA P-256 certs) |
| Replay attack mitigation | Red-team script exists, not integrated into runtime |
| Secrets in repo | None found (`.env` not committed, `.gitignore` covers secrets) |
| Container security | No Dockerfiles exist to evaluate |

---

## Technical Debt Assessment

### Debt by Category

| Category | Count | Severity | Notes |
|----------|------:|----------|-------|
| Missing Dockerfiles | 3 | Critical | Blocks entire Docker stack |
| Missing test files | 3 unit test files | High | Makefile / CI reference them |
| Missing experiment scripts | 8 scripts | High | Makefile / CI reference them |
| Missing ROS 2 packages | All | High | Zero ROS 2 integration exists |
| Missing lock files | 2 | High | Non-reproducible builds |
| Missing observability configs | 3 paths | Medium | Grafana / Prometheus won't provision |
| Missing env documentation | 1 `.env.example` | Low | Operators have no config reference |
| Code bugs | 2 (ClassVar import, docstring mismatch) | Low | Functional but incorrect |

### Test Coverage

| Language | Test Files | Test Functions | Unit Tests | Property Tests | Integration Tests |
|----------|-----------|---------------|------------|---------------|-------------------|
| Rust | 0 | 0 | 0 | 0 (proptest configured, unused) | 0 |
| Python | 2 | 16 | 0 | 16 (Hypothesis) | 0 |
| **Total** | **2** | **16** | **0** | **16** | **0** |

Estimated coverage: Python modules have property-based tests covering
core algorithms (compression round-trip, ARL bounds). Rust federation
has **zero** test coverage.

---

## Recommendations (Priority Order)

1. **Generate lock files.** Run `poetry lock` and `cargo generate-lockfile`.
   Commit both. This unblocks reproducible builds and CI cache keys.
   Effort: 5 minutes.

2. **Fix the two code bugs.** Add `ClassVar` import to `detectors.py`.
   Update wire-size comment in `models.py`. Effort: 5 minutes.

3. **Create stub Dockerfiles.** Minimal federation Dockerfile (distroless
   Rust binary). Stub stonefish and ros2 Dockerfiles that echo "not yet
   implemented" and exit 0 for health check. This unblocks `docker compose config`
   validation. Effort: 1 hour.

4. **Write Rust tests.** Add `#[cfg(test)]` module to `lib.rs` covering
   VectorClock, MerkleTree, and FederationManager. This fills the zero-test
   gap. Effort: 2 hours.

5. **Fix Makefile references.** Either create the missing test/experiment
   files as stubs or update Makefile targets to only reference files that
   exist. Effort: 1 hour.

6. **Create ROS 2 message definitions.** `iort_dt_msgs` package with
   `AUVState.msg` and `AnomalyAlert.msg`. This is the prerequisite for
   all ROS 2 integration work. Effort: 2 hours.

7. **Address Dependabot alerts.** Review the 3 high-severity vulnerabilities
   at https://github.com/kakashi3lite/abyssal-twin/security/dependabot.
   Effort: 30 minutes.

---

*Report generated from repository archaeology. All paths verified
against commit `e587a61` on `main`. No files were modified during
this analysis.*
