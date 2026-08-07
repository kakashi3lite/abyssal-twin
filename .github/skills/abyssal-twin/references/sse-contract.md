# SSE Contract — Dashboard Data Flow

## Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/v1/fleet/stream` | GET (SSE) | Polls DO state every 5s, streams to dashboard |
| `/api/v1/simulate` | GET (SSE) | Simulation mode — generates synthetic telemetry at 2s interval |

## Message Formats

### Format A: From Durable Object (`/api/v1/fleet/stream`)

```json
data: {
  "states": {
    "1": {
      "auvId": 1,
      "timestamp": 1723020000.0,
      "clock": {"1": 42, "2": 41, "3": 40},
      "x": 10.5, "y": -5.2, "z": 3000.0,
      "yaw": 1.57,
      "positionVariance": 0.01,
      "anomalyDetected": false,
      "healthScore": 230,
      "missionPhase": 2
    },
    "2": { ... },
    "3": { ... }
  },
  "updatedAt": "2026-08-07T12:00:00Z"
}
```

Key: The `states` object is keyed by string AUV IDs. Each value is a `FederatedDTState` JSON representation.

### Format B: From Fleet API Polling (dashboard fallback)

```json
data: {
  "vehicles": [
    {
      "id": 1,
      "name": "AUV-01 Nautilus",
      "type": "auv",
      "status": "online",
      "lastSeen": "2026-08-07T12:00:00Z",
      "latestState": {
        "poseX": 10.5, "poseY": -5.2, "poseZ": 3000.0,
        "yaw": 1.57,
        "positionVariance": 0.01,
        "healthScore": 230,
        "missionPhase": 2,
        "anomalyDetected": false,
        "timestamp": 1723020000.0
      }
    },
    ...
  ],
  "updatedAt": "2026-08-07T12:00:00Z"
}
```

### Format C: Simulation Mode (`/api/v1/simulate`)

```json
data: {
  "vehicles": [
    {
      "id": "AUV-01-Nautilus",
      "name": "AUV-01 Nautilus",
      "position": {"x": 10.5, "y": -5.2, "z": 3000.0},
      "depth": 3000.0,
      "heading": 1.57,
      "speed": 1.2,
      "battery": 85.3,
      "health": 95,
      "temperature": 4.2,
      "pressure": 300.0,
      "anomalyDetected": false,
      "missionPhase": "survey",
      "timestamp": "2026-08-07T12:00:00Z"
    },
    ...
  ],
  "updatedAt": "2026-08-07T12:00:00Z",
  "simulationMode": true
}
```

**Note**: Simulation mode uses flat vehicle objects (`position.x` not `poseX`), string IDs not numbers, and adds fields like `battery`, `speed`, `temperature` not present in production format. Dashboard must handle ALL three formats.

## Reconnection Behavior

The `useFleetSSE` hook (`cloudflare/pages/src/hooks/useFleetSSE.ts`) implements:

```typescript
// Exponential backoff on disconnect:
// Attempt 1: 1s  →  Attempt 2: 2s  →  Attempt 3: 4s  →  ...  →  Attempt N: min(2^N * 1000, 30000)ms
const backoff = Math.min(Math.pow(2, attempts) * 1000, 30000);
```

**Edge cases handled:**
- Initial connection failure → retry with backoff
- Mid-stream disconnect (network drop) → retry with backoff
- Server sends empty data → ignore, wait for next event
- Server closes connection gracefully → reconnect immediately (backoff reset)
- Multiple rapid reconnects → backoff prevents thundering herd

## Packet Loss Testing

To test dashboard resilience to packet loss (30-70% as expected in acoustic environments):

```bash
# Simulate 50% packet loss on SSE connection
# Using tc (Linux) or Network Link Conditioner (macOS)
# Verify: dashboard shows stale data indicator, doesn't crash, recovers cleanly
```

Expected behavior at each loss rate:
- **30% loss**: Dashboard updates with slight jitter, no user-visible disruption
- **50% loss**: Some update cycles skipped, stale data indicator appears after 3 missed cycles (15s)
- **70% loss**: Frequent stale indicators, data quality degraded but UI still functional

## Dashboard Parsing Logic

```typescript
// In useFleetSSE.ts — must handle ALL three formats:
function parseSSEMessage(data: string): FleetState | null {
    const parsed = JSON.parse(data);
    
    if (parsed.simulationMode) {
        // Format C: simulation mode
        return adaptSimulationToFleetState(parsed);
    }
    if (parsed.states) {
        // Format A: from DO
        return adaptDOStatesToFleetState(parsed);
    }
    if (parsed.vehicles) {
        // Format B: from fleet API
        return adaptVehiclesToFleetState(parsed);
    }
    return null;
}
```

## Implementation Notes

- The SSE endpoint uses `ReadableStream` — no hard time limit per Cloudflare Workers docs (June 2026)
- The DO polling interval (5s) is configurable via `SSE_POLL_INTERVAL_MS` env var
- Dashboard should show a "Live" indicator when last update <10s ago, "Stale" when 10-30s, "Disconnected" when >30s
- Simulation mode (`/api/v1/simulate`) is for demo/development only — production uses `/api/v1/fleet/stream` backed by the DO
