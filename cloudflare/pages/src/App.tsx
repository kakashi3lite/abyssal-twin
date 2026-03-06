// Abyssal Twin Mission Control — Main Application
// Real-time fleet monitoring dashboard for AUV operations.

import React, { useState } from "react";
import { FleetMap } from "./components/FleetMap";
import { StatusCards } from "./components/StatusCards";
import { AnomalyPanel } from "./components/AnomalyPanel";
import { MetricsChart } from "./components/MetricsChart";
import { useFleetSSE } from "./hooks/useFleetSSE";
import { Waves, AlertTriangle, BarChart3, Navigation } from "lucide-react";

type Tab = "dashboard" | "anomalies" | "analytics";

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const { fleetState, connected, error } = useFleetSSE();

  const vehicles = fleetState?.vehicles ?? [];
  const onlineCount = vehicles.filter((v) => v.status === "online").length;
  const partitionedCount = vehicles.filter((v) => v.status === "partitioned").length;

  return (
    <div className="min-h-screen bg-abyss-900 text-white">
      {/* Header */}
      <header className="border-b border-abyss-700 bg-abyss-800/80 backdrop-blur-sm">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Waves className="h-6 w-6 text-abyss-400" />
            <h1 className="text-lg font-semibold tracking-tight">
              Abyssal Twin
              <span className="ml-2 text-sm font-normal text-abyss-300">
                Mission Control
              </span>
            </h1>
          </div>

          {/* Connection status indicator */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm">
              <div
                className={`h-2 w-2 rounded-full ${
                  connected ? "bg-green-400 animate-pulse" : "bg-red-400"
                }`}
              />
              <span className="text-abyss-300">
                {connected ? "Live" : error ?? "Disconnected"}
              </span>
            </div>
            <div className="text-sm text-abyss-400">
              {onlineCount} online
              {partitionedCount > 0 && (
                <span className="text-yellow-400 ml-2">
                  {partitionedCount} partitioned
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Tab navigation */}
        <nav className="mx-auto max-w-7xl px-4 flex gap-1">
          {[
            { id: "dashboard" as Tab, label: "Fleet Dashboard", icon: Navigation },
            { id: "anomalies" as Tab, label: "Anomalies", icon: AlertTriangle },
            { id: "analytics" as Tab, label: "Analytics", icon: BarChart3 },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-2 px-4 py-2 text-sm rounded-t-lg transition-colors ${
                activeTab === id
                  ? "bg-abyss-900 text-white border-b-2 border-abyss-400"
                  : "text-abyss-400 hover:text-white hover:bg-abyss-700/50"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </nav>
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-7xl px-4 py-6">
        {activeTab === "dashboard" && (
          <div className="space-y-6">
            <StatusCards vehicles={vehicles} />
            <div className="rounded-xl border border-abyss-700 bg-abyss-800/50 overflow-hidden">
              <div className="px-4 py-3 border-b border-abyss-700">
                <h2 className="text-sm font-medium text-abyss-200">
                  Fleet Positioning (3D)
                </h2>
              </div>
              <div className="h-[500px]">
                <FleetMap vehicles={vehicles} />
              </div>
            </div>
          </div>
        )}

        {activeTab === "anomalies" && <AnomalyPanel />}
        {activeTab === "analytics" && <MetricsChart />}
      </main>
    </div>
  );
}
