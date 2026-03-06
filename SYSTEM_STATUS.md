# System Status - abyssal-twin SRE

**Last Updated**: 2026-03-06  
**SRE Lead**: Kimi Code  
**Repository**: https://github.com/kakashi3lite/abyssal-twin

---

## Supply Chain Security Grade

| Component | Status | SLSA Level | Notes |
|-----------|--------|------------|-------|
| Image Signing | ✅ | 3 | Cosign keyless via Fulcio/Rekor |
| SBOM Generation | ✅ | 3 | BuildKit native SBOM |
| Provenance | ✅ | 3 | GitHub Actions attestation |
| Vulnerability Scanning | ✅ | - | Trivy SARIF upload |
| Dependency Updates | ✅ | - | Dependabot weekly |

---

## CI/CD Pipeline Status

### Workflows

| Workflow | Purpose | Trigger | Duration Target |
|----------|---------|---------|-----------------|
| `ci.yml` | Lint, test, build | PR/push | <10 min |
| `provenance.yml` | Sign & publish images | Tags/main | <30 min |
| `rq-validation.yml` | Research gate | PR/src changes | <20 min |

### Circuit Breakers

| Condition | Action | Status |
|-----------|--------|--------|
| CRITICAL CVE in base image | ❌ HALT release | Active |
| RQ1 F1 < 0.90 | ❌ Block merge | Active |
| RQ3 ARL₀ < 10,000 | ❌ Block merge | Active |
| Image signing failure | ❌ Block publish | Active |

---

## Multi-Architecture Support

| Platform | Status | CI Runner |
|----------|--------|-----------|
| linux/amd64 | ✅ | GitHub-hosted |
| linux/arm64 | ✅ | QEMU emulation |
| Jetson (arm64) | ⚠️ | Native testing needed |

---

## Container Registry

**GHCR**: `ghcr.io/kakashi3lite/abyssal-twin/`

| Image | Tags | Multi-arch | Signed |
|-------|------|------------|--------|
| base | latest, v* | ✅ | ✅ |
| simulation | latest, v* | ✅ | ✅ |
| federation | latest, v* | ✅ | ✅ |

---

## Security Posture

### Active Measures
- ✅ Trivy container scanning (CRITICAL/HIGH)
- ✅ Secret scanning push protection
- ✅ Dependabot auto-updates
- ✅ Branch protection (requires PR + CI pass)
- ✅ OIDC trust for cosign (no long-lived secrets)

### Compliance
- ✅ SBOM attached to all images
- ✅ SLSA Level 3 provenance
- ✅ Apache 2.0 license
- ✅ SECURITY.md policy

---

## Observability Metrics

### CI Performance
| Metric | Target | Current |
|--------|--------|---------|
| Mean build time | <15 min | TBD |
| Success rate | >95% | TBD |
| RQ fidelity drift | 0% | TBD |

### Research Validation
| RQ | Threshold | CI Enforcement |
|----|-----------|----------------|
| RQ1 | F1 > 0.90, >10:1 compression | ✅ |
| RQ2 | <60s convergence, <2m RMS | ✅ |
| RQ3 | ARL₀ > 10,000, <120s detection | ✅ |
| RQ4 | >95% attack detection | ✅ |

---

## Known Issues

| Issue | Severity | Status | Notes |
|-------|----------|--------|-------|
| ARM64 builds via QEMU | Medium | ⚠️ | Slow; native runners preferred |
| Stonefish OpenCV deps | Medium | ⚠️ | May fail on macOS; minimal image available |
| No hardware-in-loop test | High | 🔲 | Simulation-only validation |

---

## On-Call Runbook

### Image Signing Failure
```bash
# Verify cosign installation
cosign version

# Check OIDC token
curl -H "Authorization: bearer $ACTIONS_ID_TOKEN_REQUEST_TOKEN" \
  "$ACTIONS_ID_TOKEN_REQUEST_URL"

# Manual sign
cosign sign --yes ghcr.io/kakashi3lite/abyssal-twin/image@sha256:...
```

### RQ Validation Failure
1. Check artifact: `rq1-results`, `rq3-results`, `rq4-results`
2. Download and inspect metrics JSON
3. If threshold drift is acceptable, update threshold in workflow
4. If bug, create `rq_failure` issue

### CVE Response
1. Trivy identifies CRITICAL CVE
2. Pipeline halts automatically
3. Check if fix available via Dependabot
4. If no fix, assess impact and create security advisory
5. Target: 24h for CRITICAL, 7d for HIGH

---

## Roadmap

- [ ] Self-hosted ARM64 runners for faster builds
- [ ] GitHub Advanced Security (CodeQL) for Rust/Python
- [ ] Automated changelog generation
- [ ] Helm charts for Kubernetes deployment
- [ ] Prometheus metrics export from CI

---

*This document is maintained by the SRE team. Last update: 2026-03-06*
