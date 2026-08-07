# Known Issues & Workarounds

## RESOLVED: Cloudflare Config Audit — Dead Hosts + Obsolete Pages Pipeline (Phase 8.5 — 2026-08-08)
Full Cloudflare configuration audit with live verification found and fixed:
- **`deploy.yml` hit dead hosts**: production env `url: https://abyssal-twin.dev` and
  `curl https://abyssal-twin.dev/health` — `*.abyssal-twin.dev` is NXDOMAIN (the real
  zone is `dalecabra.com`), and health moved to `/api/v1/health` (Phase 6.5). Fixed to
  `https://abyssal-twin.swanandtanavade100.workers.dev/api/v1/health`. Staging smoke + E2E
  steps pointed at `staging.abyssal-twin.dev` — repointed to the live worker.
- **`deploy.yml` RQ2 step said "SKIPPED (metrics not yet configured)"** — stale after
  Phase 8 made fleet resilience measurable. Now runs
  `cargo test --test fleet_resilience` and asserts the measured targets.
- **`cloudflare-pages.yml` conflicted with the worker-assets deployment** (Phase 6.5
  canonical path): it built the dashboard with a dead `VITE_API_BASE=api.abyssal-twin.dev`
  and deployed to a Pages project that (a) auto-creates a conflicting asset host and
  (b) cannot reach the API (CORS locked to the Access origin). Now builds same-origin
  (empty base) and the deploy job is a deprecation notice (no Pages project created).
- **Legacy `mission-control/src/main.ts`** (unbundled demo entry) had dead
  `staging.abyssal-twin.dev` runtime defaults — made same-origin.
- **`dashboard.html` / `simulate-dashboard.sh`** still displayed `GET /health` — now
  `/api/v1/health`.

### Live verification (active results)
- Endpoints: `/api/v1/health` 200 · dashboard `/` 200 · SPA fallback 200 ·
  `/fleet/status` 401 no-auth · `/fleet/stream` 401 · `/metrics` 401 · `/ingest` 401
  bad-token · simulate SSE streaming · CORS preflight 204 with correct origin ·
  Access origin 401 (challenge).
- D1 `abyssal-fleet` (remote): tables `vehicles/state_vectors/anomalies/missions` all
  present; migrations 0001/0002/0003 applied; **8 vehicles, 3,118 state vectors,
  48 anomalies, 1 mission** — live data confirmed.
- R2 `abyssal-missions` bucket exists · `INGEST_TOKEN` + `CLOUDFLARE_API_TOKEN` secrets
  set · Access JWKS (RS256) served at pinned issuer `abyssal-twin.dalecabra.com` ·
  wrangler dry-run config valid · worker TS 95/95 · E2E 7/7 · active version `1e31c13d`.

## RESOLVED: RQ2 Fleet Resilience — Empirically Measured (Phase 8 — 2026-08-08)
The flagship fleet-resilience numbers were **claimed, not measured**: "<45s partition
recovery" and "98.7% fleet coherence" were hardcoded in `README.md`, `dashboard.html`,
`mission-control/README.md`, and `docs/screenshots/`, but `experiments/rq2_federation/`
did not exist and CI marked RQ2 validation "SKIPPED (metrics not yet configured)".

**Fix — measured the real algorithm** (`src/iort_dt_federation/src/simulation.rs` +
`tests/fleet_resilience.rs` + `examples/fleet_resilience.rs` + `experiments/rq2_federation/`):
- Drives the REAL `FederationManager` (timestamp-ordered merge, Kalman partition-heal)
  over a Markov loss channel with partition + heal; deterministic (seed 42).
- **Measured**: recovery **8–20 s at ALL loss levels (30–70%)** — the <45s claim HOLDS
  with margin. RMS **< 2 m at all loss levels** (RQ2 target). Coherence **99.7% @30%,
  96% @50%, 85% @70% loss** — >95% at realistic loss; degrades at extreme loss.
- **Honest finding**: the 70%-loss coherence degradation is channel physics — at 70%
  loss a node receives ~1 update per 6.6 s, during which a 0.5 m/s AUV moves ~3.3 m
  (trace showed stale estimates 2–4 s old). No merge can fix a gap the channel creates;
  **dead-reckoning prediction is the documented improvement path**.
- **Gotchas hit & fixed**:
  - The no-partition test used `partition_start_s=1e9` → **5×10⁸-iteration loop** (hang).
    Added explicit `Scenario.has_partition` flag.
  - Aging a stale estimate's timestamp during partition created timestamp-ties that
    blocked the timestamp-ordered merge — timestamps must stay at last-received.
  - Coherence measurement must sample POST-convergence only, or the recovery transient
    contaminates the steady-state metric.
- All hardcoded `98.7%` / `<45s` claims replaced with the measured values.
- `test-rq2` no longer requires Docker; `test-e2e.sh` Phase 5 runs the real simulation.
- **Regression**: federation crate 26 + 5 fleet-resilience tests; results in
  `experiments/rq2_federation/results.json`.

## RESOLVED: Compliance Overclaims in Commercial Docs (Phase 8 — 2026-08-08)
`README_COMMERCIAL.md` claimed "SOC 2 Type II ✅ Certified", "ISO 27001 ✅ Certified",
"FIPS 140-2 ✅ Level 2 Compliant", "99.99% SLA", and published **fabricated customer
testimonials** — all with no evidence and some contradicting the implemented security
posture (claimed AES-256-GCM/HSM; the real stack is Zenoh TLS + HMAC-8 + Access JWT).
- **Fix**: compliance table re-scoped to honest roadmap status; security section now
  documents the REAL implemented posture (Zenoh TLS, HMAC-SHA256-8B, Access JWT
  issuer-pinning, ITAR via CF-IPCountry); fabricated testimonials replaced with a
  transparent "pre-commercial validation" section listing the reproducible evidence
  (RQ1-RQ5, live deployment, security verifications). Fleet-scale perf table marked
  "design targets, not yet measured".

## RESOLVED: Rust-WASM Engine + Futuristic Cockpit (Phase 7 — 2026-08-08)
Mission Control upgraded to the "Abyssal Command Deck" — a 3-zone 12-column cockpit with a
**Rust-WASM computation engine** running the real fleet-tier math in the browser:
- **New crate `src/iort_twin_wasm/`** (pure Rust, NO tokio/zenoh → wasm32-safe): 47-byte wire
  decode + CRC-16/CCITT-FALSE, inverse-covariance Kalman fusion, CUSUM (production h=10.5/k=0.5),
  PNR energy model. 19 native tests; 63KB wasm (`opt-level="s"`, lto, strip).
- **WASM verified live in Node**: `engine_version: iort-twin-wasm 1.0.0`; CRC check-values
  (empty=0xFFFF, "123456789"=0x29B1); CUSUM alarmed on +1σ (samples=22, direction=increase);
  Kalman fused x=10.099 favoring the certain estimate; PNR 2380min.
- **Gotchas hit & fixed**:
  - Duplicate `#[wasm_bindgen]` export (`symbol crc16_ccitt_false already defined`) — module
    fns stay plain `pub fn`; the JS surface lives in lib.rs wrappers.
  - wasm-bindgen `--target web` init fetches via `fetch(URL)` → Node rejects `file://`; pass a
    compiled `WebAssembly.Module` to `init()` for native smoke tests.
  - TS: leading-slash dynamic import defeats ambient `declare module "/path"` under bundler
    resolution — use a variable specifier + `@vite-ignore` (typed via local interface).
  - TS lib.dom lacks WebGPU types — GPU objects typed `any` with numeric usage flags
    (UNIFORM=0x4, COPY_DST=0x8).
- **Dashboard**: `App.tsx` re-laid to `grid-cols-12` (left rail 3 / center 6 / right rail 3);
  new `FleetStats`, `AcousticLink` (derived cadence health), `CusumLive` (WASM S⁺/S− gauges with
  exact-math JS fallback + "variance-proxy" honesty label), `ExportPanel`, `TelemetryStrip`
  (h-[72px] under the 560px map), footer with WASM engine badge; `AuroraField` WebGPU canvas
  (WGSL) with Canvas2D fallback + `prefers-reduced-motion` static frame.
- **Regression**: mission-control tests 11 → 20 (9 new wasmFallback parity tests); build clean;
  deployed `638325a1`; live: dashboard 200, `/wasm/iort_twin_wasm.js` 200, wasm binary 200,
  Access domain 401 (expected), health JSON healthy.
- **Makefile**: `test-wasm` target added to `test-all` (Rust suite now 19+26+30).

## RESOLVED: Dashboard Never Deployed + Dead API Base (Phase 6.5 — 2026-08-08)
Live topology audit found the Mission Control dashboard was **not deployed anywhere**:
- No `abyssal-mission-control` Pages project existed (`wrangler pages project list` → absent).
- The baked bundle pointed at `VITE_API_BASE=https://api.abyssal-twin.dev` — **NXDOMAIN** (never
  resolved), so even a deployed dashboard could not reach the API.
- The Access-protected origin `abyssal-twin.dalecabra.com` is a **custom domain on the
  `abyssal-twin` worker** (confirmed via Workers API) serving the API only (`/assets` → 404).

**Fix — serve the dashboard from the SAME Access-protected origin as the API**:
- `cloudflare/wrangler.toml`: `[assets] directory="../mission-control/dist"`, `binding="ASSETS"`,
  `not_found_handling="single-page-application"`, `run_worker_first=true` (API routes win).
- `index.ts`: `app.notFound` falls through to `env.ASSETS.fetch()` (SPA deep links → index.html);
  health moved to `/api/v1/health` (docs contract — root now serves the dashboard).
- `.env.production`: same-origin (empty base → relative URLs → Access cookie flows naturally).
  Dashboard rebuilt (`main-D0c-recF.js`), dead host gone.
- **Result (verified live)**: `abyssal-twin.swanandtanavade100.workers.dev/` serves the dashboard
  HTML + assets (193KB JS); `/api/v1/health` → JSON; API still 401 without creds and for forged
  JWTs; SPA deep links → 200; `abyssal-twin.dalecabra.com` still Access-challenged (401).
- Tests: 95 TS (health test now hits `/api/v1/health`), mission-control 11, E2E 7/7.

## RESOLVED: Zenoh TLS + HMAC Key + Gateway Client-Mode (Phase 6 — 2026-08-08)
Production hardening of the acoustic transport (C5):
1. **CRITICAL — gateway bound the router's port**: the gateway loaded the router-mode
   `docker/zenoh/acoustic.json5` (listen tcp/udp 7447) as its OWN session config, so it
   tried to bind 7447 and collided with the docker router ("Address already in use").
   The gateway is a CLIENT — new `edge-gateway/zenoh-client.json5` (mode=client,
   connect tcp/localhost:7447); `config.toml` updated. Verified: `mode: Client`,
   session established, no port conflict.
2. **Zenoh TLS transport (C5)**: enabled `transport_tls` feature; `AcousticTlsConfig`
   (root_ca, listen/connect keys+certs, mTLS, verify_name) with `${ENV}` resolution;
   `apply_zenoh_tls()` injects the TLS block into the session config
   (`transport/link/tls/...` — verified against Config::keys(); NOT
   transport/unicast/link/tls). New `scripts/ci/generate_zenoh_tls.sh` (ECDSA P-256,
   595B CA — 89% smaller than RSA per RQ4). Empty certs = plaintext (dev unchanged).
3. **HMAC key rotation**: generated a real 43-char key (`secrets.token_urlsafe(32)`),
   wired as `hmac_key = "${ACOUSTIC_HMAC_KEY}"` in config.toml (never committed),
   documented in `.env.example`. Live E2E verified with the REAL key: secured 57B
   frame for auv_1 → gateway `Received state update` (x=11.0 y=22.0 battery_dv=230,
   persisted to SQLite synced=0); plain 47B frame → `Unauthenticated frame rejected
   (HMAC mode) bytes=47`.
4. **Tests**: +5 gateway tests (TLS enabled/disabled, TLS block injection,
   plaintext unchanged, env-ref resolution ×3, real-key cross-tier — env-gated,
   skips without ACOUSTIC_HMAC_KEY). Gateway 30, federation 26.
- **Verify live**: `ACOUSTIC_HMAC_KEY=$(cat /tmp/acoustic_hmac_key.txt) cargo test`;
  gateway log shows `Per-message HMAC auth ENABLED`.

## RESOLVED: Empirical ARL₀ Monte Carlo — Siegmund Divergence Found & Recalibrated (Phase 5 — 2026-08-08)
The RQ3 guarantee "ARL₀ > 10,000" was only validated **theoretically** (Siegmund). The reference mandates empirical Monte Carlo validation because Siegmund deviates 20-40% under real conditions. Phase 5 built the validator and **it caught a real failure**:

1. **Finding**: at the default `h=10.0`, Monte Carlo (10K runs) showed the **7-dimension any-alarm ARL₀** — the deployed fleet metric (any of 7 residual dims alarming) — had 95% CI lower bound **≈9.7k, BELOW the 10,000 guarantee**. Per-dimension ARL₀ (≈64k) and theory (22k) both cleared, but multi-dimension compounding (~0.17× per-dim) broke the fleet guarantee. This is exactly the Siegmund divergence the reference warns about.
2. **Fix**: recalibrated default `threshold_h` **10.0 → 10.5** in `CUSUMConfig`. At h=10.5: empirical 7-dim ARL₀ ≈ 16,842 (CI₉₅ low 15,996), detection delay ≈17s at 1.5σ/0.5Hz (target <120s).
3. **New tooling**:
   - `ARLBounds.empirical_arl0()` + `ARLBounds.validate_empirically()` (numba `@jit` single-run simulator `_cusum_false_alarm_time`, mean/median/std/95% CI/censored runs, packet-loss + multi-dim support).
   - `tests/property/test_rq5_empirical_arl0.py` — 8 tests (per-dim target, 7-dim compounding, packet-loss monotonicity, threshold monotonicity, recalibration path). **All validate the deployed default config**.
   - `scripts/attacks/validate_arl0_montecarlo.py` — 10,000-run publication run publishing BOTH values.
   - Makefile `test-rq5` wired into `test-all`; `rq5` pytest marker registered.
4. **Publish BOTH values** (h=10.5, 10,000 runs): per-dim theoretical 36,316 vs empirical **96,103** (CI₉₅ [94,746, 97,460]); 7-dim empirical **16,566** (CI₉₅ [16,244, 16,887]); detection delay 16.9s; ARL₀ monotone in packet loss (96,457 → 157,128 at 0→70%).
- **Regression**: RQ3 15/15 + RQ5 8/8 pass; full `make test-all` green.

## RESOLVED: Cloudflare Access JWT — Key-Confusion + Route Coverage (Phase 4.6 — 2026-08-08)
The JWT middleware verified RS256 but had a **critical bypass** and was barely wired to routes. Fixed:
1. **CRITICAL — JWKS key-confusion (auth bypass)**: the JWKS endpoint was derived from the **token's own `iss` claim** (`${payload.iss}/cdn-cgi/access/certs`). An attacker could mint a JWT (`iss: https://evil.example`, `aud` = the public AUD tag, `role: admin`), host a fake JWKS at `evil.example/cdn-cgi/access/certs`, and the worker would validate against the *attacker's* key → full admin. Fixed by **issuer pinning**: `validateIssuer()` accepts only the configured `ACCESS_ISSUER` or `https://*.cloudflareaccess.com` (Cloudflare-controlled namespace); JWKS is fetched only from that pinned issuer.
2. **Route coverage**: `requireAuth` only guarded `/metrics`. Now mounted inside `fleetRoutes`/`missionRoutes`/`anomalyRoutes`/`metricsExportRoutes` (`.use("*", requireAuth("researcher"))`) + SSE stream + WS proxy. Only `/`, health, ingest (own bearer auth), and simulate remain open.
3. **Service-token support (C5/M2M)**: `requireAuth` accepts either an Access JWT **or** `Authorization: Bearer {INGEST_TOKEN}` (timing-safe) so the edge gateway's `/api/v1/fleet/status` download keeps working. Gateway WS client now sends the Bearer header on `/ws/live` upgrade (was unauthenticated).
4. **Hardening**: `kid` required + matched (no silent `keys[0]` fallback); `iat`/`nbf` validated with clock skew; `exp` required; JWKS key cache TTL 5 min.
5. **Dashboard**: `api.ts` + `useFleetSSE` now send `credentials: "include"` / `withCredentials` so the Access `CF_Authorization` cookie flows on protected endpoints.
- **Config**: `ACCESS_ISSUER` added to `types.ts` + `wrangler.toml` (prod = `https://abyssal-twin.dalecabra.com`, the host serving `/cdn-cgi/access/certs`).
- **Tests**: +10 auth tests (issuer pinning/typosquatting, key-confusion rejection, timing-safe, iat/nbf); TS 90, gateway 22+26 Rust, mission-control 11, E2E 7/7.
- **Verify live**: `curl -H "CF-Access-JWT-Assertion: forged" https://.../api/v1/fleet/status` → 401; gateway with Bearer token → 200.

## RESOLVED: Acoustic-Layer Security — HMAC-8 + Replay + ITAR (Phase 4.5 — 2026-08-08)
Per-message authentication (C5) implemented and verified live across the acoustic link:
- **HMAC-8 per-message auth (C5/RQ4)**: new `security.py` signs frames as `[2B seq BE][8B HMAC-SHA256][47B payload]` = **57 bytes** (10B overhead, zero payload shrinkage). Gateway `zenoh_bridge.rs::verify_secure_packet` verifies with constant-time compare. Toggle: `acoustic.hmac_key` empty = plain 47B mode; set = **fail-closed** (unauthenticated frames rejected with `Unauthenticated frame rejected (HMAC mode)`). Cross-tier golden vectors Python↔Rust verified (`002a7eb2ac24d3063c77`).
- **Replay detector**: per-AUV `ReplayDetector` — accepts monotonic + bounded reordering (grace 8 frames, acoustic reality), rejects stale/replayed frames on both plain (internal u32 seq) and secure (outer u16 seq) paths.
- **ITAR/data-residency fix**: middleware was mounted at `app.use("/api/v1/ingest/*")`, which can miss the bare `/api/v1/ingest` path. Moved into the sub-app (`ingestRoutes.use("*", dataResidency())`) so the US-only write check + immutable R2 audit trail run on every ingest POST.
- **Makefile**: `test-rq4` now runs the new `tests/property/test_rq4_hmac.py` (7 tests) and is wired into `test-all`.
- **Verified live**: HMAC-secured publisher (57B frames) → gateway secured mode → production SSE (`batteryPct=96`); plain 47B frame injected into the secured bridge was **rejected**. Tests: +9 Rust (HMAC golden/tamper/wrong-key/replay), +7 Python RQ4; gateway 22, TS 82, mission-control 11, E2E 7/7.

## RESOLVED: Battery in the Wire + PNR (Phase 3.5 — 2026-08-08)
The 47-byte frame always carried `battery_dv` (byte 37) but the pipeline dropped it, so the dashboard's PNR engine showed "N/A". Carried it end-to-end:
- `FederatedDTState` (Rust) + `battery_dv: u8`; `zenoh_bridge::decode_state_vector` maps byte 37; conservative MIN in both Kalman fusions (Rust + TS DO) — never overestimate energy after a partition.
- Gateway `local_cache` stores `battery_dv`, emits `batteryPct` (=dv/255×100) in the sync JSON.
- D1 migration `0003_battery.sql` (`battery_pct REAL`); ingest/checkpoint insert it; `/fleet/status` + SSE expose it.
- Dashboard: `useFleetSSE` parses `batteryPct`; `SafetyEngine.calculatePointOfNoReturn` **refuses to compute PNR from healthScore** — returns `UNAVAILABLE` when battery is absent (honesty contract); App.tsx runs real PNR per asset → PNR gauges + `pnr_breach`/`battery_low` map alerts.
- **Verified live**: publisher → gateway → production SSE showed `batteryPct=96` (245/255). Tests: 82 TS, 11 mission-control (incl. 3 new SafetyEngine honesty tests), 26+13 Rust, E2E 7/7.

## RESOLVED: Ingest Auth (Phase 4 — 2026-08-08)
`POST /api/v1/ingest` was wide open — anyone could inject fleet state. Now:
- **Bearer-token auth** in `routes/ingest.ts`: timing-safe comparison against `env.INGEST_TOKEN`; fails closed (unconfigured = 401). Gateway's `CF_API_TOKEN` must equal it.
- **Rate limit**: per-IP 120 req/min (in-memory token bucket, deterrent on Free plan).
- **Secret management gotcha (documented)**: a `[vars]` entry with the same name **overrides** the secret — keep `INGEST_TOKEN` OUT of `[vars]`; production value via `wrangler secret put INGEST_TOKEN` (use `printf '%s'` — a trailing newline from `echo` corrupts the secret). Dev/test value lives in `[env.dev.vars]` only.
- **Verified live**: no token → 401, wrong token → 401, correct token → 200; real gateway with `CF_API_TOKEN` set syncs (initial 401s were transient secret propagation). Tests: +2 auth tests (82 total).

## RESOLVED: Dashboard — Real Data + Abyssal Dark Mode (Phase 3 — 2026-08-08)
The deployed dashboard (`mission-control/`) was rendering **client-side demo data** (`DemoDataEngine` + `MOCK_VEHICLES`); the real API client (`main.ts`) was dead code. Rewired for operator trust and tactical aesthetics:

1. **Real data wiring (CRITICAL)** — `App.tsx` now uses `useFleetSSE` (ported from `cloudflare/pages`): initial `/fleet/status` REST snapshot → `/api/v1/fleet/stream` SSE → auto-fallback to `/api/v1/simulate` with an honest SIMULATION badge; exponential backoff. New `lib/config.ts` (`apiUrl`) routes REST through `VITE_API_BASE`/`VITE_SSE_URL` origin for deployed cross-origin; Vite dev proxy `/api → localhost:8787` added.
2. **Honest adapter (`lib/fleetAdapter.ts`)** — backend state → `FleetAsset`: x/y anchored to `MISSION_ORIGIN` (configurable), missionPhase→operationalMode, healthScore 0-255→%. **Never fabricates battery/PNR** — `etPnr` stays null and the UI shows "—"/"N/A" (a PNR call is a $1M+ decision). Alerts derived only from real flags (anomaly → critical, partitioned → communication_loss, health<128 → health_warning).
3. **Backend anomalies surfaced** — banner polls `/api/v1/anomalies?acked=false`; Acknowledge POSTs `/api/v1/anomalies/:id/ack` (D1). Quick Actions: CSV exports wired to `/api/v1/export/*`; Emergency Return / Safety Thresholds honestly disabled (command uplink is Phase 4) instead of dead buttons.
4. **Abyssal Dark Mode** — bioluminescent palette (bio cyan/green/amber/red on `#04060f` void), glassmorphism (`.glass-card`), HUD corner brackets + scanlines, JetBrains Mono tabular-nums, UTC clock (Z-time), `prefers-reduced-motion`. Header shows LIVE/SIMULATION/LINK-DOWN provenance + online/partitioned/anomalous counts.

**Verified live**: dev stack (worker :8787 + dashboard :3001 with proxy) — `/fleet/status` returns seeded vehicles, SSE carries injected state (LIVE path), `/simulate` fallback works, HTML loads. Tests: 8 `fleetAdapter` unit tests; tsc + vite build clean.

## RESOLVED: Docker Stack (Phase 1.4 — 2026-08-07)
- **Status**: ✅ FIXED — `docker compose -f docker/docker-compose.simulation.yml up -d` brings up all 7 services; federation stable with visible logs.
- **Three root causes fixed**:
  1. `docker/federation/Dockerfile` dummy-source dependency-caching shipped the no-op `fn main(){}` binary (container exited 0 silently). Removed the dummy prebuild → direct `cargo build --release`; added `ENTRYPOINT` (distroless has no default command).
  2. `RUST_LOG=iort_dt_federation=info` filtered on the LIB crate, but main.rs is the BIN crate (target `iort_federation`) → all logs discarded. Use `RUST_LOG=iort_federation=info,iort_dt_federation=info`. (Also routed tracing to stderr — unbuffered — in main.rs.)
  3. macOS AppleDouble `._*` files break buildx ("failed to xattr ... operation not permitted") — this volume regenerates them on every file write. Fix: repo-root `.dockerignore` + `docker/stonefish/.dockerignore` with `._*`/`**/._*` + `scripts/clean-appledouble.sh` to delete them before builds/tests/migrations.
- **Known limitation**: stonefish + ros2 Dockerfiles are documented stubs (healthcheck `true`, sleep). Full simulator is Phase 2 scope.

## RESOLVED: Full Pipeline — 47-byte Fleet Tier → Cloudflare (Phase 2.5 — 2026-08-08)
Verified the complete chain live: **Python AUVStateVector (47B) → Zenoh router → gateway bridge → SQLite → zstd sync → Cloudflare ingest → DO → D1 → SSE** (AUV circling on the dashboard, x/y/yaw updating in the stream).

Findings fixed:
1. **Fleet tier never published (CRITICAL, gap)** — the repo had ZERO Zenoh publishers; `iort/dt/*/state` existed only as config strings. Added `src/iort_dt_compression/iort_dt_compression/acoustic_publisher.py` (47-byte publisher + bridge-schema anomaly JSON).
2. **Wire-format mismatch (CRITICAL)** — the bridge only did `bincode::deserialize::<FederatedDTState>`, which would reject the 47-byte struct the fleet tier produces (bincode vs big-endian struct are incompatible). Added `decode_state_vector()` to `zenoh_bridge.rs`: validates length + CRC-16/CCITT-FALSE, decodes mm→m, wire_yaw×100→radians, flags→anomaly/mission_phase; falls back to bincode. Golden test uses a real Python-generated frame.
3. **Gateway cache FK bootstrap (HIGH)** — `LocalCache::open` creates the schema without vehicle rows, so the first decoded frame from any AUV failed the FK insert. `insert_state`/`insert_anomaly` now auto-register unknown vehicles (INSERT OR IGNORE).
4. **Timestamp lost in sync (CRITICAL)** — `get_unsent_states` hardcoded `"timestamp": 0.0`; the DO's timestamp-ordered merge then rejected EVERY decoded state. Now stores/reads the real timestamp (epoch-text in cache, ISO-8601 in D1 for `/fleet/history`). Also fixed `get_latest_states`.
5. **Stuck-in-Emergency trap (HIGH)** — only P1 state uploads report transfers to the bandwidth monitor, but P1 is disabled in Emergency → the tier could never recover. P0 anomaly uploads now also call `report_transfer`, giving Emergency a measurement path.

**Verified live**: SSE samples 10s apart showed x=19.28/y=-15.91 → x=17.10/y=18.23 (moving), timestamp advancing, mission_phase/health decoded from flags. Tests: 13 gateway (4 decoder + 3 cache), TS 80, Python 22, E2E 7/7.

## RESOLVED: DO Gossip Protocol + WebSocket Proxy (Phase 2.4 — 2026-08-08)
Verified the 4-phase gossip protocol live in production with 2 real WebSocket vessels. Three bugs found and fixed:

1. **WebSocket proxy pathname bug (CRITICAL)** — `index.ts` built the DO URL with `url.pathname = "/ws?vesselId=10"`. Setting `pathname` percent-encodes `?` as `%3F`, so the DO received `/ws%3FvesselId=10` and its `/ws` route 404'd — **every WebSocket upgrade failed silently in production** (the old test only checked the non-upgrade 426 path). Fixed: set `url.pathname = "/ws"` then `url.searchParams.set("vesselId", ...)`.
2. **DO hibernation clock crash (CRITICAL)** — after a storage round-trip the restored VectorClock is a plain `{ clocks: Map }` object (prototype lost), so `clock.toBytes()` throws. `handleMerkleRoot` called `MerkleTree.fromStates` on un-rehydrated state → every merkle_root after hibernation killed the WebSocket (close 1006). Other handlers rehydrated; `handleMerkleRoot` didn't. Fixed: exported `rehydrateClock()` handles all 3 shapes (live instance, `{id:time}` JSON, `{clocks:Map}` structured-clone) and is now applied at every fleet-state consumer.
3. **D1 checkpoint FK failure blocking the whole fleet (HIGH)** — `checkpointToD1` inserts every fleetStates entry into `state_vectors`; one AUV not in `vehicles` made the entire `db.batch()` fail, so **no fleet state was checkpointed** (error every 30s alarm cycle). Fixed: `INSERT OR IGNORE INTO vehicles` auto-registers unknown auv_ids first (also in `persistAnomalies`).

**Verified live in production**: all 4 gossip phases (merkle_root → request_leaves → state_update / partition_heal), timestamp-ordered merge, inverse-covariance Kalman fusion (`x=123.56, σ²=0.0488` from fusing 123.4/σ²0.05 with 130.0/σ²2.0), conservative merge rules (health MIN, anomaly OR), 2-vessel broadcast. Tests: 8 gossip tests (4 phases + proxy upgrade + rehydrateClock×3), TS 80, E2E 7/7.

## RESOLVED: Gateway → Cloudflare Ingest Pipeline (Phase 2.3 — 2026-08-08)
Verified end-to-end: gateway SQLite buffer → zstd → production ingest → D1 → `fleet/status`. Four bugs found and fixed:

1. **zstd decompression mismatch (CRITICAL)** — `ingest.ts:decompressZstd` used `DecompressionStream("deflate")`; Workers only supports gzip/deflate/deflate-raw (no zstd), so every gateway P1 batch returned 400. Fixed with `fzstd` (pure-JS zstd frame decoder, no WASM). **Secondary discovery**: Cloudflare's edge intercepts `Content-Encoding` request headers — sending `Content-Encoding: zstd` corrupts the body before it reaches the Worker (verified: identical body WITHOUT the header decodes fine). Fix: decode by **payload sniffing** the zstd magic `28 B5 2F FD` instead of trusting the header. Robust to any edge behavior.
2. **P0 anomaly payload shape (CRITICAL)** — `sync_engine.rs` posted a bare JSON array to `/api/v1/ingest`, but the contract is `{states, anomalies}` → every P0 anomaly returned 400 "No data in batch". Fixed: wrap anomalies in the envelope.
3. **Sync engine Emergency bootstrap deadlock (CRITICAL)** — `BandwidthMonitor` started at 0 kbps = Emergency, and the sync engine skips P1 state sync in Emergency → nothing ever reported a transfer → gateway could never sync on boot. Fixed: `current_tier()` returns **Full** until the first transfer is measured (`has_measurement` flag), then the EMA takes over and adapts downward.
4. **Zenoh failure killed the whole gateway** — `main.rs` `tokio::select!` fired on the (non-fatal) Zenoh bridge error and cancelled the sync engine. Fixed: Zenoh is now detached and non-fatal (offline-first, C3); the gateway keeps syncing its buffer during acoustic outages.

**Regression coverage added**: 3 new ingest tests (zstd with header, zstd magic-sniff without header, anomaly envelope) + 1 bandwidth bootstrap test. Tests: 72 TS, 26+6 Rust, 22 Python, E2E 7/7.

## NEW (2026-08-07): Ingest Route Has No Authentication
- **File**: `cloudflare/src/routes/ingest.ts` (mounted at `/api/v1/ingest`)
- **Severity**: HIGH — any internet caller can inject fleet state, anomalies, or DoS the D1/DO pipeline
- **Evidence**: `grep` for `Authorization|Bearer|requireAuth|CF_API_TOKEN` in `cloudflare/src/**` matches only `index.ts:44` (`/metrics`). The Rust gateway sends `Authorization: Bearer {CF_API_TOKEN}` but the Worker never validates it. Only the ITAR `dataResidency()` middleware (`CF-IPCountry`) runs on the ingest path.
- **Fix (planned, Phase 4)**: Add a bearer-token check comparing against a `CF_API_TOKEN` env var (or an HMAC of it) before the ITAR check. Never log the token. Rate-limit ingest.
- **Workaround**: None today — treat ingest as public until fixed.
- **Note**: Also relevant to Access setup — if the whole API hostname is later put behind Access, the gateway's machine-to-machine ingest must use a **service token**, and `auth.ts` must learn to accept service-token requests (it currently validates JWTs only).

## RESOLVED: JWT Signature Verification (Phase 1.1 — 2026-08-07)
- **File**: `cloudflare/src/middleware/auth.ts`
- **Status**: ✅ FIXED — `crypto.subtle.verify()` is wired in. The current implementation:
  1. Enforces `alg === "RS256"` (rejects algorithm confusion)
  2. Enforces `exp` with 30s clock-skew tolerance
  3. Validates `aud` against `ACCESS_AUD` env var (cross-app token isolation)
  4. Fetches JWKS from `<iss>/cdn-cgi/access/certs`, caches CryptoKey per `kid`
  5. Verifies RS256 signature via `verifyJwtSignature()` (exported, unit-tested)
  6. Suppresses internal error details in production 401 responses
- **Remaining action**: Set `ACCESS_AUD` to the Cloudflare Access application AUD tag in `wrangler.toml` for staging/production. Until set, audience validation is skipped (backward compatible).
- **Tests**: `cloudflare/test/auth.test.ts` covers signature pass/fail, tamper detection, malformed tokens, and role hierarchy.

## RESOLVED: Bandwidth Monitor Threshold Mismatch (Phase 1.2 — 2026-08-07)
- **File**: `edge-gateway/src/bandwidth_monitor.rs:current_tier()`
- **Status**: ✅ FIXED — `current_tier()` now uses boundary checks: `kbps < emergency (10)` → Emergency, `kbps < mission (50)` → Mission, else → Full.
- **What was wrong**: Two `>=` checks misclassified 10-50 kbps as Emergency and 50-100 kbps as Mission. The 10-50 kbps band was unnecessarily throttled to heartbeat-only during real missions.
- **Tests**: 6 unit tests in `bandwidth_monitor.rs` cover the 1/9/10/30/49/50/75/150 kbps boundaries, tier parameters, EMA smoothing, and the Full-tier bootstrap (see Phase 2.3 — a fresh monitor reports Full until the first transfer is measured).
- **Note**: `full_threshold_kbps` (100) is now an informational "fully healthy" marker; the Full tier floor is `mission_threshold_kbps` (50) per the tier contract.

## RESOLVED: 2 Failing CUSUM Property Tests (Phase 1.3 — 2026-08-07)
- **Files**: `tests/property/test_rq3_arl.py` (not `detectors.py` — the detector was correct)
- **Status**: ✅ FIXED — 22/22 property tests pass
- **Actual root cause**: Fault-injection magnitude was below the detector's sensitivity floor, NOT Siegmund approximation divergence:
  - `test_cusum_detects_thruster_fault_in_simulation` injected `0.20×2.0×σ` = **0.4σ** while its comment claims "~1.5σ". CUSUM with `k=0.5` is blind to shifts ≤0.5σ (`z - k ≤ 0`), so the statistic decayed and no alarm fired.
  - `test_cusum_outperforms_threshold_baseline` injected `0.25×2.0×σ` = **0.5σ** (exactly at the k=0.5 blind spot) → CUSUM F1 ≈ 0.02 vs threshold F1 ≈ 0.05.
  - `detectors.py:verify_guarantees` models a 20% thruster fault as **1.5σ** — the tests contradicted their own model.
- **Fix**: Inject the documented 1.5σ shift (`r[6] += 1.5 * nominal_std[6]`). Lowering k/h instead would have violated the ARL₀ > 10,000 guarantee — the wrong trade.
- **Empirical ARL₀ note**: `test_empirical_arl0_validates_theory` passes (empirical ARL₀ > 5,000 at 50K steps), so the earlier "Siegmund divergence" hypothesis was not the cause.

## RESOLVED (Phase 1.5 — 2026-08-07): `blockConcurrencyWhile` Is NOT Deprecated
- **File**: `cloudflare/src/federation-coordinator.ts`
- **Status**: ✅ NOT AN ISSUE — verified against current Cloudflare docs (best-practices page updated Jul 3, 2026): "Access Durable Objects Storage → Initialize instance variables from storage" explicitly recommends `ctx.blockConcurrencyWhile(async () => { this.value = await ctx.storage.get(...) })` in the constructor. `FederationCoordinator` uses exactly this pattern — correct, keep as-is.
- **KV API on SQLite-backed DOs**: Docs confirm SQLite-backed DOs fully support the KV key-value API (`storage.get/put/delete/list`, stored in hidden `__cf_kv` table) alongside the SQL API. Our `storage.put("fleetStates", ...)` / `storage.get("fleetStates")` is valid. SQLite DO value limit = 2MB; fleet state for 50 AUVs is <100KB — safe.
- **No code change made** — the cautious audit found the implementation already matches official best practice. (The earlier "may be deprecated" concern in this doc was based on the DO limits page not prominently listing the method; the best-practices reference confirms it's current and recommended.)

## Docker Stack Incomplete
- **Files**: `docker/ros2/Dockerfile`, `docker/stonefish/Dockerfile`, `docker/zenoh/Dockerfile`
- **Severity**: MEDIUM — `docker compose up` fails
- **Cause**: Some Dockerfiles are stubs or missing entirely. The MIGRATION_NOTES document this honestly.
- **Workaround**: Use individual service dev servers instead of Docker compose. The simulation engine runs in-process via the Worker (`/api/v1/simulate`), not in Docker.
- **Fix**: Complete Dockerfiles per Phase 1.4. Minimum: Zenoh router Dockerfile (for multi-node testing), Stonefish stub Dockerfile (for ROS2 message generation).

## Mapbox Iframe Approach Broken
- **File**: `mission-control/src/components/GlobalFleetMap.tsx`
- **Severity**: HIGH for dashboard value — fleet assets don't appear on map
- **Cause**: Using iframe with pixel projection math; marker overlays don't sync with Mapbox coordinate system.
- **Fix**: Migrate to `react-map-gl` Map + Marker components with `FlyToInterpolator` and `NavigationControl`. See Phase 3.1 and `MAP_FIX_PLAN.md`.
- **Workaround**: Mapbox token still works for basemap rendering. The list view shows assets with correct data. Map overlay is purely cosmetic in current state.

## Duplicate Simulation Engines
- **Files**: `cloudflare/src/simulation-engine.ts` (TypeScript, server-side) and `mission-control/src/components/DemoDataEngine.ts` (TypeScript/React, client-side)
- **Severity**: LOW — both work independently but duplicate logic (4 vehicles, same PRNG formula, same physics model)
- **Fix**: Consolidate to single source of truth. Options: (a) always use server-side SSE for both dashboards, (b) extract shared simulation logic to a package, (c) have DemoDataEngine proxy the server SSE.
- **Workaround**: Both engines currently produce equivalent output. No user-visible inconsistency.

## WebSocket Client Not Used by Sync Engine
- **Files**: `edge-gateway/src/cloudflare_client.rs` (has `connect_websocket`), `edge-gateway/src/sync_engine.rs` (uses only REST)
- **Severity**: LOW — REST sync works correctly; WebSocket is a future optimization for Full-tier bandwidth
- **Cause**: The `CloudflareClient` implements WebSocket connection, but the sync engine only calls `upload_batch()` (REST) and `upload_json()` (REST). The WebSocket path is wired in the code but never activated.
- **Fix**: Activate WebSocket sync for Full tier (>50 kbps) where real-time bidirectional communication is affordable. Keep REST as fallback for lower tiers.
