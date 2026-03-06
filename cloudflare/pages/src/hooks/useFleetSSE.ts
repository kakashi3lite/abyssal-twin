// SSE hook for real-time fleet updates.
// Uses Server-Sent Events (unidirectional) rather than WebSocket,
// because SSE is more satellite-friendly and works through HTTP caches.

import { useState, useEffect, useRef } from "react";

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
  error: string | null;
}

export function useFleetSSE(): UseFleetSSEResult {
  const [fleetState, setFleetState] = useState<FleetState | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const retryCount = useRef(0);

  useEffect(() => {
    let eventSource: EventSource | null = null;
    let retryTimeout: ReturnType<typeof setTimeout>;

    function connect() {
      eventSource = new EventSource("/api/v1/fleet/stream");

      eventSource.onopen = () => {
        setConnected(true);
        setError(null);
        retryCount.current = 0;
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // The DO returns { states: { [id]: state }, updatedAt }
          // Transform to our expected format
          if (data.states) {
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
                    missionPhase: s.missionPhase as number,
                    anomalyDetected: s.anomalyDetected as boolean,
                  },
                };
              }
            );
            setFleetState({ vehicles, updatedAt: data.updatedAt });
          } else if (data.vehicles) {
            setFleetState(data);
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

  return { fleetState, connected, error };
}
