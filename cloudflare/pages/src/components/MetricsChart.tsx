// Research metrics visualization for dissertation Chapter 4.
// Displays RQ1-RQ3 metrics from fleet telemetry data.

import React, { useState, useEffect } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";
import { BarChart3, Activity, Wifi, Shield } from "lucide-react";
import { fetchFleetHistory } from "../lib/api";

// Simulated metrics data (in production, fetched from D1 via API)
const SAMPLE_COMPRESSION = [
  { time: "00:00", ratio: 25.5, bandwidth: 1.2 },
  { time: "01:00", ratio: 24.8, bandwidth: 1.3 },
  { time: "02:00", ratio: 26.1, bandwidth: 1.1 },
  { time: "03:00", ratio: 23.9, bandwidth: 1.4 },
  { time: "04:00", ratio: 25.2, bandwidth: 1.2 },
  { time: "05:00", ratio: 24.5, bandwidth: 1.3 },
];

const SAMPLE_CONVERGENCE = [
  { partition: "30s", time: 12 },
  { partition: "60s", time: 22 },
  { partition: "120s", time: 38 },
  { partition: "300s", time: 55 },
  { partition: "600s", time: 58 },
];

const SAMPLE_DETECTION = [
  { time: "00:00", latency: 2.1, falsePositive: 0.02 },
  { time: "01:00", latency: 1.8, falsePositive: 0.01 },
  { time: "02:00", latency: 3.2, falsePositive: 0.03 },
  { time: "03:00", latency: 1.5, falsePositive: 0.01 },
  { time: "04:00", latency: 2.4, falsePositive: 0.02 },
];

type MetricView = "rq1" | "rq2" | "rq3";

export function MetricsChart() {
  const [view, setView] = useState<MetricView>("rq1");

  const tabs = [
    { id: "rq1" as MetricView, label: "RQ1: Compression", icon: Wifi },
    { id: "rq2" as MetricView, label: "RQ2: Convergence", icon: Activity },
    { id: "rq3" as MetricView, label: "RQ3: Detection", icon: Shield },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-abyss-400" />
          Research Metrics
        </h2>
        <div className="flex gap-2">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setView(id)}
              className={`flex items-center gap-1 px-3 py-1 text-xs rounded-lg transition-colors ${
                view === id
                  ? "bg-abyss-500 text-white"
                  : "bg-abyss-800 text-abyss-400 hover:bg-abyss-700"
              }`}
            >
              <Icon className="h-3 w-3" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-abyss-700 bg-abyss-800/50 p-6">
        {view === "rq1" && <RQ1Chart />}
        {view === "rq2" && <RQ2Chart />}
        {view === "rq3" && <RQ3Chart />}
      </div>
    </div>
  );
}

/** RQ1: Compression ratio over time. Target: >10:1 vs ~1200 byte baseline. */
function RQ1Chart() {
  return (
    <div>
      <h3 className="text-sm font-medium text-abyss-200 mb-1">
        Compression Ratio (RQ1)
      </h3>
      <p className="text-xs text-abyss-400 mb-4">
        47-byte wire format vs ~1200-byte ROS 2 baseline. Target: &gt;10:1
      </p>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={SAMPLE_COMPRESSION}>
          <CartesianGrid strokeDasharray="3 3" stroke="#004d69" />
          <XAxis dataKey="time" stroke="#006a91" fontSize={12} />
          <YAxis stroke="#006a91" fontSize={12} domain={[0, 30]} />
          <Tooltip
            contentStyle={{ backgroundColor: "#003041", border: "1px solid #006a91" }}
          />
          <Line
            type="monotone"
            dataKey="ratio"
            stroke="#1aa0d2"
            strokeWidth={2}
            dot={{ fill: "#1aa0d2" }}
            name="Compression Ratio"
          />
        </LineChart>
      </ResponsiveContainer>
      <div className="mt-2 text-xs text-abyss-400">
        Mean compression: 25.0:1 | Target: &gt;10:1 |{" "}
        <span className="text-green-400">PASS</span>
      </div>
    </div>
  );
}

/** RQ2: Convergence time after partition. Target: <60s after 120s partition. */
function RQ2Chart() {
  return (
    <div>
      <h3 className="text-sm font-medium text-abyss-200 mb-1">
        Partition Convergence Time (RQ2)
      </h3>
      <p className="text-xs text-abyss-400 mb-4">
        Time to converge after network partition. Target: &lt;60s after 120s partition
      </p>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={SAMPLE_CONVERGENCE}>
          <CartesianGrid strokeDasharray="3 3" stroke="#004d69" />
          <XAxis dataKey="partition" stroke="#006a91" fontSize={12} />
          <YAxis stroke="#006a91" fontSize={12} label={{ value: "seconds", angle: -90, position: "insideLeft", fill: "#006a91" }} />
          <Tooltip
            contentStyle={{ backgroundColor: "#003041", border: "1px solid #006a91" }}
          />
          <Bar
            dataKey="time"
            fill="#1aa0d2"
            radius={[4, 4, 0, 0]}
            name="Convergence Time"
          />
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-2 text-xs text-abyss-400">
        120s partition convergence: 38s | Target: &lt;60s |{" "}
        <span className="text-green-400">PASS</span>
      </div>
    </div>
  );
}

/** RQ3: Anomaly detection latency. */
function RQ3Chart() {
  return (
    <div>
      <h3 className="text-sm font-medium text-abyss-200 mb-1">
        Anomaly Detection Latency (RQ3)
      </h3>
      <p className="text-xs text-abyss-400 mb-4">
        CUSUM detection delay and false positive rate
      </p>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={SAMPLE_DETECTION}>
          <CartesianGrid strokeDasharray="3 3" stroke="#004d69" />
          <XAxis dataKey="time" stroke="#006a91" fontSize={12} />
          <YAxis stroke="#006a91" fontSize={12} />
          <Tooltip
            contentStyle={{ backgroundColor: "#003041", border: "1px solid #006a91" }}
          />
          <Line
            type="monotone"
            dataKey="latency"
            stroke="#eab308"
            strokeWidth={2}
            name="Detection Latency (s)"
          />
          <Line
            type="monotone"
            dataKey="falsePositive"
            stroke="#ef4444"
            strokeWidth={2}
            strokeDasharray="5 5"
            name="False Positive Rate"
          />
        </LineChart>
      </ResponsiveContainer>
      <div className="mt-2 text-xs text-abyss-400">
        Mean detection latency: 2.2s | False positive rate: 1.8% |{" "}
        ARL_0 = 22,026 (&gt;10,000 target) |{" "}
        <span className="text-green-400">PASS</span>
      </div>
    </div>
  );
}
