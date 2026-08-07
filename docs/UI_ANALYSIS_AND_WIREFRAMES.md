# Abyssal Twin — UI Analysis & Wireframe Strategy

**Document type:** Design specification and visual language guide
**Status:** Draft v1.0
**Applies to:** `mission-control/` — Vite 5 + TypeScript 5.3 + Chart.js 4 SPA
**Date:** 2026-03-06

> _"The deep ocean is the last unexplored frontier — the interface that commands it should feel like it."_

---

## Table of Contents

1. [Current State Analysis](#1-current-state-analysis)
2. [Design System Proposal — Abyssal Dark Mode](#2-design-system-proposal--abyssal-dark-mode)
3. [Wireframe: Fleet Command View](#3-wireframe-fleet-command-view)
4. [Wireframe: Telemetry Dashboard](#4-wireframe-telemetry-dashboard)
5. [Wireframe: Anomaly Alert Modal](#5-wireframe-anomaly-alert-modal)
6. [Implementation Roadmap](#6-implementation-roadmap)
7. [Satellite & Low-Bandwidth UX Constraints](#7-satellite--low-bandwidth-ux-constraints)

---

## 1. Current State Analysis

### 1.1 Architecture Audit

The `mission-control/` frontend is a **single-page application** with no component framework overhead — a deliberate, satellite-conscious choice that keeps the bundle lean.

| Layer | Technology | Notes |
|---|---|---|
| Language | TypeScript 5.3 (strict mode) | ES2022 target, `noImplicitAny` |
| Bundler | Vite 5.0.10 | Relative base path for Cloudflare Pages |
| Charting | Chart.js 4.4.1 + date-fns 3.0.6 | Time-series line charts |
| Deployment | Cloudflare Pages | `wrangler pages deploy dist/` |
| Styling | Embedded CSS in `index.html` (~545 lines) | No external CSS files |
| State | Plain TypeScript class (`DashboardManager`) | No reactive store |

All CSS custom properties live in `mission-control/index.html` inside the `:root` selector. All widget factory methods live in `mission-control/src/main.ts` within the `DashboardManager` class (line 26).

### 1.2 Widget Inventory

| Widget | Factory Method | File:Line | Purpose |
|---|---|---|---|
| Demo Banner | `createDemoBanner()` | `src/main.ts:295` | Demo mode indicator (purple gradient) |
| Fleet Status | `createFleetWidget()` | `src/main.ts:317` | AUV cards with X/Y/Z coords, health, status dot |
| Research Metrics | `createMetricsWidget()` | `src/main.ts:338` | RQ1/RQ2/RQ3 validation metric grids |
| Compression | `createCompressionWidget()` | `src/main.ts:359` | Wire bytes vs baseline, ratio, PASS/FAIL badge |
| Anomaly Stats | `createAnomalyWidget()` | `src/main.ts:396` | Total anomalies, confidence %, severity, sync lag |
| Depth Chart | `createChartWidget()` | `src/main.ts:429` | Chart.js depth-history line chart (4 vehicles) |
| Event Log | `createEventsWidget()` | `src/main.ts:450` | Scrollable log with type/severity badges |

### 1.3 Data Model Review

Defined in `mission-control/src/types.ts`. Available vs. displayed:

| Field | Interface | Currently Displayed | Visualization Gap |
|---|---|---|---|
| `x, y` (horizontal position) | `StateVector` | Text card only | No geospatial map |
| `z` (depth in meters) | `StateVector` | Text card + depth chart | No depth scale bar |
| `yaw` (heading) | `StateVector` | Not displayed | No compass rose |
| `healthScore` (0–100) | `StateVector` | Text value | No ring gauge |
| `anomalyDetected` (bool) | `StateVector` | Emoji in card | No dedicated alert modal |
| `positionVariance` | `StateVector` | RQ2 aggregate only | No per-vehicle uncertainty ring |
| `averageConfidence` | `ResearchMetrics.rq3` | Text value | No confidence timeline chart |
| `averageSyncLagSeconds` | `ResearchMetrics.rq3` | Text value | No latency trend sparkline |
| Battery level | — | **Not in data model** | Requires backend extension |
| Pressure (Bar) | — | **Not in data model** | Requires backend extension |
| Satellite link BPS | — | **Not in data model** | Derivable from `wireFormatBytes` delta |

### 1.4 Real-Time Infrastructure

Three concurrent data channels defined in `.env.staging` and `.env.production`:

```
WebSocket  wss://{host}/ws/live               → state_update, anomaly, partition events
SSE        https://{host}/api/v1/fleet/stream → one-way telemetry push
REST       https://{host}/api/v1/fleet/status → polled every 5 seconds (auto-refresh)
           https://{host}/api/v1/export/summary
```

The WebSocket `anomaly` event handler at `src/main.ts:225` currently only calls `addEvent()` — it does not surface a dedicated high-contrast alert. This is the single highest-priority UX gap.

### 1.5 Usability Gap Analysis

Evaluated against the operational context: **submarine mission operators in low-light environments, high cognitive load, intermittent connectivity.**

| # | Gap | Severity | Operator Impact |
|---|---|---|---|
| G1 | No geospatial/sonar map; AUVs as data cards with raw floats | Critical | Cannot spatially situate fleet or detect proximity risks |
| G2 | Anomaly events surfaced only in scrollable log | Critical | Alerts missed during sustained operations |
| G3 | Single chart (depth history); pressure, health, yaw uncharted | High | Reduced situational awareness of individual vehicle state |
| G4 | No link quality / satellite bandwidth indicator | High | Operator unaware of data staleness risk |
| G5 | Status dots are 8px static circles | Medium | Low visual salience for online/partitioned distinction |
| G6 | No glassmorphism or HUD aesthetic; dashboard looks generic | Medium | Cognitive context-switching in dim bridge environments |
| G7 | No stale-data indicator when WS drops | Medium | Operator may act on outdated telemetry |

---

## 2. Design System Proposal — Abyssal Dark Mode

### 2.1 Extended Color Palette

The existing 10-token palette (in `mission-control/index.html` `:root`) is sound in structure but conservative in luminance. The proposed "Abyssal Dark Mode" extends it with **bioluminescent accents** — inspired by deep-sea organisms that generate their own light against absolute darkness.

```css
/* ── DEPTHS — Background Layers ───────────────────────────────── */
--abyss-void:        #04060f;   /* NEW: deepest bg, below primary */
--bg-primary:        #0a0e27;   /* UNCHANGED */
--bg-secondary:      #141b2d;   /* UNCHANGED */
--bg-tertiary:       #1a2332;   /* UNCHANGED */
--border-color:      #2a3a4f;   /* UNCHANGED */

/* ── GLASS — Translucent Surfaces ─────────────────────────────── */
--glass-surface:     rgba(20, 27, 45, 0.72);  /* NEW: glassmorphism base */
--glass-border:      rgba(100, 210, 255, 0.18); /* NEW: bioluminescent rim */
--glass-shadow:      0 8px 32px rgba(0, 229, 255, 0.08); /* NEW: ambient glow */

/* ── BIOLUMINESCENCE — Accent System ──────────────────────────── */
--bio-cyan:          #00e5ff;   /* UPGRADED from #64d2ff — primary accent */
--sonar-green:       #00ff88;   /* UPGRADED from #4ade80 — healthy/online */
--depth-teal:        #00b4d8;   /* NEW: secondary accent, mid-water blue */
--sonar-amber:       #ffbb00;   /* UPGRADED from #fbbf24 — warning/partitioned */
--pressure-red:      #ff3366;   /* UPGRADED from #f87171 — critical/anomaly */

/* ── GLOW — Text Shadows for Luminescent Data ─────────────────── */
--glow-green:        0 0 8px rgba(0, 255, 136, 0.7);
--glow-cyan:         0 0 8px rgba(0, 229, 255, 0.7);
--glow-red:          0 0 12px rgba(255, 51, 102, 0.8);

/* ── LINK QUALITY — Full-width gradient bar ───────────────────── */
--link-quality-gradient: linear-gradient(
  90deg,
  var(--sonar-green) 0%,
  var(--sonar-amber) 60%,
  var(--pressure-red) 100%
);

/* ── DEPTH DIMENSION — Visualization gradient ─────────────────── */
--depth-gradient: linear-gradient(
  180deg,
  rgba(0, 180, 216, 0.3) 0%,    /* surface */
  rgba(10, 14, 39, 0.8) 50%,    /* mid-water */
  rgba(4, 6, 15, 1.0) 100%      /* abyss */
);

/* ── TYPOGRAPHY ────────────────────────────────────────────────── */
--font-display: 'JetBrains Mono', 'SF Mono', Monaco, 'Cascadia Code', monospace;
--font-mono:    'SF Mono', Monaco, 'Cascadia Code', monospace; /* UNCHANGED */
--font-sans:    -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; /* UNCHANGED */
```

### 2.2 Typography System

A monospace-first hierarchy that communicates operational precision:

| Role | Size | Font | Color | Usage |
|---|---|---|---|---|
| Micro-label | 10px | `var(--font-display)` | `--text-secondary` | Unit labels, axis ticks |
| Body | 12px | `var(--font-sans)` | `--text-secondary` | Descriptions, metadata |
| Data value | 14px | `var(--font-display)` | `--text-primary` | Card fields, table cells |
| Widget title | 13px | `var(--font-display)` | `--bio-cyan` | Widget headers (uppercase, tracked) |
| Primary metric | 28px | `var(--font-display)` | `--sonar-green` | Health score, confidence % |
| Critical alert | 32px | `var(--font-display)` | `--pressure-red` | Anomaly modal header |

All numeric values must use `font-variant-numeric: tabular-nums` to prevent column jitter during live updates.

### 2.3 Glassmorphism Component Spec

Applied to all `.widget` cards and modal surfaces. Replaces the current solid `--bg-tertiary` fill:

```css
.glass-card {
  background:       var(--glass-surface);
  backdrop-filter:  blur(12px) saturate(180%);
  -webkit-backdrop-filter: blur(12px) saturate(180%);
  border:           1px solid var(--glass-border);
  border-radius:    12px;
  box-shadow:       var(--glass-shadow);
}
```

Glassmorphism is **additive** — widgets gain this treatment while retaining their existing inner structure. The blur creates visual depth layering: background → widget glass → HUD overlay → alert modal.

### 2.4 HUD Element Language

Inspired by military submarine displays and aviation glass cockpits. These are **pure CSS/SVG** — zero additional JavaScript.

**Corner brackets** — frame critical data panels:
```css
.hud-frame::before,
.hud-frame::after {
  content: '';
  position: absolute;
  width: 12px;
  height: 12px;
  border-color: var(--bio-cyan);
  border-style: solid;
  opacity: 0.6;
}
.hud-frame::before { top: 0; left: 0; border-width: 2px 0 0 2px; }
.hud-frame::after  { bottom: 0; right: 0; border-width: 0 2px 2px 0; }
```

**Scan-line texture** — subtle CRT effect for the deep-space aesthetic:
```css
.scan-lines {
  background: repeating-linear-gradient(
    0deg,
    transparent,
    transparent 2px,
    rgba(0, 229, 255, 0.015) 2px,
    rgba(0, 229, 255, 0.015) 4px
  );
  pointer-events: none;
}
```

**Grid overlay** — tactical coordinate reference on map panels:
```css
.tactical-grid {
  background-image:
    linear-gradient(rgba(0, 180, 216, 0.06) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0, 180, 216, 0.06) 1px, transparent 1px);
  background-size: 40px 40px;
}
```

**Range rings** — SVG circles for the sonar map:
```html
<circle cx="50%" cy="50%" r="25%" fill="none"
        stroke="rgba(0,229,255,0.12)" stroke-width="1"
        stroke-dasharray="4 4"/>
```

### 2.5 Bioluminescent Visualization Language

Every data state maps to a luminescent intensity — operators read health at a glance:

| State | Color | Glow Effect | Animation |
|---|---|---|---|
| Online / Healthy | `--sonar-green` `#00ff88` | `text-shadow: var(--glow-green)` | Slow pulse (3s) |
| Partitioned / Warning | `--sonar-amber` `#ffbb00` | `text-shadow: 0 0 8px rgba(255,187,0,0.7)` | Fast pulse (1s) |
| Offline / Critical | `--pressure-red` `#ff3366` | `text-shadow: var(--glow-red)` | Urgent strobe (0.5s) |
| Data fresh (<5s) | `--bio-cyan` `#00e5ff` | Subtle underline glow | None |
| Data stale (>30s) | `--sonar-amber` dimmed | None | Fade opacity 0.6 |
| Anomaly detected | `--pressure-red` | Full panel glow | Scan-line sweep |

Depth dimension uses color temperature: **cyan** at surface → **deep blue** at 100m → **near-black** at 300m+. Chart fills use the `--depth-gradient` variable as `backgroundColor` in Chart.js dataset config.

### 2.6 Animation Specification

Satellite-conscious: all animations are CSS-only, interruptible, and respect `prefers-reduced-motion`.

```css
/* Sonar ping — radiates from AUV node on status change */
@keyframes sonar-ping {
  0%   { transform: scale(1);   opacity: 0.8; }
  100% { transform: scale(3);   opacity: 0;   }
}

/* Health pulse — ambient glow on online vehicles */
@keyframes bio-pulse {
  0%, 100% { box-shadow: 0 0 4px var(--sonar-green); }
  50%       { box-shadow: 0 0 16px var(--sonar-green), 0 0 32px rgba(0,255,136,0.3); }
}

/* Anomaly strobe — urgent attention signal */
@keyframes anomaly-strobe {
  0%, 100% { border-color: var(--pressure-red); box-shadow: var(--glow-red); }
  50%       { border-color: rgba(255,51,102,0.2); box-shadow: none; }
}

/* Scan sweep — modal entrance */
@keyframes scan-sweep {
  0%   { top: 0; opacity: 0.4; }
  100% { top: 100%; opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
  * { animation-duration: 0.001ms !important; }
}
```

### 2.7 Data Density Rules

Mission operators need to assess 4 vehicles simultaneously without scrolling.

- **Minimum 6 data points** visible per widget at 1440px viewport width
- **4-column micro-grid** inside metric widgets (label / value / unit / trend)
- **Tabular alignment** for all numeric columns (`font-variant-numeric: tabular-nums`)
- **Unit labels** displayed at 10px below value, never inline (prevents column width jitter)
- **Sparklines** (100×40px) replace single scalar values where trend is operationally critical
- **No tooltips as primary information carrier** — all critical values must be visible without hover (satellite latency makes hover→wait→read too slow)

---

## 3. Wireframe: Fleet Command View

**Purpose:** Spatial situational awareness of the AUV fleet. The operator's primary screen.
**Implementation target:** New method `createFleetCommandWidget()` in `mission-control/src/main.ts`; new CSS classes `.sonar-map`, `.hud-ring`, `.range-ring`, `.vehicle-node` in `mission-control/index.html`.

### 3.1 ASCII Layout

```
┌──────────────────────────────────────────────────────────────────────────┐
│  ◈ ABYSSAL TWIN  MISSION CONTROL                    ● CONNECTED  14:32 UTC│
│  ▓▓▓▓▓▓▓▓▓▓▒▒▒▒░░░░░░░░░░░░  IRIDIUM 9600bps  FLEET 3/4  T+04:17:32   │
└──────────────────────────────────────────────────────────────────────────┘
┌──── SONAR MAP ─────────────────────────────┐ ┌──── VEHICLE STATUS RAIL ──┐
│  ⌐                                        ¬ │ │                           │
│                    ·   ·   ·               │ │  ┌─────────────────────┐   │
│         ·   ·   ·                          │ │  │⌐                   ¬│   │
│               ◎                            │ │  │  AUV-01  ● ONLINE   │   │
│          ·   /·\   ·                       │ │  │  ████████████░░  87%│   │
│  AUV-02 ●─── ◉ ───● AUV-01               │ │  │  DEPTH  ↓ 142.3 m   │   │
│          · ✕ | ✕ ·   ← mission path       │ │  │  YAW    ↗  047°     │   │
│               |                            │ │  │  VAR    ≈  0.003    │   │
│          ·   USV-01                        │ │  └─────────────────────┘   │
│              (⌀)                           │ │                           │
│     AUV-03 ● (offline)                    │ │  ┌─────────────────────┐   │
│          ·   ·   ·                         │ │  │⌐                   ¬│   │
│                                            │ │  │  AUV-02  ◑ PARTND  │   │
│  ──── 50m ──────────────────               │ │  │  ████████░░░░░░  61%│   │
│  ──── 100m ─────────────────               │ │  │  DEPTH  ↓  89.1 m   │   │
│  ──── 200m ─────────────────               │ │  └─────────────────────┘   │
│  L                                        ⌐│ │                           │
└────────────────────────────────────────────┘ └───────────────────────────┘
```

### 3.2 Mission Header Bar (Full-Width)

**Position:** Sticky top bar, replaces current `.header`.

```
┌──────────────────────────────────────────────────────────────────────────┐
│  ◈ ABYSSAL TWIN   MISSION CONTROL                  ● CONNECTED  14:32 UTC│
├──────────────────────────────────────────────────────────────────────────┤
│  [LINK QUALITY ████████████████████░░░░░░░░]  9,600 bps  IRIDIUM SBDIX   │
│  FLEET: 3 ONLINE / 4 TOTAL  │  MISSION: LAWNMOWER-7  │  ELAPSED: 04:17:32│
└──────────────────────────────────────────────────────────────────────────┘
```

**Components:**
- **Brand mark**: `◈ ABYSSAL TWIN` in `--bio-cyan`, `font-size: 18px`, letter-spacing 0.15em
- **Connection badge**: Pulsing `●` dot in `--sonar-green` with `sonar-ping` animation ring on state change; text reads `CONNECTED` / `RECONNECTING...` / `OFFLINE`
- **UTC Clock**: Monospace, updates every second via `setInterval`, never staleable
- **Link quality bar**: `width: {bps/50000 * 100}%` mapped to the `--link-quality-gradient`; label shows exact bps. Derivable from `ResearchMetrics.rq1.wireFormatBytes` delta between 5s polls.
- **Fleet count**: `{online}/{total}` from `FleetStatus.vehicles` array (types.ts:5)
- **Mission elapsed**: Calculated from session start timestamp stored in `DashboardState`

### 3.3 Sonar Map Panel (60% Width)

**Visual Design: HUD radar display** with tactical grid overlay.

**Canvas structure (SVG-based):**
```html
<div class="sonar-map glass-card hud-frame tactical-grid scan-lines">
  <svg viewBox="0 0 600 500" width="100%" height="100%">
    <!-- Range rings -->
    <circle cx="300" cy="250" r="80"  class="range-ring" data-label="50m"/>
    <circle cx="300" cy="250" r="160" class="range-ring" data-label="100m"/>
    <circle cx="300" cy="250" r="240" class="range-ring" data-label="200m"/>

    <!-- Mission path polyline -->
    <polyline class="mission-path" points="..." stroke="var(--bio-cyan)"
              stroke-width="1" stroke-dasharray="6 3" fill="none" opacity="0.4"/>

    <!-- AUV position nodes -->
    <g class="vehicle-node" data-id="AUV-01" data-status="online">
      <circle r="6" fill="var(--sonar-green)"/>
      <circle r="6" fill="none" stroke="var(--sonar-green)" class="sonar-ping"/>
      <text y="18" class="node-label">AUV-01</text>
    </g>

    <!-- Depth contour shading -->
    <defs>
      <radialGradient id="depth-fill">
        <stop offset="0%"   stop-color="rgba(0,180,216,0.05)"/>
        <stop offset="100%" stop-color="rgba(4,6,15,0.15)"/>
      </radialGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#depth-fill)"/>
  </svg>
</div>
```

**Node styling by status:**
- `online` → `--sonar-green` fill, `bio-pulse` animation, `sonar-ping` ring
- `partitioned` → `--sonar-amber` fill, `anomaly-strobe` border
- `offline` → `--pressure-red` desaturated fill, no animation, `✕` overlay glyph

**Hover tooltip** (appears on node hover, positioned relative to node):
```
┌──────────────────────┐
│ AUV-01  ● ONLINE     │
│ X: +142.3m  Y: -89.1m│
│ Z: -142.3m  YAW: 047°│
│ HEALTH: 87%          │
│ VARIANCE: ≈0.003     │
│ LAST UPDATE: 0.8s ago│
└──────────────────────┘
```

**Coordinate mapping:** The `StateVector.x` and `StateVector.y` values (in meters) map to SVG viewport coordinates via a linear scale derived from the observed min/max of all vehicle positions, updated on each data refresh.

### 3.4 Vehicle Status Rail (40% Width)

Glassmorphism cards stacked vertically, one per vehicle. Each card is a **mini-HUD panel**.

```
┌─ HUD FRAME ──────────────────────────┐
│⌐                                    ¬│  ← CSS corner brackets
│                                       │
│  AUV-01            ● ONLINE           │  ← name + status badge
│                                       │
│  [●●●●●●●●●●●●●●●●●●●●○○○○] 87%    │  ← health progress bar
│          ↑ sonar-green fill           │
│                                       │
│  ↓ DEPTH   142.3 m                   │  ← depth indicator
│  ↗ YAW       047°                    │  ← heading
│  ≈ VARIANCE  0.003                   │  ← position uncertainty
│                                       │
│  LAST STATE: 0.8s ago                │  ← staleness indicator
│L                                    ⌐│
└───────────────────────────────────────┘
```

**Health ring gauge** (alternative layout for spacious viewports):
SVG arc from 0° to `healthScore * 3.6°`, stroke-dasharray animation. Color transitions:
- 80–100: `--sonar-green` with `--glow-green`
- 40–79: `--sonar-amber`
- 0–39: `--pressure-red` with `--glow-red`

---

## 4. Wireframe: Telemetry Dashboard

**Purpose:** Multi-dimensional, time-series view of all vehicle telemetry. Operator's secondary screen for trend analysis and anomaly investigation.
**Implementation target:** Enhance `createChartWidget()` at `mission-control/src/main.ts:429`; add `createBandwidthWidget()` and `createSparklineWidget()` methods.

### 4.1 ASCII Layout

```
┌──── DEPTH + PRESSURE MATRIX ─────────────────────────────────────────────┐
│  DEPTH (m) ↓                                           TIME (UTC) →       │
│  0 ─────────────────────────────────────────────────────────────────────  │
│             AUV-01 ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ (cyan)            │
│  50 ──────────────────────────────────────────────────────────────────   │
│         AUV-02 ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~       (green)          │
│  100 ─────────────────────────────────────────────────────────────────   │
│                   USV-01 ─────────────────────── (surface, amber)        │
│  150 ─────────────────────────────────────────────────────────────────   │
│                         AUV-03 ~~~~~~~~~~~~~~   (red, offline section)   │
│  200 ─────────────────────────────────────────────────────────────────   │
│                                         ██ depth-gradient fill           │
│  250 ──────────────── ABYSS ──────────────────────────────────────────   │
│       [1H] [6H] [24H] [7D]                          ↕ Scroll to zoom     │
└──────────────────────────────────────────────────────────────────────────┘

┌──── VEHICLE HEALTH SPARKLINES ──────────────────────────────────────────┐
│  AUV-01  [▅▇█▇▆▅▅▄▄▃] 87%    AUV-02 [▄▃▃▂▂▁▂▂▁▁] 31% ⚠          │
│  AUV-03  [████████████] ─%     USV-01 [▆▆▇▇▇▇▆▇▇▇] 92%             │
└──────────────────────────────────────────────────────────────────────────┘

┌──── ANOMALY CONFIDENCE TIMELINE ───────────────┐ ┌──── BANDWIDTH ──────┐
│  CONFIDENCE %                                  │ │ WIRE FORMAT         │
│  100 ┤                        ╻               │ │ ████████████░░  68% │
│   80 ┤                       ╻╹               │ │ 9,842 / 14,400 B    │
│   60 ┤              ╻        ╹                │ │ RATIO    6.2×       │
│   40 ┤           ╻  ╹                         │ │ TARGET   >10×  ✗    │
│   20 ┤    ╻   ╻  ╹                            │ │                     │
│    0 ┤────╹───╹───────────────────────────── │ │ ████░░░░░░░░░  28%  │
│      └────────────────────────────────────    │ │ IRIDIUM BPS         │
│      CUSUM score ─── (overlay line)           │ │ 2,688 / 9,600 bps  │
└────────────────────────────────────────────────┘ └────────────────────┘
```

### 4.2 Depth + Pressure Matrix Chart

**Chart.js config extensions** to apply at `src/main.ts:429`:

```typescript
// Area fill: depth gradient (surface → abyss)
const depthGradient = ctx.createLinearGradient(0, 0, 0, chartHeight);
depthGradient.addColorStop(0,   'rgba(0, 180, 216, 0.35)');  // surface
depthGradient.addColorStop(0.5, 'rgba(10, 14, 39, 0.20)');   // mid-water
depthGradient.addColorStop(1,   'rgba(4, 6, 15, 0.05)');     // abyss

datasets: [
  {
    label: 'AUV-01',
    borderColor: '#00e5ff',  // --bio-cyan
    backgroundColor: depthGradient,
    fill: true,
    tension: 0.4,
  },
  // ... per vehicle
]

scales: {
  y: {
    reverse: true,        // depth increases downward (already implemented)
    grid: { color: 'rgba(0, 229, 255, 0.06)' },  // HUD grid lines
    ticks: { color: 'var(--text-secondary)', font: { family: 'SF Mono' } }
  }
}
```

### 4.3 Vehicle Health Sparklines

Per-vehicle mini charts (100px × 40px). Rendered as small `<canvas>` elements inside a 4-column grid. Use Chart.js with `responsive: false` and all chrome (axes, legend, grid) disabled:

```typescript
// New method: createSparklineWidget()
// Renders 4 sparklines in a 2×2 grid, each showing 30 health readings
// Color = sonar-green (>80) | sonar-amber (40-79) | pressure-red (<40)
// Critical threshold: horizontal dashed line at 20%
```

Below each sparkline:
- Current value in 28px monospace with bioluminescent glow
- Trend arrow: `↑ +3%` or `↓ -12%` (delta from 5 readings ago)
- `⚠ CRITICAL` badge (pressure-red, strobe) if value < 20%

### 4.4 Anomaly Confidence Timeline

Bar chart (X=time, Y=confidence 0–100%). CUSUM score as an overlay line dataset.

**Color coding by severity** (mapped from `ResearchMetrics.rq3.averageSeverity`):
- Severity 0.0–0.3: `--bio-cyan` bars
- Severity 0.3–0.7: `--sonar-amber` bars
- Severity 0.7–1.0: `--pressure-red` bars, with a `--glow-red` plugin annotation

**Interaction:** Click on a bar highlights the corresponding event in the Event Log widget (`createEventsWidget()` at `src/main.ts:450`) by adding a `.highlighted` class.

### 4.5 Bandwidth Utilization Panel

New method `createBandwidthWidget()`. Replaces the current `createCompressionWidget()` at `src/main.ts:359` with a richer layout:

```
┌──── BANDWIDTH UTILIZATION ──────────────────────────────────────────────┐
│                                                                          │
│  WIRE FORMAT          IRIDIUM LINK                                       │
│  ─────────────────    ──────────────────                                 │
│  [████████████░░░░░]  [███░░░░░░░░░░░░░]                                 │
│  9,842 / 14,400 B     2,688 / 9,600 bps                                  │
│                                                                          │
│  COMPRESSION RATIO    RQ1 TARGET STATUS                                  │
│  6.2×                 >10× TARGET    ✗ MISS                              │
│  (baseline: 61,023 B) DELTA: −3.8×                                       │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

The Iridium bps bar uses the `--link-quality-gradient` and derives BPS from `wireFormatBytes` deltas across two consecutive REST poll responses.

---

## 5. Wireframe: Anomaly Alert Modal

**Purpose:** Interrupt-driven, full-attention alert when `anomalyDetected: true` arrives on the WebSocket `anomaly` event (currently handled at `mission-control/src/main.ts:225`).
**Implementation target:** Enhance existing `modal-overlay` pattern in `src/main.ts:664`; add CSS classes `.anomaly-modal`, `.anomaly-scan`, `.anomaly-pulse`, `.anomaly-header` in `mission-control/index.html`.

### 5.1 ASCII Layout

```
████████████████████████████████████████████████████████████████████████████
█                                                                          █
█   ┌──── ANOMALY MODAL ─────────────────────────────────────────────┐   █
█   │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  ← 4px pressure-red border│  █
█   │  ⚠  ANOMALY DETECTED                                            │   █
█   │  AUV-01  │  14:29:47 UTC  │  PARTITIONED SECTOR B              │   █
█   │ ─ ─ ─ ─ ─  scan line sweeping ─ ─ ─ ─ ─                       │   █
█   │                                                                  │   █
█   │  CONFIDENCE     SEVERITY     SYNC LAG                           │   █
█   │    94%            0.87         4.2s                             │   █
█   │  ██████████     ████████░    ████░░░░░░                        │   █
█   │                                                                  │   █
█   │  HEALTH HISTORY — last 30 seconds                               │   █
█   │  [▇▇▇▇▇▆▆▅▄▃▂▁▁  ← declining to anomaly trigger]               │   █
█   │                                                                  │   █
█   │  RECOMMENDED ACTIONS                                            │   █
█   │  › Verify partition boundaries via USV-01 relay                 │   █
█   │  › Check CUSUM threshold σ=3.5 in edge-gateway config          │   █
█   │  › Monitor positionVariance (currently 0.031 > 0.010 limit)    │   █
█   │                                                                  │   █
█   │  [ ACKNOWLEDGE ]   [ QUARANTINE VEHICLE ]   [ DISMISS ]         │   █
█   └──────────────────────────────────────────────────────────────────┘   █
█                                                                          █
████████████████████████████████████████████████████████████████████████████
```

### 5.2 Visual Specification

**Backdrop:**
```css
.anomaly-overlay {
  position: fixed;
  inset: 0;
  background: rgba(4, 6, 15, 0.92);   /* --abyss-void at 92% opacity */
  backdrop-filter: blur(4px);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
}
```

**Modal container:**
```css
.anomaly-modal {
  width: min(640px, 90vw);
  border-top: 4px solid var(--pressure-red);
  border-left: 1px solid rgba(255, 51, 102, 0.3);
  border-right: 1px solid rgba(255, 51, 102, 0.3);
  border-bottom: 1px solid rgba(255, 51, 102, 0.3);
  background: rgba(10, 14, 39, 0.95);
  box-shadow: 0 0 60px rgba(255, 51, 102, 0.25),
              0 0 120px rgba(255, 51, 102, 0.1);
  animation: anomaly-strobe 1.5s ease-in-out 3;  /* 3 strobes on entry */
}
```

**Scan-line sweep** (CSS pseudo-element across modal):
```css
.anomaly-modal::after {
  content: '';
  position: absolute;
  left: 0; right: 0;
  height: 2px;
  background: linear-gradient(90deg, transparent, var(--pressure-red), transparent);
  animation: scan-sweep 2s linear infinite;
  opacity: 0.3;
  pointer-events: none;
}
```

### 5.3 Content Zones

**Zone 1 — Alert Header**
- `⚠ ANOMALY DETECTED` at 32px `--font-display`, color `--pressure-red`, `text-shadow: var(--glow-red)`
- Subtitle row: `{vehicle.name}` | `{timestamp UTC}` | `{event.message}` — separated by `│` in `--text-secondary`

**Zone 2 — Primary Metrics Row**
Three HUD-framed metric boxes (`.hud-frame`) side by side:
- `CONFIDENCE: {averageConfidence * 100}%` — bar fill in `--pressure-red`
- `SEVERITY: {averageSeverity}` — bar fill gradient from `--sonar-amber` to `--pressure-red`
- `SYNC LAG: {averageSyncLagSeconds}s` — bar fill in `--sonar-amber` if <5s, `--pressure-red` if ≥5s

Data sourced from `ResearchMetrics.rq3` (`types.ts:44`).

**Zone 3 — Health History Sparkline**
A 30-reading sparkline of `StateVector.healthScore` for the affected vehicle. The chart is pre-populated from `DashboardManager`'s internal history buffer. The anomaly trigger point is marked with a vertical `--pressure-red` dashed line.

**Zone 4 — Recommended Actions**
Pre-defined action strings keyed to `SystemEvent.type` (`types.ts:56`):

```typescript
const ANOMALY_ACTIONS: Record<string, string[]> = {
  'anomaly': [
    'Verify partition boundaries via USV-01 relay',
    'Check CUSUM threshold σ=3.5 in edge-gateway config',
    `Monitor positionVariance (limit: 0.010)`,
  ],
  'partition': [
    'Initiate mesh re-convergence sequence',
    'Reduce mission waypoint density to decrease sync load',
  ],
};
```

**Zone 5 — Action Buttons**

| Button | Style | Action |
|---|---|---|
| `[ ACKNOWLEDGE ]` | `--sonar-green` border, glow on hover | Marks anomaly as acknowledged; closes modal; adds ✓ to event log |
| `[ QUARANTINE VEHICLE ]` | `--pressure-red` fill, requires second click to confirm | Sets vehicle status to `offline` locally; sends WS message `{type: 'quarantine', auvId}` |
| `[ DISMISS ]` | `--text-secondary` muted style | Closes modal; anomaly remains unacknowledged |

---

## 6. Implementation Roadmap

Changes are scoped to two files only. No new files required.

### Phase 0 — Foundation (CSS only, no behavior change)

| Change | File | Target |
|---|---|---|
| Add 12 new CSS custom properties to `:root` | `mission-control/index.html` | `:root` block |
| Add `.glass-card` class | `mission-control/index.html` | After existing `.widget` |
| Add `.hud-frame`, `.scan-lines`, `.tactical-grid` | `mission-control/index.html` | New section |
| Add `@keyframes sonar-ping`, `bio-pulse`, `anomaly-strobe`, `scan-sweep` | `mission-control/index.html` | After existing `@keyframes` |
| Apply `.glass-card` to `.widget` selector | `mission-control/index.html` | `.widget` rule |

### Phase 1 — High Priority Features

| Change | File:Approx Line | Details |
|---|---|---|
| Add `createFleetCommandWidget()` method | `src/main.ts` after line 450 | SVG sonar map + status rail |
| Inject `createFleetCommandWidget()` into `renderDashboard()` | `src/main.ts:283` | Replace or augment `createFleetWidget()` |
| Upgrade anomaly modal trigger at `handleWebSocketMessage()` | `src/main.ts:225` | Show `.anomaly-modal` instead of `addEvent()` only |
| Add `.anomaly-modal`, `.anomaly-scan`, `.anomaly-pulse` CSS | `mission-control/index.html` | New modal rules |

### Phase 2 — Enhanced Telemetry

| Change | File:Approx Line | Details |
|---|---|---|
| Enhance `createChartWidget()` with depth gradient fill | `src/main.ts:429` | Add `createLinearGradient()` to dataset config |
| Add `createSparklineWidget()` for 4-vehicle health | `src/main.ts` after sparkline block | 4× `<canvas>` 100×40px, Chart.js no-chrome config |
| Add `createBandwidthWidget()` replacing compression widget | `src/main.ts:359` | Dual progress bars (wire format + Iridium bps) |
| Add `.sonar-map`, `.vehicle-node`, `.range-ring` CSS | `mission-control/index.html` | SVG element styles |

### Phase 3 — Data Model Extension

| Change | File | Details |
|---|---|---|
| Add optional `batteryLevel?: number` to `StateVector` | `src/types.ts:19` | 0.0–1.0 range |
| Add optional `pressureBar?: number` to `StateVector` | `src/types.ts:19` | Absolute pressure in Bar |
| Simulate battery drain in `DemoDataEngine` | `src/demo-data.ts` | Exponential decay, random recharge events |
| Simulate pressure variation in `DemoDataEngine` | `src/demo-data.ts` | `z * 0.1 + 1.0` (depth → pressure approximation) |

---

## 7. Satellite & Low-Bandwidth UX Constraints

The Iridium Short Burst Data (SBD) link imposes 50kbps throughput and 300–500ms round-trip latency. Every visual choice must respect this:

| Constraint | Design Response |
|---|---|
| High latency — hover interactions delayed | All critical data visible without hover; tooltips supplement, never primary |
| Data gaps during reconnection | "Stale data" HUD badge (sonar-amber, no animation) when `lastSeen > 30s` |
| Intermittent WebSocket drops | Graceful degradation: WS → SSE → REST polling, UI shows source in header |
| Low bandwidth — avoid fetching heavy assets | Zero external assets; all icons are Unicode glyphs; SVG is inline |
| Cognitive load — dim bridge environment | High-contrast bioluminescent palette; no low-contrast neutral grays for data |
| Operator focus during operations | Animation budget: max 3 simultaneous CSS animations; `prefers-reduced-motion` respected |
| Reflow cost during 5s poll cycle | Widget updates use `textContent` / `setAttribute` — never `innerHTML` on large containers |

### Stale Data Badge Specification

Rendered inside each widget header when `Date.now() - lastUpdateTimestamp > 30_000`:

```html
<span class="stale-badge">⌛ STALE DATA — {n}s ago</span>
```

```css
.stale-badge {
  font-size: 10px;
  color: var(--sonar-amber);
  letter-spacing: 0.1em;
  animation: none;  /* intentionally static — stale = no activity */
}
```

---

*Document prepared for the Abyssal Twin mission-control team. All wireframes describe intended UX behavior and visual language — implementation in `mission-control/index.html` and `mission-control/src/main.ts` as outlined in Section 6.*
