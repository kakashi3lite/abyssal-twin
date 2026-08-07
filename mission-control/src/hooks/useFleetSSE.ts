/**
 * useFleetSSE — real-time fleet telemetry for Mission Control.
 *
 * Primary:   /api/v1/fleet/stream  (DO state, SSE, ~5s cadence)
 * Fallback:  /api/v1/simulate      (synthetic telemetry when no vessels are
 *                                   connected — keeps the dashboard alive, but
 *                                   the SIMULATION badge stays visible so the
 *                                   operator is never misled about provenance)
 * Initial:   /api/v1/fleet/status   (REST snapshot for instant first paint)
 *
 * Override with VITE_SSE_URL. Reconnect uses exponential backoff (1s→30s).
 */
import { useState, useEffect, useRef } from "react";
import type { FleetStatus, Vehicle, StateVector } from "../types";
import { apiUrl } from "../lib/config";
import { DemoDataEngine } from "../demo-data";

const SIMULATION_URL = () => apiUrl("/api/v1/simulate");
const STREAM_URL = () => apiUrl("/api/v1/fleet/stream");
// After this many failed SSE connection attempts with no successful message,
// fall back to the self-contained client-side DemoDataEngine (works with NO
// backend — this is what powers the GitHub Pages research demo).
const DEMO_FALLBACK_ATTEMPTS = 3;

export interface UseFleetSSEResult {
  fleetState: FleetStatus | null;
  connected: boolean;
  simulationMode: boolean;
  error: string | null;
}

/** Parse an SSE payload that may be DO-shaped ({states:{id:...}}) or API-shaped ({vehicles:[...]}). */
function parseFleetPayload(data: string): Vehicle[] | null {
  let payload: any;
  try {
    payload = JSON.parse(data);
  } catch {
    return null;
  }

  if (Array.isArray(payload.vehicles)) {
    return payload.vehicles as Vehicle[];
  }

  if (payload.states) {
    const vehicles: Vehicle[] = [];
    for (const [key, raw] of Object.entries<any>(payload.states)) {
      const auvId = Number(key);
      const s = raw;
      if (!s || typeof s.auvId === "undefined") continue;
      const state: StateVector = {
        auvId: s.auvId,
        timestamp: s.timestamp ?? Date.now() / 1000,
        x: s.x ?? 0,
        y: s.y ?? 0,
        z: s.z ?? 0,
        yaw: s.yaw ?? 0,
        positionVariance: s.positionVariance ?? 0,
        anomalyDetected: s.anomalyDetected ?? false,
        healthScore: s.healthScore ?? 0,
        batteryPct: s.batteryPct,
        missionPhase: s.missionPhase ?? 0,
        anomalyDimension: s.anomalyDimension ?? 0,
        depthM: Math.abs(s.z ?? 0),
        heading: ((s.yaw ?? 0) * 180) / Math.PI,
      };
      vehicles.push({
        id: auvId,
        name: `AUV-${String(auvId).padStart(2, "0")}`,
        type: auvId >= 10 ? "support" : "auv",
        status: s.status ?? "online",
        lastSeen: s.lastSeen ?? new Date((s.timestamp ?? Date.now() / 1000) * 1000).toISOString(),
        latestState: state,
      });
    }
    return vehicles;
  }

  return null;
}

export function useFleetSSE(): UseFleetSSEResult {
  const [fleetState, setFleetState] = useState<FleetStatus | null>(null);
  const [connected, setConnected] = useState(false);
  const [simulationMode, setSimulationMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const retryCount = useRef(0);
  const simulationRef = useRef(false);
  const demoEngineRef = useRef<DemoDataEngine | null>(null);
  const failuresRef = useRef(0);

  useEffect(() => {
    let eventSource: EventSource | null = null;
    let retryTimeout: ReturnType<typeof setTimeout>;
    let disposed = false;

    /** Start the client-side DemoDataEngine — the ultimate no-backend fallback
     *  (GitHub Pages demo). Produces realistic AUV mission data locally, with
     *  the SIMULATION badge kept visible so provenance is never hidden. */
    function startDemoEngine() {
      if (demoEngineRef.current) return;
      const engine = new DemoDataEngine();
      demoEngineRef.current = engine;
      engine.start((fleet) => {
        if (disposed) return;
        simulationRef.current = true;
        setSimulationMode(true);
        setFleetState(fleet);
        setConnected(true);
        setError(null);
        retryCount.current = 0;
      });
    }

    function currentUrl(): string {
      if (simulationRef.current) return SIMULATION_URL();
      return (import.meta.env.VITE_SSE_URL as string | undefined) ?? STREAM_URL();
    }

    function switchToSimulation() {
      if (simulationRef.current || disposed) return;
      simulationRef.current = true;
      setSimulationMode(true);
      eventSource?.close();
      connect();
    }

    function applyVehicles(vehicles: Vehicle[]) {
      if (disposed) return;
      if (vehicles.length === 0) {
        // Real stream is empty (no vessels/gateway) → fall back to simulation.
        switchToSimulation();
        return;
      }
      failuresRef.current = 0;
      setFleetState({ vehicles, updatedAt: new Date().toISOString() });
      retryCount.current = 0;
    }

    function connect() {
      if (disposed) return;
      // EventSource cannot set headers; withCredentials sends the Cloudflare
      // Access CF_Authorization cookie so the protected stream accepts us.
      eventSource = new EventSource(currentUrl(), { withCredentials: true });

      eventSource.onopen = () => {
        setConnected(true);
        setError(null);
      };

      eventSource.onmessage = (ev) => {
        const vehicles = parseFleetPayload(ev.data);
        if (vehicles) applyVehicles(vehicles);
      };

      eventSource.onerror = () => {
        setConnected(false);
        // Count consecutive failures; after the threshold with no successful
        // message, fall back to the self-contained demo engine (GH Pages demo
        // has no backend at all — never leave the operator with a dead screen).
        failuresRef.current += 1;
        if (failuresRef.current >= DEMO_FALLBACK_ATTEMPTS) {
          eventSource?.close();
          startDemoEngine();
          return;
        }
        const attempt = retryCount.current++;
        const delay = Math.min(1000 * 2 ** attempt, 30000);
        setError(`Link degraded — reconnecting in ${Math.round(delay / 1000)}s`);
        eventSource?.close();
        retryTimeout = setTimeout(connect, delay);
      };
    }

    // Initial REST snapshot for an instant first paint (no spinner).
    fetch(apiUrl("/api/v1/fleet/status"), { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: any) => {
        if (disposed || !data?.vehicles || data.vehicles.length === 0) return;
        failuresRef.current = 0;
        setFleetState(data);
      })
      .catch(() => {
        // No backend reachable (e.g. GitHub Pages) — the SSE retries below
        // will trigger the demo engine fallback; nothing else to do here.
      });

    connect();

    return () => {
      disposed = true;
      eventSource?.close();
      clearTimeout(retryTimeout);
      demoEngineRef.current?.stop?.();
      demoEngineRef.current = null;
    };
  }, []);

  return { fleetState, connected, simulationMode, error };
}
