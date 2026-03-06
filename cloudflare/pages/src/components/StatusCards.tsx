// Fleet status cards: one per vehicle showing key metrics.

import React from "react";
import { Waves, AlertTriangle, Battery, Navigation } from "lucide-react";

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
    healthScore: number;
    missionPhase: number;
    anomalyDetected: boolean;
    positionVariance: number;
  } | null;
}

const STATUS_COLORS = {
  online: "bg-green-500/20 text-green-400 border-green-500/30",
  partitioned: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  offline: "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

const PHASE_LABELS = ["Idle", "Transit", "Survey", "Emergency"];

export function StatusCards({ vehicles }: { vehicles: VehicleStatus[] }) {
  if (vehicles.length === 0) {
    return (
      <div className="text-center py-8 text-abyss-400">
        <Waves className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>No vehicle data available. Waiting for fleet telemetry...</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {vehicles.map((v) => (
        <div
          key={v.id}
          className={`rounded-xl border p-4 ${STATUS_COLORS[v.status]} backdrop-blur-sm`}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              {v.type === "support" ? (
                <Navigation className="h-4 w-4" />
              ) : (
                <Waves className="h-4 w-4" />
              )}
              <span className="font-medium text-sm">{v.name}</span>
            </div>
            <span className="text-xs uppercase tracking-wider opacity-80">
              {v.status}
            </span>
          </div>

          {v.latestState ? (
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="opacity-60">Position</span>
                <span className="font-mono">
                  ({v.latestState.x.toFixed(1)}, {v.latestState.y.toFixed(1)},{" "}
                  {v.latestState.z.toFixed(1)})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="opacity-60">Depth</span>
                <span className="font-mono">
                  {Math.abs(v.latestState.z).toFixed(1)}m
                </span>
              </div>
              <div className="flex justify-between">
                <span className="opacity-60">Phase</span>
                <span>{PHASE_LABELS[v.latestState.missionPhase] ?? "Unknown"}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="opacity-60">Health</span>
                <div className="flex items-center gap-1">
                  <Battery className="h-3 w-3" />
                  <span>{Math.round((v.latestState.healthScore / 255) * 100)}%</span>
                </div>
              </div>
              {v.latestState.anomalyDetected && (
                <div className="flex items-center gap-1 text-red-400 mt-1">
                  <AlertTriangle className="h-3 w-3" />
                  <span className="text-xs font-medium">Anomaly detected</span>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs opacity-50">No telemetry</p>
          )}

          {v.lastSeen && (
            <div className="mt-3 text-xs opacity-40">
              Last seen: {new Date(v.lastSeen).toLocaleTimeString()}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
