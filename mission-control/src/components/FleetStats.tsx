/**
 * FleetStats — left-rail "the WHY" panel: fleet state at a glance.
 *
 * Alignment spec (WIREFRAMES_V3.md §3): col-span 3 · h-[168px] · inset 24.
 * All numbers are tabular-nums; every figure derives from backend state only.
 */
import React from "react";
import { motion } from "framer-motion";
import { AnimatedCard } from "./ui/AnimatedCard";

export interface FleetStatsData {
  total: number;
  online: number;
  partitioned: number;
  offline: number;
  anomalyCount: number;
  totalValue: number;
}

export const FleetStats: React.FC<{ data: FleetStatsData }> = ({ data }) => {
  const stat = (
    label: string,
    value: string,
    tone: "green" | "amber" | "red" | "slate" | "cyan"
  ) => {
    const color =
      tone === "green"
        ? "text-bio-green"
        : tone === "amber"
        ? "text-bio-amber"
        : tone === "red"
        ? "text-bio-red"
        : tone === "cyan"
        ? "text-bio-cyan"
        : "text-slate-300";
    return (
      <div className="flex items-baseline justify-between px-6">
        <span className="text-[11px] uppercase tracking-widest text-slate-500 font-hud">
          {label}
        </span>
        <span className={`font-hud text-lg tabular-nums font-semibold ${color}`}>
          {value}
        </span>
      </div>
    );
  };

  return (
    <AnimatedCard className="p-0 overflow-hidden" glowColor="blue">
      <div className="px-6 pt-4 pb-2 border-b border-bio-cyan/10">
        <h3 className="font-hud text-[11px] uppercase tracking-widest text-bio-cyan">
          Fleet Stats
        </h3>
      </div>
      <div className="py-3 space-y-2">
        {stat("Online", `${data.online}/${data.total}`, data.partitioned > 0 ? "amber" : "green")}
        {stat("Partitioned", String(data.partitioned), data.partitioned > 0 ? "amber" : "slate")}
        {stat("Anomalous", String(data.anomalyCount), data.anomalyCount > 0 ? "red" : "slate")}
        {stat("Fleet Value", `$${(data.totalValue / 1e6).toFixed(1)}M`, "cyan")}
      </div>
      {/* A subtle motion anchor — nothing animates when reduced motion is set. */}
      <motion.div
        className="h-0.5 bg-gradient-to-r from-bio-cyan/60 via-bio-teal/40 to-transparent"
        layoutId="fleetstats-glow"
      />
    </AnimatedCard>
  );
};
