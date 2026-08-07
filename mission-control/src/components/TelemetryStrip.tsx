/**
 * TelemetryStrip — center-zone live decode strip under the map.
 *
 * Alignment spec: col-span 6 · h-[72px] · inset 24 · mt-6 (24px gap below map).
 *
 * Shows the live mapped state for the selected asset (or the first online
 * vehicle when nothing is selected) in HUD readout form. The WASM badge shows
 * whether the Rust decode/CUSUM engine is active. Fields the wire does not
 * carry render as "—" (honesty contract, never fabricated).
 */
import React from "react";
import type { FleetAsset } from "./GlobalFleetMap";
import type { WasmEngineState } from "../hooks/useWasmEngine";
import { AnimatedCard } from "./ui/AnimatedCard";
import { healthPct } from "../lib/fleetAdapter";

interface TelemetryStripProps {
  asset: FleetAsset | null;
  wasm: WasmEngineState;
}

export const TelemetryStrip: React.FC<TelemetryStripProps> = ({ asset, wasm }) => {
  const s = asset?.latestState;

  const cell = (label: string, value: string, tone: "default" | "dim" = "default") => (
    <div className="flex flex-col items-start justify-center px-4 border-l border-slate-800/60 first:border-l-0">
      <span className="text-[9px] uppercase tracking-widest text-slate-500 font-hud">
        {label}
      </span>
      <span
        className={`font-hud text-lg tabular-nums leading-tight ${
          tone === "dim" ? "text-slate-600" : "text-bio-cyan"
        }`}
      >
        {value}
      </span>
    </div>
  );

  return (
    <AnimatedCard className="p-0 overflow-hidden mt-6">
      <div className="h-[72px] flex items-stretch">
        {cell("ID", asset ? asset.name : "—")}
        {cell("X", s ? `${s.x.toFixed(1)}m` : "—")}
        {cell("Y", s ? `${s.y.toFixed(1)}m` : "—")}
        {cell("Depth", s ? `${Math.abs(s.z).toFixed(1)}m` : "—")}
        {cell("Heading", s ? `${(((s.yaw * 180) / Math.PI + 360) % 360).toFixed(0)}°` : "—")}
        {cell("σ²", s ? `${s.positionVariance.toFixed(3)}` : "—")}
        {cell("Battery", s?.batteryPct != null ? `${s.batteryPct.toFixed(0)}%` : "—", "dim")}
        {cell("Health", s ? `${healthPct(s.healthScore) ?? "—"}%` : "—")}
        <div className="flex flex-col items-center justify-center px-3 gap-1">
          <span className="text-[9px] uppercase tracking-widest text-slate-500 font-hud">
            Engine
          </span>
          <span
            className={`font-hud text-[10px] px-1.5 py-0.5 rounded border ${
              wasm.ready
                ? "text-bio-green border-bio-green/40 bg-bio-green/5"
                : "text-bio-amber border-bio-amber/40 bg-bio-amber/5"
            }`}
          >
            {wasm.ready ? "WASM" : "JS"}
          </span>
        </div>
      </div>
    </AnimatedCard>
  );
};
