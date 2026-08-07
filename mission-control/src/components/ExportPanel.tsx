/**
 * ExportPanel — left-rail export actions + CUSUM parameter reference.
 *
 * Alignment spec: col-span 3 · h-[96px] · inset 24.
 * Every control is functional (opens the backend export endpoint) or honestly
 * labeled. Reports export live data from the mission database.
 */
import React from "react";
import { motion } from "framer-motion";
import { AnimatedCard } from "./ui/AnimatedCard";
import { apiUrl } from "../lib/config";

export const ExportPanel: React.FC = () => {
  const openExport = (path: string) =>
    window.open(apiUrl(path), "_blank", "noopener,noreferrer");

  const btn =
    "flex-1 px-3 py-2 bg-slate-800/50 hover:bg-slate-700/50 text-slate-200 text-xs rounded-lg transition-colors border border-slate-700/30 hover:border-bio-cyan/40 flex items-center justify-center gap-2 font-hud";

  return (
    <AnimatedCard className="p-0 overflow-hidden">
      <div className="px-6 pt-4 pb-2 border-b border-bio-cyan/10">
        <h3 className="font-hud text-[11px] uppercase tracking-widest text-bio-cyan">
          Export
        </h3>
      </div>
      <div className="px-6 py-3 flex items-center gap-2">
        <motion.button
          onClick={() => openExport("/api/v1/export/anomalies")}
          className={btn}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
        >
          📊 Anomalies
        </motion.button>
        <motion.button
          onClick={() => openExport("/api/v1/export/state-vectors")}
          className={btn}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
        >
          📡 States
        </motion.button>
      </div>
      <p className="px-6 pb-3 text-[10px] text-slate-600 font-hud">
        CSV from live mission DB · CUSUM h=10.5 k=0.5 (ARL₀&gt;10k)
      </p>
    </AnimatedCard>
  );
};
