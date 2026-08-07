// Anomaly review and acknowledgment panel.
// Operators can view detected anomalies and acknowledge them.

import React, { useState, useEffect } from "react";
import { AlertTriangle, CheckCircle, Clock, Filter } from "lucide-react";
import { fetchAnomalies, acknowledgeAnomaly } from "../lib/api";

interface Anomaly {
  id: number;
  vehicleId: number;
  vehicleName: string;
  detectedAt: string;
  receivedAt: string;
  detectorType: string;
  confidence: number;
  severity: number;
  dimension: string;
  ackBy: string | null;
  ackAt: string | null;
}

export function AnomalyPanel() {
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "unacked" | "acked">("unacked");
  const [acknowledging, setAcknowledging] = useState<number | null>(null);

  const loadAnomalies = async () => {
    try {
      setLoading(true);
      const acked = filter === "all" ? undefined : filter === "acked";
      const data = await fetchAnomalies({ acked, limit: 100 });
      setAnomalies(data.anomalies ?? []);
    } catch (e) {
      console.error("Failed to load anomalies:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnomalies();
    // Refresh every 30 seconds
    const interval = setInterval(loadAnomalies, 30_000);
    return () => clearInterval(interval);
  }, [filter]);

  const handleAcknowledge = async (id: number) => {
    try {
      setAcknowledging(id);
      await acknowledgeAnomaly(id, "operator-001");
      // Refresh list
      await loadAnomalies();
    } catch (e) {
      console.error("Failed to acknowledge:", e);
    } finally {
      setAcknowledging(null);
    }
  };

  const SEVERITY_COLORS: Record<string, string> = {
    low: "text-yellow-400",
    medium: "text-orange-400",
    high: "text-red-400",
    critical: "text-red-500 font-bold",
  };

  const getSeverityLevel = (severity: number): string => {
    if (severity >= 0.8) return "critical";
    if (severity >= 0.6) return "high";
    if (severity >= 0.3) return "medium";
    return "low";
  };

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-yellow-400" />
          Anomaly Events
        </h2>
        <div className="flex gap-2">
          {(["unacked", "all", "acked"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 text-xs rounded-lg transition-colors ${
                filter === f
                  ? "bg-abyss-500 text-white"
                  : "bg-abyss-800 text-abyss-400 hover:bg-abyss-700"
              }`}
            >
              <Filter className="h-3 w-3 inline mr-1" />
              {f === "unacked" ? "Unacknowledged" : f === "acked" ? "Acknowledged" : "All"}
            </button>
          ))}
        </div>
      </div>

      {/* Anomaly list */}
      {loading ? (
        <div className="text-center py-8 text-abyss-400">Loading anomalies...</div>
      ) : anomalies.length === 0 ? (
        <div className="text-center py-8 text-abyss-400">
          <CheckCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>No anomalies found.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {anomalies.map((a) => {
            const level = getSeverityLevel(a.severity);
            return (
              <div
                key={a.id}
                className={`rounded-lg border p-4 ${
                  a.ackBy
                    ? "border-abyss-700 bg-abyss-800/30"
                    : "border-yellow-500/30 bg-yellow-500/5"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm">
                        {a.vehicleName ?? `Vehicle ${a.vehicleId}`}
                      </span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${SEVERITY_COLORS[level]}`}
                      >
                        {level}
                      </span>
                      <span className="text-xs text-abyss-400">{a.detectorType}</span>
                    </div>
                    <div className="text-xs text-abyss-400 space-x-4">
                      <span>Dimension: {a.dimension}</span>
                      <span>Confidence: {(a.confidence * 100).toFixed(0)}%</span>
                      <span>Severity: {(a.severity * 100).toFixed(0)}%</span>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-abyss-500 mt-1">
                      <Clock className="h-3 w-3" />
                      Detected: {new Date(a.detectedAt).toLocaleString()}
                      {a.receivedAt !== a.detectedAt && (
                        <span className="ml-2">
                          (received: {new Date(a.receivedAt).toLocaleString()})
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Acknowledge button */}
                  {a.ackBy ? (
                    <div className="text-xs text-green-400 flex items-center gap-1">
                      <CheckCircle className="h-4 w-4" />
                      Acked by {a.ackBy}
                    </div>
                  ) : (
                    <button
                      onClick={() => handleAcknowledge(a.id)}
                      disabled={acknowledging === a.id}
                      className="px-3 py-1 text-xs rounded-lg bg-abyss-600 hover:bg-abyss-500 transition-colors disabled:opacity-50"
                    >
                      {acknowledging === a.id ? "..." : "Acknowledge"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
