# Migration Notes: README v2 → Ground Truth README

**Date**: 2026-03-06  
**Migration Type**: Documentation Honesty Rewrite  
**Old README**: README.v2.md (archived)  
**New README**: README.md (current)

---

## Why This Migration Was Necessary

The original README (v2) suffered from **"documentation drift"** - it described aspirational features that didn't exist in the repository. This creates several problems:

1. **New contributors waste time** trying to run commands that fail
2. **Academic reviewers lose trust** when claims don't match code
3. **Defense contractors can't assess** actual maturity vs claimed maturity
4. **CI/CD pipelines fail** because infrastructure is missing

The ground-truth README addresses this by clearly separating:
- ✅ What exists and works NOW
- 🚧 What's in progress
- 📋 What's planned

---

## Major Changes

### 1. Status Header

**Old (Misleading)**:
```markdown
# IoRT-DT: Federated Digital Twins for Autonomous Underwater Vehicles

[![CI](...)](...) [![License](...)](...) ...
Research implementation...
```

**New (Honest)**:
```markdown
# abyssal-twin

> **Current Status**: Pre-alpha research implementation  
> **Working Components**: RQ2 (Federation), RQ1/RQ3 (Python modules)  
> **Not Yet Functional**: Full Docker stack, ROS2 integration, Stonefish simulation
```

**Impact**: Immediate clarity on maturity level.

---

### 2. Quick Start Section

**Old (Broken)**:
```bash
make bootstrap          # One-time setup (certs, configs)
docker compose -f docker/docker-compose.simulation.yml up
```

**New (Verified Working)**:
```bash
# Build Federation Node (Rust) - WORKS NOW
cd src/iort_dt_federation
cargo build --release
./target/release/iort-federation --version

# Docker Compose (NOT YET WORKING)
# ❌ This will fail - Dockerfiles missing
# docker-compose -f docker/docker-compose.simulation.yml up
```

**Impact**: Users can actually follow instructions successfully.

---

### 3. Feature Claims

**Old (Aspirational)**:
- "Stonefish physics simulator integration"
- "ROS 2 Jazzy middleware"
- "Multi-architecture Docker support"

**New (Ground Truth)**:
| Feature | Claim | Reality |
|---------|-------|---------|
| Stonefish | ❌ Not implemented | No Dockerfile, no code |
| ROS2 | ❌ Not implemented | No CMakeLists.txt |
| Multi-arch | ⚠️ CI configured | Needs working Dockerfiles |

**Impact**: Accurate expectations.

---

### 4. Research Questions

**Old (Implied Complete)**:
All RQ1-RQ4 shown as implemented with `make test-rq*` commands.

**New (Honest Assessment)**:
| RQ | Status | Evidence |
|----|--------|----------|
| RQ1 | 🟡 Partial | Python code exists, needs integration |
| RQ2 | 🟢 Working | Rust gossip implemented |
| RQ3 | 🟡 Partial | CUSUM implemented, needs validation data |
| RQ4 | 🔴 Missing | Templates only |

**Impact**: Academic honesty for publication/submission.

---

## What Was Preserved

✅ **Technical accuracy**: All existing code documented correctly  
✅ **Build instructions**: Rust and Python steps verified working  
✅ **CI/CD information**: Workflows described with honest status  
✅ **Citation information**: BibTeX preserved  
✅ **License**: Apache 2.0 maintained  

---

## What Was Added

📄 **STRUCTURE_REPORT.md**: Detailed archaeological analysis  
📄 **MIGRATION_NOTES.md**: This document  
📄 **README.v2.md**: Archived old README for reference  
📝 **Status indicators**: ✅ 🟢 🟡 🔴 for quick scanning  
📝 **Honest roadmap**: v0.1.0/v0.2.0/v0.3.0 with actual milestones  

---

## For Users Coming from README.v2

### If you tried `docker-compose up` and it failed

**Why**: The docker-compose.simulation.yml references services that need Dockerfiles that don't exist yet.

**Workaround**: Use the dev container for development:
```bash
docker build -f .devcontainer/Dockerfile -t abyssal-dev .
docker run -it -v $(pwd):/workspace abyssal-dev bash
```

### If you tried `make test-rq1` and it failed

**Why**: The Makefile references Docker commands that don't work yet.

**Workaround**: Run Python tests directly:
```bash
poetry install
poetry run pytest tests/property/test_rq1_bounds.py -v
```

### If you need ROS2 integration

**Status**: Infrastructure ready (ROS2 installed in dev container), but no ROS2 packages exist yet.

**Next step**: Create `src/iort_dt_msgs/package.xml` and `CMakeLists.txt` for ROS2 message definitions.

---

## Path to README v3 (Full Truth)

The README will be updated to v3 when:

- [ ] Stonefish Dockerfile created
- [ ] ROS2 workspace Dockerfile created  
- [ ] Federation service Dockerfile created
- [ ] `docker-compose up` works end-to-end
- [ ] RQ1-RQ3 validation passes in CI
- [ ] Multi-arch images build successfully

At that point, the "Not Yet Functional" banner can be removed.

---

## Academic Integrity Note

For OCEANS 2027 or other submissions:

**The research code (Rust + Python) is real and substantial (~1,578 lines).** The algorithms are implemented and testable. However, the system integration (Docker, ROS2, Stonefish) is incomplete.

**Recommended approach**:
1. Submit RQ2 (Federation) as primary contribution - it's complete
2. Submit RQ1/RQ3 (Python modules) as secondary - code exists, integration pending
3. Acknowledge RQ4 as future work - templates only
4. Use dev container for reviewer reproduction (not full Docker stack)

---

## References

- [STRUCTURE_REPORT.md](STRUCTURE_REPORT.md): Detailed file-by-file analysis
- [README.v2.md](README.v2.md): Aspirational original (archived)
- [SYSTEM_STATUS.md](SYSTEM_STATUS.md): SRE infrastructure status

---

*Migration completed by Kimi Code - 2026-03-06*
