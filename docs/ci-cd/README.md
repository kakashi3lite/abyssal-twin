# 🚀 CI/CD Pipeline Documentation

Elite-grade continuous integration and deployment for Abyssal Twin.

---

## 📋 Pipeline Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CI/CD PIPELINE ARCHITECTURE                          │
└─────────────────────────────────────────────────────────────────────────────┘

Push to main/develop
         │
         ▼
┌─────────────────┐
│  changes        │  ──► Detect which files changed
└────────┬────────┘
         │
    ┌────┴────┬──────────┬──────────┬──────────┐
    ▼         ▼          ▼          ▼          ▼
┌──────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
│TypeScript│ │Mission │ │  Rust  │ │ Python │ │ Docker │
│  Tests   │ │Control │ │ Tests  │ │ Tests  │ │ Build  │
└────┬───┘ └────┬───┘ └────┬───┘ └────┬───┘ └────┬───┘
     │          │          │          │          │
     └──────────┴──────────┴──────────┴──────────┘
                         │
                         ▼
                 ┌───────────────┐
                 │    summary    │  ──► All checks passed?
                 └───────┬───────┘
                         │
            ┌────────────┴────────────┐
            ▼                         ▼
    ┌──────────────┐          ┌──────────────┐
    │ Deploy to    │          │ Deploy       │
    │ Cloudflare   │          │ Dashboard    │
    │ Workers      │          │ to Pages     │
    └──────────────┘          └──────────────┘
```

---

## 🔄 Workflows

### 1. CI Master Pipeline (`ci-master.yml`)

**Triggers:** Push to main/develop, PR to main, Manual dispatch

**Jobs:**
| Job | Purpose | Condition |
|-----|---------|-----------|
| `changes` | Detect changed files | Always |
| `typescript` | TypeScript tests | cloudflare/** changed |
| `mission-control` | Dashboard build | mission-control/** changed |
| `rust` | Rust tests | src/iort_dt_*/** changed |
| `python` | Python tests | src/iort_dt_anomaly/** changed |
| `docker` | Docker build | docker/** changed |
| `summary` | Pipeline summary | Always |

**Features:**
- ✅ Path filtering — only run jobs for changed files
- ✅ Concurrency control — cancel stale runs
- ✅ Artifact upload — binaries, build outputs
- ✅ Caching — Rust, Node, Python dependencies

### 2. Deploy Dashboard (`deploy-dashboard.yml`)

**Triggers:** Push to main (mission-control/**), Manual dispatch

**Jobs:**
1. **Build** — Type check, build, verify output
2. **Deploy** — Upload to Cloudflare Pages
3. **Smoke Test** — Verify deployment, Lighthouse CI

**Environments:**
- Staging: `https://staging-abyssal-mission-control.pages.dev`
- Production: `https://abyssal-mission-control.pages.dev`

### 3. Provenance & Attestation (`provenance.yml`)

**Triggers:** Tags (v*), Push to main

**Features:**
- Trivy security scan
- SLSA Level 3 compliance
- Cosign keyless signing
- SBOM generation

---

## 🔧 Configuration

### Required Secrets

| Secret | Purpose | Where to Get |
|--------|---------|--------------|
| `CLOUDFLARE_API_TOKEN` | Deploy to Pages | Cloudflare API Tokens |
| `CLOUDFLARE_ACCOUNT_ID` | Account identification | Cloudflare Dashboard |
| `GITHUB_TOKEN` | Package registry | Auto-provided |

### Setting Up Secrets

```bash
# 1. Get Cloudflare API Token
# Visit: https://dash.cloudflare.com/profile/api-tokens
# Create token with: Cloudflare Pages:Edit, Account:Read

# 2. Get Account ID
# Visit: https://dash.cloudflare.com
# Copy Account ID from right sidebar

# 3. Add to GitHub
# Repo → Settings → Secrets and variables → Actions → New repository secret
```

---

## 🧪 Testing Locally

### Before Pushing

```bash
# Run all checks locally
make ci

# Or individually:

# TypeScript
cd cloudflare && npm ci && npm test

# Mission Control
cd mission-control && npm ci && npm run build

# Rust
cd src/iort_dt_federation && cargo test

# Python
poetry run pytest tests/

# Docker
docker build -f docker/federation/Dockerfile .
```

---

## 📊 Pipeline Status Badges

Add to your README:

```markdown
[![CI](https://github.com/kakashi3lite/abyssal-twin/actions/workflows/ci-master.yml/badge.svg)](https://github.com/kakashi3lite/abyssal-twin/actions)
[![Dashboard](https://github.com/kakashi3lite/abyssal-twin/actions/workflows/deploy-dashboard.yml/badge.svg)](https://github.com/kakashi3lite/abyssal-twin/actions)
[![Provenance](https://github.com/kakashi3lite/abyssal-twin/actions/workflows/provenance.yml/badge.svg)](https://github.com/kakashi3lite/abyssal-twin/actions)
```

---

## 🚨 Troubleshooting

### Build Failures

**TypeScript Error:**
```bash
# Check types
cd cloudflare && npx tsc --noEmit

# Fix formatting
npx prettier --write src/
```

**Rust Error:**
```bash
# Update dependencies
cargo update

# Check formatting
cargo fmt -- --check

# Run clippy
cargo clippy -- -D warnings
```

**Python Error:**
```bash
# Update lock file
poetry lock

# Run ruff
poetry run ruff check src/ --fix
```

### Deployment Failures

**Cloudflare Pages:**
```bash
# Verify token
curl -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  https://api.cloudflare.com/client/v4/user/tokens/verify

# Check project exists
wrangler pages project list
```

---

## 📈 Performance Metrics

| Metric | Target | Current |
|--------|--------|---------|
| Pipeline Duration | <10 min | ~6 min |
| TypeScript Tests | <2 min | ~1.5 min |
| Rust Build | <5 min | ~4 min |
| Docker Build | <8 min | ~6 min |
| Deploy Time | <2 min | ~1 min |

---

## 🔒 Security

- **Trivy** — Container vulnerability scanning
- **Cosign** — Image signing with Sigstore
- **SLSA** — Level 3 provenance attestation
- **CodeQL** — Static analysis (optional)

---

## 📝 Maintenance

### Monthly Tasks
- [ ] Review and rotate secrets
- [ ] Update action versions
- [ ] Clean up old artifacts
- [ ] Review security scan results

### Quarterly Tasks
- [ ] Dependency updates (Dependabot PRs)
- [ ] Performance optimization
- [ ] Documentation updates
- [ ] Disaster recovery testing

---

<div align="center">

**[⬅ Back to Documentation](../README.md)**

</div>
