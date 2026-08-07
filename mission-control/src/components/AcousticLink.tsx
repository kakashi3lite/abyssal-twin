/**
 * AcousticLink — left-rail acoustic channel health panel.
 *
 * Alignment spec: col-span 3 · h-[120px] · inset 24.
 *
 * Honesty: RX state comes from the SSE connection state. The "cadence health"
 * bar is DERIVED (parent-computed from live packet cadence vs expected) and
 * labeled as such. TX is "—" because the dashboard has no acoustic uplink.
 * Reference ceilings are factual (C2): 23 msg/s @ 9600 baud, 0.7 @ 300 baud.
 */
import React from "react";
import { AnimatedCard } from "./ui/AnimatedCard";

export interface AcousticLinkProps {
  connected: boolean;
  simulationMode: boolean;
  /** Derived 0-100 packet cadence health (null = unknown). */
  linkHealth: number | null;
}

export const AcousticLink: React.FC<AcousticLinkProps> = ({
  connected,
  simulationMode,
  linkHealth,
}) => {
  const stateLabel = simulationMode
    ? "SIM"
    : connected
    ? "RX LIVE"
    : "LINK DOWN";

  const stateColor = simulationMode
    ? "text-bio-amber"
    : connected
    ? "text-bio-green"
    : "text-bio-red";

  const health = linkHealth ?? null;
  const barColor =
    health === null
      ? "bg-slate-700"
      : health >= 70
      ? "bg-bio-green"
      : health >= 40
      ? "bg-bio-amber"
      : "bg-bio-red";

  return (
    <AnimatedCard className="p-0 overflow-hidden">
      <div className="px-6 pt-4 pb-2 border-b border-bio-cyan/10">
        <h3 className="font-hud text-[11px] uppercase tracking-widest text-bio-cyan">
          Acoustic Link
        </h3>
      </div>
      <div className="px-6 py-3 space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="text-[11px] uppercase tracking-widest text-slate-500 font-hud">
            RX
          </span>
          <span className={`font-hud text-sm font-semibold tabular-nums ${stateColor}`}>
            {stateLabel}
          </span>
        </div>

        <div className="flex items-baseline justify-between">
          <span className="text-[11px] uppercase tracking-widest text-slate-500 font-hud">
            Cadence*
          </span>
          <span className="font-hud text-sm tabular-nums text-slate-300">
            {health === null ? "—" : `${Math.round(health)}%`}
          </span>
        </div>
        {/* Derived health bar */}
        <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${barColor}`}
            style={{ width: `${health === null ? 0 : Math.max(2, health)}%` }}
          />
        </div>

        <div className="flex items-baseline justify-between">
          <span className="text-[11px] uppercase tracking-widest text-slate-500 font-hud">
            TX
          </span>
          <span className="font-hud text-sm tabular-nums text-slate-600">—</span>
        </div>

        <p className="text-[10px] text-slate-600 leading-snug font-hud">
          ≤23 msg/s @ 9600 baud · 0.7 msg/s @ 300 baud
        </p>
      </div>
    </AnimatedCard>
  );
};
