# 🚀 Quick Start Guide

Get the Abyssal Twin dashboard running in 5 minutes.

## Prerequisites

- Node.js 18+ ([Download](https://nodejs.org/))
- Git ([Download](https://git-scm.com/))

## Step 1: Clone Repository

```bash
git clone https://github.com/kakashi3lite/abyssal-twin.git
cd abyssal-twin
```

## Step 2: Choose Your Path

### Path A: Dashboard Only (Frontend)

Best for: UI development, testing dashboard features

```bash
cd mission-control
npm install
npm run dev
```

Open http://localhost:3000

You'll see the dashboard with simulated data.

### Path B: Full Stack (Recommended)

Best for: End-to-end testing, seeing real-time data

```bash
# Terminal 1: Start Cloudflare backend
cd cloudflare
npm install
npm run dev

# Terminal 2: Start dashboard
cd mission-control
npm install
npm run dev
```

The dashboard will connect to your local backend.

### Path C: Docker (Production-like)

Best for: Testing full deployment, CI/CD validation

```bash
# Start everything
docker compose -f docker/docker-compose.simulation.yml up

# Access services:
# - Dashboard: http://localhost:3000
# - API: http://localhost:8787
# - Prometheus: http://localhost:9090
# - Grafana: http://localhost:3000
```

## Step 3: Verify Installation

### Check Dashboard

Open http://localhost:3000 and verify:

- [ ] Dashboard loads without errors
- [ ] Fleet status widget shows 3 AUVs
- [ ] Research metrics display RQ1/RQ3 data
- [ ] Theme toggle works (dark/light)

### Check API

```bash
curl http://localhost:8787/api/v1/health
```

Expected response:
```json
{
  "service": "abyssal-twin",
  "version": "1.0.0",
  "status": "healthy"
}
```

### Check Tests

```bash
# TypeScript tests
cd cloudflare && npm test

# Rust tests
cd src/iort_dt_federation && cargo test

# Python tests
poetry run pytest tests/property/
```

## Step 4: Explore Features

### Dashboard Walkthrough

1. **Fleet Status Widget** — Click on an AUV to see details
2. **Research Metrics** — Toggle between RQ1, RQ2, RQ3 views
3. **Charts** — Select time range (1h, 6h, 24h, 7d)
4. **Export** — Click "Export" to download CSV data
5. **Settings** — Customize refresh interval, notifications

### API Exploration

```bash
# Get fleet status
curl http://localhost:8787/api/v1/fleet/status

# Get research metrics
curl http://localhost:8787/api/v1/export/summary

# WebSocket connection
wscat -c ws://localhost:8787/ws/live?vesselId=test
```

## Common Issues

### Port 3000 already in use

```bash
# Kill process on port 3000
lsof -ti:3000 | xargs kill -9

# Or use different port
npm run dev -- --port 3001
```

### WebSocket connection fails

Check that the Cloudflare backend is running:
```bash
cd cloudflare
npm run dev
```

### TypeScript errors

```bash
# Regenerate TypeScript config
cd mission-control
npx tsc --init
```

## Next Steps

- [Deploy to Cloudflare](deployment/cloudflare-pages.md)
- [Read the Architecture Guide](architecture.md)
- [Explore Research Validation](../README.md#research-validation)

## Need Help?

- 📖 [Full Documentation](https://github.com/kakashi3lite/abyssal-twin/tree/main/docs)
- 🐛 [Report Issues](https://github.com/kakashi3lite/abyssal-twin/issues)
- 💬 [Start Discussion](https://github.com/kakashi3lite/abyssal-twin/discussions)
