// SSE hook for real-time fleet updates.
// Uses Server-Sent Events (unidirectional) rather than WebSocket,
// because SSE is more satellite-friendly and works through HTTP caches.
//
// Data sources:
//   - Primary:  /api/v1/fleet/stream (real fleet state via the Durable Object)
//   - Fallback: /api/v1/simulate     (live abyssal telemetry when no vessels
//               are connected — keeps the dashboard rendering real-time data)
// Override the primary endpoint with the VITE_SSE_URL env var.

import { useState, useEffect, useRef } from "react";

const SIMULATION_URL = "/api/v1/simulate";
const DEFAULT_STREAM_URL = "/api/v1/fleet/stream";

interface VehicleStatus {
  id: number;
  name: string;
  type: "auv" | "usv" | "support";
  status: "online" | "partitioned" | "offline";
  lastSeen: string | null;
  latestState: {
    x: number;
    y: number;
    z: number;
    yaw: number;
    positionVariance: number;
    healthScore: number;
    missionPhase: number;
    anomalyDetected: boolean;
  } | null;
}

interface FleetState {
  vehicles: VehicleStatus[];
  updatedAt: string;
}

interface UseFleetSSEResult {
  fleetState: FleetState | null;
  connected: boolean;
  simulationMode: boolean;
  error: string | null;
}

export function useFleetSSE(): UseFleetSSEResult {
  const [fleetState, setFleetState] = useState<FleetState | null>(null);
  const [connected, setConnected] = useState(false);
  const [simulationMode, setSimulationMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const retryCount = useRef(0);
  const simulationRef = useRef(false);

  useEffect(() => {
    let eventSource: EventSource | null = null;
    let retryTimeout: ReturnType<typeof setTimeout>;

    /** URL for the current mode: real fleet stream or simulation. */
    function currentUrl(): string {
      if (simulationRef.current) return SIMULATION_URL;
      return import.meta.env.VITE_SSE_URL ?? DEFAULT_STREAM_URL;
    }

    /** Switch to the simulation engine (one-way; page reload returns to real). */
    function switchToSimulation() {
      if (simulationRef.current) return;
      simulationRef.current = true;
      setSimulationMode(true);
      eventSource?.close();
      connect();
    }

    function connect() {
      eventSource = new EventSource(currentUrl());

      eventSource.onopen = () => {
        setConnected(true);
        setError(null);
        retryCount.current = 0;
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const hasStates = !!data.states && Object.keys(data.states).length > 0;
          const hasVehicles = !!data.vehicles && data.vehicles.length > 0;

          if (hasStates) {
            // DO format: { states: { [id]: state }, updatedAt }
            // Transform to our expected shape.
            const vehicles: VehicleStatus[] = Object.entries(data.states).map(
              ([id, state]: [string, unknown]) => {
                const s = state as Record<string, unknown>;
                return {
                  id: Number(id),
                  name: `AUV ${id}`,
                  type: Number(id) >= 10 ? "support" as const : "auv" as const,
                  status: "online" as const,
                  lastSeen: data.updatedAt,
                  latestState: {
                    x: s.x as number,
                    y: s.y as number,
                    z: s.z as number,
                    yaw: s.yaw as number,
                    positionVariance: s.positionVariance as number,
                    healthScore: s.healthScore as number,
                    missionPhase: (s.missionPhase ?? 0) as number,
                    anomalyDetected: s.anomalyDetected as boolean,
                  },
                };
              }
            );
            setFleetState({ vehicles, updatedAt: data.updatedAt });
          } else if (hasVehicles) {
            // API / simulation format: { vehicles: [...], updatedAt, ... }
            setFleetState(data);
          } else if (!simulationRef.current) {
            // Fleet stream yielded nothing — no vessels connected yet.
            // Fall back to the simulation engine so the dashboard always
            // renders live, moving telemetry.
            switchToSimulation();
            return;
          }
        } catch (e) {
          console.warn("Failed to parse SSE message:", e);
        }
      };

      eventSource.onerror = () => {
        setConnected(false);
        eventSource?.close();

        // Exponential backoff: 1s, 2s, 4s, 8s... max 30s
        const delay = Math.min(1000 * Math.pow(2, retryCount.current), 30000);
        retryCount.current++;
        setError(`Reconnecting in ${Math.round(delay / 1000)}s...`);

        retryTimeout = setTimeout(connect, delay);
      };
    }

    // Start with a REST fetch for initial state, then open SSE
    fetch("/api/v1/fleet/status")
      .then((r) => r.json())
      .then((data) => setFleetState(data))
      .catch(() => {});

    connect();

    return () => {
      eventSource?.close();
      clearTimeout(retryTimeout);
    };
  }, []);

  return { fleetState, connected, simulationMode, error };
}
