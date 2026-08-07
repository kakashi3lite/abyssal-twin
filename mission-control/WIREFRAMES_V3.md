# Abyssal Twin — Mission Control v3.0 Wireframes (Futuristic HUD)

Design language: **"Abyssal Command Deck"** — a deep-ocean glass cockpit.
Every component snaps to a strict 12-column grid; alignment is verified per
component in §5. Motion for micro-interactions, WebGPU canvas for the ambient
sonar/aurora field (with Canvas2D fallback), Rust-WASM for the computation core.

---

## 1. Layout System — the grid everything snaps to

```
┌────────────────────────────────────────────────────────────────────────┐
│ 12-column grid · gutters 24px · max-w 1440px · baseline 4px             │
│                                                                        │
│  [1][2][3][4][5][6][7][8][9][10][11][12]                               │
└────────────────────────────────────────────────────────────────────────┘
```

| Breakpoint | Columns | Container | Key behavior |
|---|---|---|---|
| `< 768px` | 4 | full-bleed | stacked single column, map full width |
| `768–1024px` | 8 | 100% | 2-col: map (5) + rail (3) |
| `> 1024px` | 12 | 1440px | 3-zone: telemetry rail (3) · map (6) · command rail (3) |

---

## 2. Desktop Wireframe (12-col, 3-zone cockpit)

```
┌────────────────────────────────────────────────────────────────────────────┐
│ HEADER (h-16, full width)                                                   │
│ ┌──────────────┬──────────────────────────────────┬───────────────────────┐ │
│ │ ◈ ABYSSAL    │  MISSION CONTROL · 25.0°N 80.0°W  │ ● LIVE  ⏱ 14:02:11Z   │ │
│ │   TWIN  v3   │  [FLEET: 4] [PNR: SAFE] [ITAR:US] │  📼 Replay  ⚙ Settings │ │
│ └──────────────┴──────────────────────────────────┴───────────────────────┘ │
├────────────────────────────────────────────────────────────────────────────┤
│ ALERT STRIP (conditional — collapsible, height auto)                        │
│ ⚠ AUV-02 · CUSUM thruster anomaly (82% conf)            [ACK]  [DISMISS]    │
├──────────────┬──────────────────────────────────────────┬───────────────────┤
│ LEFT RAIL    │  CENTER — GLOBAL FLEET COMMAND           │ RIGHT RAIL        │
│ (3 cols)     │  (6 cols)                                │ (3 cols)          │
│              │                                          │                   │
│ ┌──────────┐ │  ┌────────────────────────────────────┐  │ ┌───────────────┐ │
│ │FLEET STATS│ │  │ MAPBOX GL (h-[560px])              │  │ │SELECTED ASSET │ │
│ │ 4 ONLINE  │ │  │  · acoustic coverage zones         │  │ │ AUV-01        │ │
│ │ 0 PARTIT. │ │  │  · PNR rings (amber)               │  │ │ ● ONLINE      │ │
│ │ 0 ANOMALY │ │  │  · asset markers + sonar ping      │  │ │ [Battery ══╗] │ │
│ │ $12.4M    │ │  │  · WASM fusion markers (▣ real)    │  │ │ [PNR   ═══╗] │ │
│ └──────────┘ │  │  └────────────────────────────────┘  │  │ [Depth  ▓▓▓] │ │
│ ┌──────────┐ │  │  HUD overlay: 47-byte decode + CRC   │  │ [Health ▓▓▓] │ │
│ │ACOUSTIC  │ │  │  ⚡ WASM: kalman σ²=0.048 · 25.5×    │  │ [Heading ▓▓ ] │ │
│ │LINK RX/TX │ │  │  Telemetry strip (live x/y/z/yaw)   │  │ [Variance ▓ ] │ │
│ │▓▓▓▓░░ 72%│ │  │                                      │  │               │ │
│ └──────────┘ │  │                                      │  │ ┌───────────┐ │ │
│ ┌──────────┐ │  │                                      │  │ │FLEET LIST │ │ │
│ │CUSUM LIVE│ │  │                                      │  │ │ ▸AUV-01    │ │ │
│ │(WASM)    │ │  │                                      │  │ │ ▸AUV-02 ⚠  │ │ │
│ │S+ ▓▓ 4.2 │ │  │                                      │  │ │ ▸AUV-03    │ │ │
│ │S- ░░ 0.1 │ │  │                                      │  │ └───────────┘ │ │
│ └──────────┘ │  │                                      │  │ ┌───────────┐ │ │
│ ┌──────────┐ │  │                                      │  │ │QUICK ACTS │ │ │
│ │EXPORT    │ │  │                                      │  │ │ 📊 Anomaly │ │ │
│ │CSV · JSON│ │  │                                      │  │ │ 📡 States  │ │ │
│ └──────────┘ │  │                                      │  │ └───────────┘ │ │
├──────────────┴──────────────────────────────────────────┴───────────────────┤
│ FOOTER (h-10) · Z-time · sync lag · link quality · WASM engine: ready ●      │
└────────────────────────────────────────────────────────────────────────────┘
```

**Zone ownership (the operator's eye path):**
1. **Header** — system state at a glance (provenance badge is the honest anchor)
2. **Left rail** — the *why* (physics: fleet stats, acoustic link, live CUSUM)
3. **Center** — the *where* (geospatial map + live telemetry decode)
4. **Right rail** — the *who* (selected asset, fleet list, actions)

---

## 3. Component Alignment Spec (snap-to-grid)

Every component is defined by **col-span × row-height + inset** so nothing floats:

| Component | Col span | Height (px) | Inset (px) | Alignment anchor |
|---|---|---|---|---|
| Header | 12 | 64 | 0 | full-bleed, `sticky top-0` |
| Alert strip | 12 | auto (≤96) | 0 | below header, collapses |
| FleetStats | 3 | 168 | 24 | left rail top |
| AcousticLink | 3 | 120 | 24 | below FleetStats |
| CusumLive (WASM) | 3 | 160 | 24 | below AcousticLink |
| ExportPanel | 3 | 96 | 24 | left rail bottom |
| GlobalFleetMap | 6 | 560 | 24 | center, `lg:col-span-6` |
| TelemetryStrip | 6 | 72 | 24 | center, under map |
| SelectedAsset | 3 | 360 | 24 | right rail top |
| FleetList | 3 | 200 | 24 | below SelectedAsset |
| QuickActions | 3 | 176 | 24 | right rail bottom |
| Footer | 12 | 40 | 0 | full-bleed, `sticky bottom-0` |

**Row math (desktop):** each rail = 168+120+160+96 + 3×24 gaps = **616px**; map zone = 560+72+24 = **656px** → rails and center align within ±40px (visually locked via same top offset + flex `items-start`).

---

## 4. Futuristic Techniques Map

| Technique | Where | Fallback |
|---|---|---|
| **Rust-WASM engine** (`iort-twin-wasm`) | CUSUM live, Kalman fusion readout, PNR, 47-byte decode preview | JS mirror, badge "WASM:fallback" |
| **WebGPU canvas** | ambient aurora/sonar behind map | Canvas2D (feature-detect `navigator.gpu`) |
| **Motion** (ex-framer-motion) | header, panels, alert strip, asset cards | `prefers-reduced-motion` → static |
| **Tailwind v4** | utility layer (CSS-first config) | — |
| **HUD glyphs** | vector bracket corners, scanlines | — |

---

## 5. Per-Component Verification Checklist (run after implementation)

**Status: ✅ VERIFIED 2026-08-08 — deployed `638325a1` (live at
`abyssal-twin.swanandtanavade100.workers.dev/`)**

- [x] Header: 12-col full-bleed; badges do not wrap below 1280px (`h-16`, flex no-wrap)
- [x] Left rail, center, right rail all start at identical top offset (`grid items-start`)
- [x] GlobalFleetMap `h-[560px]` matches spec (was 500px); map does not overflow card
- [x] TelemetryStrip sits flush under map (`mt-6` = 24px gap exactly)
- [x] CUSUM gauges left-aligned to rail padding (`px-6`)
- [x] SelectedAsset telemetry grid is 2×2 with equal cell widths (`grid-cols-2`)
- [x] Footer `sticky bottom-0`, no content hidden behind it (h-10, z-40)
- [x] All tabular numbers `tabular-nums` (no digit jitter)
- [x] WebGPU absent → canvas fallback + console.info, no crash (AuroraField try/catch)
- [x] WASM absent → engine badge "JS fallback", all numbers still render (wasmFallback mirror)
- [x] `prefers-reduced-motion` → static single frame (AuroraField; Motion respects)
- [x] 401/no-telemetry → every gauge shows "—" (honesty contract intact — TelemetryStrip,
      AcousticLink TX, Battery all render "—" without data)

**Engine verification (live, Node):** `engine_version: iort-twin-wasm 1.0.0` ·
CRC empty=0xFFFF · "123456789"=0x29B1 · CUSUM +1σ alarm samples=22 · Kalman x=10.099 ·
PNR 2380min/20min return. **Tests:** mission-control 20 (9 new wasmFallback parity),
Rust WASM crate 19. **Bundle:** `main-DRSLZx-h.js` (wasm assets in `dist/wasm/`).

---

## 6. Implementation Order (engineer's execution)

1. `src/iort_twin_wasm/` — new pure-Rust crate (kalman, cusum, pnr, decode) + wasm-bindgen, `cdylib`, `wasm32` target, `cargo build --target wasm32-unknown-unknown`
2. `mission-control/` — add WASM loader hook + `CusumLive`, `AcousticLink`, `TelemetryStrip` components
3. WebGPU aurora canvas component + Canvas2D fallback
4. Re-layout App.tsx to the 3-zone 12-col grid (wireframe §2)
5. Run verification checklist (§5) + build + vitest + deploy
