# Deployment Checklist

## Pre-Deployment Verification

### 1. All Tests Pass
```bash
make test-all                        # Rust + Python
npm test                             # TypeScript (from cloudflare/)
scripts/test-e2e.sh                  # 7-phase E2E
scripts/validate-infrastructure.sh   # Structure + dependencies
```

### 2. Environment Variables

**Required for Cloudflare Workers (`cloudflare/wrangler.toml`):**
| Variable | Purpose | Secret? |
|---|---|---|
| `CF_API_TOKEN` | Cloudflare API token for WAF/Tunnel | YES |
| `CF_ACCOUNT_ID` | Cloudflare account ID | YES |
| `ALLOWED_ORIGIN` | CORS origin for dashboard domain | NO |
| `ENVIRONMENT` | `production`, `staging`, or `dev` | NO |

**Required for Mission Control (`mission-control/.env`):**
| Variable | Purpose | Secret? |
|---|---|---|
| `VITE_API_BASE` | Cloudflare Worker URL | NO |
| `VITE_WS_URL` | WebSocket URL for live sync | NO |
| `VITE_SSE_URL` | SSE endpoint URL | NO |
| `VITE_MAPBOX_TOKEN` | Mapbox GL access token | YES |

**Required for Edge Gateway (`edge-gateway/config.toml`):**
| Variable | Purpose | Secret? |
|---|---|---|
| `CF_API_TOKEN` | Cloudflare API authentication | YES |
| `CF_TUNNEL_TOKEN` | Cloudflare Tunnel (if used) | YES |

### 3. Database Migrations

```bash
# Verify migrations apply cleanly
npx wrangler d1 execute FLEET_DB --local --file=migrations/0001_initial.sql
npx wrangler d1 execute FLEET_DB --local --file=migrations/0002_indexes.sql

# Verify seed data
npx wrangler d1 execute FLEET_DB --local --command="SELECT COUNT(*) FROM vehicles;"
# Expected: 4

# Production migration
npx wrangler d1 execute FLEET_DB --remote --file=migrations/0001_initial.sql
npx wrangler d1 execute FLEET_DB --remote --file=migrations/0002_indexes.sql
```

### 4. Durable Object Migration

```bash
# Verify DO class is registered in wrangler.toml
grep "FederationCoordinator" cloudflare/wrangler.toml
# Expected: class_name = "FederationCoordinator" in [[durable_objects.bindings]]

# Verify migration tag
npx wrangler deploy --dry-run
# Should show migration tag applied
```

---

## Deployment Steps

### Cloudflare Workers (API + DO)

```bash
cd cloudflare

# Staging deployment
npx wrangler deploy --env staging

# Verify staging
curl https://staging.abyssal-twin.workers.dev/api/v1/health
# Expected: {"status":"ok","environment":"staging"}

# Production deployment
npx wrangler deploy --env production

# Verify production
curl https://abyssal-twin.workers.dev/api/v1/health
# Expected: {"status":"ok","environment":"production"}
```

### Cloudflare Pages (Dashboard)

```bash
cd cloudflare/pages

# Build
npm run build

# Deploy (via wrangler)
npx wrangler pages deploy dist --project-name=abyssal-twin-dashboard

# Alternative: GitHub Actions auto-deploys on push to main
```

### Mission Control (Mapbox Dashboard)

```bash
cd mission-control

# Build
npm run build

# Deploy to Cloudflare Pages
npx wrangler pages deploy dist --project-name=abyssal-mission-control

# Alternative: GitHub Pages (via GitHub Actions)
git push origin main
# Workflow: .github/workflows/deploy-mission-control.yml
```

### Edge Gateway (Rust Binary)

```bash
cd edge-gateway

# Build for target architecture
# amd64 (server):
cargo build --release

# aarch64 (Jetson Orin):
cargo build --release --target aarch64-unknown-linux-gnu

# Deploy to vessel
scp target/release/abyssal-edge-gateway vessel@192.168.1.100:/opt/abyssal/
scp config.toml vessel@192.168.1.100:/opt/abyssal/

# Start (on vessel)
ssh vessel@192.168.1.100
systemctl restart abyssal-gateway
```

---

## Post-Deployment Verification

### 1. API Health
```bash
curl https://abyssal-twin.workers.dev/api/v1/health
curl https://abyssal-twin.workers.dev/api/v1/fleet/status
```

### 2. Dashboard Accessibility
- Open `https://abyssal-twin-dashboard.pages.dev`
- Verify: FleetMap 3D renders, StatusCards show data, AnomalyPanel loads
- Open `https://abyssal-mission-control.pages.dev`
- Verify: Mapbox basemap renders (requires token), SafetyEngine PNR active

### 3. Ingest Pipeline (if gateway is deployed)
```bash
curl -X POST https://abyssal-twin.workers.dev/api/v1/ingest \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${CF_API_TOKEN}" \
  -d '{"vesselId":10,"states":[],"anomalies":[],"sentAt":"2026-08-07T00:00:00Z"}'
# Expected: {"received":0,"forwarded":true}
```

### 4. Security Checks
```bash
# JWT verification (forged tokens must be rejected — fixed Phase 4.6)
curl -H "CF-Access-JWT-Assertion: eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJhIiwiaXNzIjoiaHR0cHM6Ly9ldmlsLmV4YW1wbGUiLCJleHAiOjQxMDAwMDAwMDAsInJvbGUiOiJhZG1pbiJ9.e30" https://abyssal-twin.workers.dev/api/v1/fleet/status
# Expected: 401 Unauthorized (issuer pinning rejects attacker-controlled iss)

# Gateway service token still works (fleet status download)
curl -H "Authorization: Bearer ${CF_API_TOKEN}" https://abyssal-twin.workers.dev/api/v1/fleet/status
# Expected: 200

# No credentials at all → 401
curl https://abyssal-twin.workers.dev/api/v1/fleet/status
# Expected: 401

# ITAR enforcement (should reject non-US writes)
curl -X POST https://abyssal-twin.workers.dev/api/v1/ingest \
  -H "CF-IPCountry: CN" \
  -H "Content-Type: application/json" \
  -d '{"vesselId":10,"states":[],"anomalies":[],"sentAt":"..."}'
# Expected: 403 Forbidden
```

### 5. Metrics
```bash
# Check Prometheus metrics endpoint (if exposed)
curl https://abyssal-twin.workers.dev/metrics
# Expected: abyssal_* metrics with current values
```

---

## Rollback Procedure

### Workers
```bash
# List deployments
npx wrangler deployments list

# Rollback to specific version
npx wrangler rollback --deployment-id <id>
```

### D1
```bash
# D1 supports point-in-time restore (last 30 days)
npx wrangler d1 restore FLEET_DB --timestamp="2026-08-07T11:00:00Z"
```

### Pages
- Cloudflare Pages: Deployments tab → select previous deployment → "Rollback to this deployment"
- GitHub Pages: `git revert <commit>` + `git push`

---

## Monitoring After Deploy

- **Grafana**: `https://abyssal-grafana.pages.dev` (if set up)
- **Cloudflare Dashboard**: Workers & Pages → Analytics
- **D1 Dashboard**: Storage size, read/write metrics
- **DO Dashboard**: Request count, CPU time, storage usage
- **Alerts**: Check alerting rules are active (fleet coherence, partition duration, DO errors)
