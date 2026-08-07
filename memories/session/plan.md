# Abyssal Twin — Session Plan

> Loaded first by the Abyssal Architect agent on every task. Keep concise and current.

## Current Phase: 8.6 — GitHub Sync + Deployment from GitHub (2026-08-08)

**Status: ✅ REPO SYNCED** — all work committed (`934d0ae` + `628a92c`) and pushed to
`github.com/kakashi3lite/abyssal-twin` (origin/main == HEAD). README updated with
production URLs, same-origin config, measured RQ2 results.

### Deployment from GitHub — TWO ACCOUNT-LEVEL BLOCKERS (need user action)
Workflows are registered and trigger on push, but jobs do not start:
1. **GitHub account billing lock** — Actions annotation: *"The job was not started
   because your account is locked due to a billing issue."* Fix in GitHub Settings →
   Billing (resolve the outstanding billing issue).
2. **Misspelled repo secrets** — repo has `CLOUDFARE_API_TOKEN` / `CLOUDFARE_ACCOUNT_ID`
   (missing the L); workflows reference `secrets.CLOUDFLARE_API_TOKEN` (correct).
   Even after billing is fixed, deploys would be simulated until the user runs:
   ```bash
   gh secret set CLOUDFLARE_API_TOKEN   # from Cloudflare API Tokens (Edit Workers)
   gh secret set CLOUDFLARE_ACCOUNT_ID  # Cloudflare account ID
   # VITE_MAPBOX_TOKEN already exists (correctly spelled)
   ```
   (Values must be entered by the user — secrets must not route through the agent.)

### Gotcha (recurring)
- External volume (T9) recreates AppleDouble `._*` in `.git/objects/pack/` whenever git
  writes packs → "non-monotonic index" noise (push still succeeds). Clean with
  `find .git -name '._*' -delete` after git ops. Git currently healthy (fsck clean).

## Current Phase: 8.5 — Cloudflare Config Audit + Live Verification (2026-08-08)

**Status: ✅ COMPLETE** — full CF config audited, gaps fixed, live-verified.

### Audit Findings (all fixed)
- `deploy.yml` referenced dead `*.abyssal-twin.dev` (NXDOMAIN) + wrong health path →
  repointed to `abyssal-twin.swanandtanavade100.workers.dev/api/v1/health`; RQ2 CI step
  ("SKIPPED") now runs the real `fleet_resilience` test.
- `cloudflare-pages.yml` built with dead API base + auto-created conflicting Pages
  project → deprecated; builds same-origin, deploy job = notice (worker assets canonical).
- Legacy `main.ts` + `dashboard.html` + `simulate-dashboard.sh` dead `/health` refs fixed.

### Live Verification (active results)
- Endpoints: health 200, dashboard 200, SPA 200, all protected routes 401, CORS 204,
  Access origin 401, simulate SSE streaming.
- D1 remote: all tables + migrations 0001/0002/0003; **8 vehicles / 3,118 state vectors /
  48 anomalies / 1 mission**. R2 bucket exists. Secrets set (INGEST_TOKEN). Access JWKS
  RS256 at pinned issuer. Dry-run config valid. Tests: worker 95/95, E2E 7/7.
  Active version `1e31c13d`.

## Current Phase: 8 — RQ2 Fleet Resilience Empirically Measured (2026-08-08)

**Status: ✅ COMPLETE** — the "<45s / 98.7%" claims are now MEASURED results,
all hardcoded claims replaced, commercial overclaims re-scoped.

### The Investor-Lens Gap That Drove Phase 8
Fleet-resilience headlines ("<45s partition recovery", "98.7% coherence") were
**hardcoded marketing claims** — no experiment existed (`experiments/rq2_federation/`
missing), CI said "RQ2 SKIPPED (metrics not yet configured)", and E2E Phase 5 just
grepped `cargo test`. README_COMMERCIAL also claimed SOC2/ISO/FIPS certification and
published fabricated testimonials.

### Phase 8 Deliverables
- **`src/iort_dt_federation/src/simulation.rs`** — drives the REAL FederationManager
  (timestamp merge + Kalman heal) over Markov loss + partition + heal; deterministic
  seed 42; `has_partition` flag; post-convergence coherence window.
- **`tests/fleet_resilience.rs`** — 5 integration tests asserting measured targets.
- **`examples/fleet_resilience.rs`** — parameterized CLI + `--trace` (per-estimate debug).
- **`experiments/rq2_federation/validate.py` + README.md + results.json** — full sweep.
- **`Makefile test-rq2`** — no longer requires Docker; **`test-e2e.sh` Phase 5** runs the
  real simulation.
- **Docs**: hardcoded 98.7%/45s → measured values (README.md, dashboard.html,
  mission-control/README.md, SKILL.md); README_COMMERCIAL re-scoped (honest compliance
  roadmap, real security posture, fabricated testimonials removed).

### Phase 8 Measured Values (seed=42, 4 AUVs, 0.5 Hz, σ=0.1m)
| Loss | Recovery (s) | RMS (m) | Coherence % |
|------|--------------|---------|-------------|
| 30%  | 8 | 0.23–0.55 | 98.9–99.7 ✅ |
| 50%  | 8–10 | 0.64–1.17 | 93.5–96.9 ✅ (typical) |
| 70%  | 10–20 | 0.88–1.86 | 82.6–85.2 (channel physics) |

**Headline**: recovery **8–20s at ALL loss** (claim <45s HOLDS, 2× margin) · RMS **<2m
always** · coherence **>95% at realistic loss**; ~85% at 70% loss is channel physics
(1 update/6.6s → 0.5 m/s AUV moves 3.3m between updates) — **dead-reckoning prediction
is the documented improvement path** (next roadmap item).

### Gotchas (Phase 8)
- No-partition test must use `has_partition=false` — `partition_start=1e9` caused a
  5×10⁸-iteration hang.
- Don't bump a stale estimate's timestamp during aging — it creates timestamp-ties that
  block the timestamp-ordered merge.
- Coherence must sample POST-convergence, or the recovery transient contaminates it.

---

## Current Phase: 6 — Production Hardening + Zenoh TLS + HMAC Key (2026-08-08)

**Status: ✅ COMPLETE** — Zenoh TLS (C5), real HMAC key, gateway client-mode fix,
cert generation script, docs updated, live E2E verified.

### Phase 6 Deliverables
- Gateway client-mode Zenoh config (`edge-gateway/zenoh-client.json5`) — fixes the
  router-port collision (was loading router-mode acoustic.json5).
- Zenoh TLS transport: `transport_tls` feature + `AcousticTlsConfig` + `apply_zenoh_tls()`
  (injects `transport/link/tls/...`); ECDSA P-256 certs via
  `scripts/ci/generate_zenoh_tls.sh`; `.env.example` + `[acoustic.tls]` in config.toml.
- Real HMAC key (43-char, `secrets.token_urlsafe(32)`) wired via `${ACOUSTIC_HMAC_KEY}`.
- Live E2E (real key): secured 57B frame → `Received state update` + SQLite
  (x=11.0 y=22.0 battery_dv=230 synced=0); plain 47B frame → rejected (HMAC mode).
- Tests: gateway 30 (incl. TLS injection + real-key cross-tier), federation 26.

## Current Phase: 7 — Rust-WASM Engine + Futuristic Cockpit (2026-08-08)

**Status: ✅ COMPLETE** — deployed `638325a1`, live-verified, all regressions green.

### Phase 7 Deliverables
- **`src/iort_twin_wasm/`** — NEW pure-Rust browser engine (no tokio/zenoh): 47-byte decode +
  CRC-16/CCITT-FALSE, inverse-covariance Kalman fusion, CUSUM (h=10.5/k=0.5), PNR energy.
  19 native tests; 63KB wasm (`opt-level=s`, lto, strip); wasm-bindgen 0.2.126 `--target web`.
- **WASM live-verified in Node** (pass compiled `WebAssembly.Module` to `init` — `file://`
  fetch fails): CRC check-values 0xFFFF/0x29B1, CUSUM +1σ alarm, Kalman 10.099, PNR 2380min.
- **Dashboard 3-zone 12-col cockpit** (`WIREFRAMES_V3.md`): left rail (FleetStats, AcousticLink,
  CusumLive-WASM, ExportPanel) · center (560px map + TelemetryStrip) · right rail (asset,
  fleet, actions) · footer with WASM badge. AuroraField WebGPU (WGSL) + Canvas2D fallback +
  prefers-reduced-motion. JS fallback mirror (`lib/wasmFallback.ts`) — parity-tested.
- **Regression**: mission-control 11→20 tests, build clean, Makefile `test-wasm` in `test-all`.

### Phase 7 Gotchas
- wasm-bindgen `--target web` init uses `fetch(new URL(...))` — Node needs a compiled
  `WebAssembly.Module` passed to `init()` for native smoke tests.
- TS: leading-slash dynamic import defeats ambient `declare module "/path"` (bundler
  resolution) — use a variable specifier + `@vite-ignore`.
- TS lib.dom lacks WebGPU types — GPU objects as `any` + numeric usage flags.
- Duplicate `#[wasm_bindgen]` export on the same fn name = `symbol already defined`.

---

## Current Phase: 6.5 — Dashboard Deployment Gap (2026-08-08)

**Status: ✅ COMPLETE** — dashboard now served from the same Access-protected origin as the API.

### Finding
Mission Control was NEVER deployed (no Pages project) and its baked API base
(`api.abyssal-twin.dev`) was NXDOMAIN. The Access-protected host `abyssal-twin.dalecabra.com`
is a custom domain on the `abyssal-twin` worker.

### Fix
- Worker `[assets]` → `../mission-control/dist`, `run_worker_first=true`, SPA fallback.
- Health moved to `/api/v1/health` (docs contract); root serves dashboard.
- `.env.production` → same-origin (relative URLs) so Access cookies flow.
- Verified live: dashboard+assets served, API 401 for no-creds/forged JWT, Access intact.

## Roadmap Status

| Phase | Status |
|---|---|
| 1.1 JWT RS256 verify | ✅ RESOLVED (verified) |
| 1.2 Bandwidth monitor threshold | ✅ RESOLVED |
| 1.3 CUSUM test failures | ✅ RESOLVED |
| 1.4 Docker stack | ✅ RESOLVED |
| 1.5 blockConcurrencyWhile | ✅ RESOLVED (not deprecated) |
| 2.2 SSE stream fix + CORS | ✅ |
| 2.3 Gateway→Cloudflare ingest | ✅ (zstd, envelope, bootstrap, non-fatal Zenoh) |
| 2.4 DO gossip protocol | ✅ (4-phase, Kalman, proxy fix, rehydrateClock) |
| 2.5 Full 47-byte pipeline | ✅ (decoder, publisher, timestamp/battery) |
| 3 Dashboard (operator psychology) | ✅ (real SSE, dark mode, honest PNR) |
| 3.5 Battery end-to-end + PNR | ✅ (D1 0003, conservative MIN) |
| 4 Ingest auth | ✅ (bearer, rate limit) |
| 4.5 HMAC-8 + replay + ITAR | ✅ (57B frames, ReplayDetector, R2 audit) |
| 4.6 Access JWT hardening | ✅ (issuer pinning, route coverage, service token) |
| **5 Empirical ARL₀ Monte Carlo** | ✅ COMPLETE — h recalibrated 10.0→10.5, 10K run 16,566 CI₉₅[16,244,16,887] |
| **6 Production hardening + Zenoh TLS + HMAC** | ✅ COMPLETE — TLS (C5), real key, client-mode fix, live E2E |
| **6.5 Dashboard deployment** | ✅ COMPLETE — served from Access origin; dead API base fixed |
| **7 Rust-WASM engine + futuristic cockpit** | ✅ COMPLETE — `iort-twin-wasm` crate, WebGPU aurora, 3-zone grid, deployed `638325a1` |
| Zenoh TLS transport | ✅ DONE (Phase 6) |

## Critical Constraints (never violate)
1. 47-byte wire format — no additions without byte-math justification
2. Offline-first — SQLite is truth during partition
3. No DDS-Security on acoustic links — Zenoh TLS + optional HMAC-8
4. Siegmund ARL₀ deviates 20-40% — ALWAYS validate empirically (Phase 5)
5. DO alarm interval ≥ 30s
6. Zenoh HLC may replace custom VectorClock — evaluate before modifying

## Known Gotchas (verified)
- INGEST_TOKEN: `[vars]` overrides secret; use `printf '%s'` with `wrangler secret put`
- Local `/tmp/ingest-token.txt` was DELETED during cleanup — production secret must be
  regenerated to redeploy a gateway (wrangler can't read secrets back)
- AppleDouble `._*` files recur on this volume — clean after edits, vitest excludes them
- HMAC key is still the test value `abyssal-shared-key-1` — rotate before production
- WASM: `--target web` init fetches → Node needs `WebAssembly.Module`; regenerate bindings after
  any `src/iort_twin_wasm` change via wasm-bindgen-cli (0.2.126) into `mission-control/public/wasm/`
