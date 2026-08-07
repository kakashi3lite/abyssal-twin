/**
 * CusumLive — left-rail live CUSUM S⁺/S⁻ gauges computed by the Rust-WASM
 * engine (with an exact-math JS fallback).
 *
 * Alignment spec: col-span 3 · h-[160px] · inset 24.
 *
 * Honesty: the SSE stream carries positionVariance (σ²) but not the raw 7-dim
 * residuals the fleet tier monitors. This panel therefore runs CUSUM on a
 * *variance-shift proxy* (see lib/wasmFallback.ts) and says so explicitly.
 * The label distinguishes browser-side proxy CUSUM from fleet-tier residual
 * CUSUM — we never claim these S⁺/S⁻ are the same statistics.
 */
import React, { useMemo, useRef } from "react";
import type { Vehicle } from "../types";
import type { WasmEngineState, CusumDetectorLike, CusumAlertLike } from "../hooks/useWasmEngine";
import { JsCusumDetector, VarianceProxy } from "../lib/wasmFallback";
import { AnimatedCard } from "./ui/AnimatedCard";

interface CusumLiveProps {
  vehicles: Vehicle[];
  wasm: WasmEngineState;
}

interface DetectorState {
  sPlus: number;
  sMinus: number;
  alarms: number;
  samples: number;
}

export const CusumLive: React.FC<CusumLiveProps> = ({ vehicles, wasm }) => {
  // One detector + variance proxy per vehicle id, kept in refs so updates are
  // incremental (stream cadence) rather than recomputed from scratch.
  const detectorsRef = useRef<Map<number, { det: CusumDetectorLike; proxy: VarianceProxy }>>(
    new Map()
  );

  const fleet = useMemo<DetectorState>(() => {
    const map = detectorsRef.current;
    let maxSPlus = 0;
    let maxSMinus = 0;
    let alarms = 0;
    let samples = 0;

    for (const v of vehicles) {
      let entry = map.get(v.id);
      if (!entry) {
        const det = wasm.newCusumDetector
          ? wasm.newCusumDetector()
          : (new JsCusumDetector() as unknown as CusumDetectorLike);
        entry = { det, proxy: new VarianceProxy() };
        map.set(v.id, entry);
      }
      const variance = v.latestState?.positionVariance;
      if (typeof variance === "number" && Number.isFinite(variance)) {
        const z = entry.proxy.next(variance);
        const alert: CusumAlertLike | undefined = entry.det.update(z);
        if (alert) alarms += 1;
      }
      maxSPlus = Math.max(maxSPlus, entry.det.s_plus);
      maxSMinus = Math.max(maxSMinus, entry.det.s_minus);
      samples += entry.det.samples;
    }
    return { sPlus: maxSPlus, sMinus: maxSMinus, alarms, samples };
  }, [vehicles, wasm.newCusumDetector]);

  const engine = wasm.ready ? "WASM" : wasm.error ? "JS fallback" : "loading…";

  const gauge = (label: string, value: number, color: string) => (
    <div className="flex flex-col items-start gap-1 px-6">
      <span className="text-[10px] uppercase tracking-widest text-slate-500 font-hud">
        {label}
      </span>
      <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${Math.min(100, (value / 10.5) * 100)}%` }}
        />
      </div>
      <span className="font-hud text-lg tabular-nums text-slate-200">
        {value.toFixed(2)}
      </span>
    </div>
  );

  return (
    <AnimatedCard className="p-0 overflow-hidden">
      <div className="px-6 pt-4 pb-2 border-b border-bio-cyan/10 flex items-center justify-between">
        <h3 className="font-hud text-[11px] uppercase tracking-widest text-bio-cyan">
          CUSUM Live
        </h3>
        <span
          className={`text-[9px] font-hud tracking-wider px-1.5 py-0.5 rounded border ${
            wasm.ready
              ? "text-bio-green border-bio-green/40 bg-bio-green/5"
              : "text-bio-amber border-bio-amber/40 bg-bio-amber/5"
          }`}
        >
          {engine}
        </span>
      </div>
      <div className="py-3 space-y-2">
        {gauge("S+", fleet.sPlus, "bg-bio-cyan")}
        {gauge("S−", fleet.sMinus, "bg-bio-teal")}
        <div className="flex items-baseline justify-between px-6">
          <span className="text-[10px] uppercase tracking-widest text-slate-500 font-hud">
            Alarms
          </span>
          <span
            className={`font-hud text-sm tabular-nums ${
              fleet.alarms > 0 ? "text-bio-red" : "text-slate-400"
            }`}
          >
            {fleet.alarms}
          </span>
        </div>
        <p className="px-6 text-[10px] text-slate-600 leading-snug font-hud">
          variance-proxy CUSUM · h=10.5 k=0.5 · {fleet.samples} samples
        </p>
      </div>
    </AnimatedCard>
  );
};
