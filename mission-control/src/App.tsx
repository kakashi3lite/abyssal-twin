/**
 * App.tsx - Enhanced Enterprise Mission Control
 * 
 * Integrates GlobalFleetMap, SafetyEngine, and MissionReplay
 * with smooth animations and polished UI components
 * 
 * @version 2.1.0 - UX Enhanced
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { FleetAsset, FleetAlert } from './components/GlobalFleetMap';
import GlobalFleetMap from './components/GlobalFleetMap';
import { SafetyEngine } from './services/SafetyEngine';
import type { MissionRecording, RecordedState } from './components/MissionReplay';
import MissionReplay from './components/MissionReplay';
import type { Vehicle, StateVector } from './types';
import { useFleetSSE } from './hooks/useFleetSSE';
import { useWasmEngine } from './hooks/useWasmEngine';
import { fleetToAssets, generateFleetAlerts, healthPct, MISSION_ORIGIN } from './lib/fleetAdapter';
import { fetchAnomalies, acknowledgeAnomaly, type BackendAnomaly } from './lib/api';
import { apiUrl } from './lib/config';

// New animated components
import { AnimatedCard } from './components/ui/AnimatedCard';
import { TelemetryGauge } from './components/ui/TelemetryGauge';
import { AnimatedAlert, AlertContainer } from './components/ui/AnimatedAlert';
import { AssetCard } from './components/ui/AssetCard';
import { AuroraField } from './components/effects/AuroraField';
import { FleetStats } from './components/FleetStats';
import { AcousticLink } from './components/AcousticLink';
import { CusumLive } from './components/CusumLive';
import { ExportPanel } from './components/ExportPanel';
import { TelemetryStrip } from './components/TelemetryStrip';
import { pageVariants, containerVariants, fadeInUp } from './lib/animations';

// ============================================
// HONESTY CONTRACT
// ============================================
// The live stream carries x/y/z, yaw, healthScore, missionPhase and the
// anomaly flag. It does NOT carry battery → PNR (etPnr) is left null and the
// UI renders "—" / "N/A". We never fabricate a battery figure, because a PNR
// call is a $1M+ safety decision. When the wire carries battery, this unlocks.

/** UTC clock — naval operations run on Z-time. */
function UtcClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    <span className="font-hud text-sm tabular-nums text-bio-cyan/90 tracking-wider">
      {now.getUTCFullYear()}-{pad(now.getUTCMonth() + 1)}-{pad(now.getUTCDate())}{' '}
      {pad(now.getUTCHours())}:{pad(now.getUTCMinutes())}:{pad(now.getUTCSeconds())}Z
    </span>
  );
}

const generateMockRecording = (): MissionRecording => ({
  id: 'rec-demo-001',
  missionName: 'Abyssal Survey Expedition 2026',
  vehicleId: 1,
  vehicleName: 'AUV-01 Nautilus',
  startTime: Date.now() - 3600000,
  endTime: Date.now(),
  durationSeconds: 3600,
  stateCount: 1800,
  eventCount: 15,
  hasAnomalies: true,
  fileSizeBytes: 2457600,
  recordingQuality: 'high',
});

const generateMockStates = (): RecordedState[] => {
  const states: RecordedState[] = [];
  
  for (let i = 0; i < 300; i++) {
    const progress = i / 300;
    const hasAnomaly = i > 200 && i < 220;
    
    states.push({
      timestamp: progress * 60000,
      state: {
        auvId: 1,
        timestamp: Date.now() - (300 - i) * 200,
        x: 100 + progress * 500,
        y: 200 + Math.sin(progress * 10) * 50,
        z: -(3000 + Math.sin(progress * 5) * 100),
        yaw: progress * Math.PI * 2,
        positionVariance: 0.5 + Math.random() * 0.3,
        anomalyDetected: hasAnomaly,
        healthScore: hasAnomaly ? 70 : 95,
        batteryPct: 85 - progress * 20,
        depthM: 3000 + Math.sin(progress * 5) * 100,
        pressureBar: 300 + Math.sin(progress * 5) * 10,
        heading: (progress * 720) % 360,
      },
      events: i === 0 ? [{
        id: 'evt-start',
        timestamp: 0,
        type: 'mission_start',
        severity: 'info',
        message: 'Mission started',
      }] : i === 200 ? [{
        id: 'evt-anomaly',
        timestamp: 200 * 200,
        type: 'anomaly_detected',
        severity: 'critical',
        message: 'Pressure anomaly detected',
      }] : [],
      isKeyframe: i % 10 === 0,
    });
  }
  
  return states;
};

// ============================================
// MAIN APPLICATION
// ============================================

const App: React.FC = () => {
  // ── Real-time fleet stream (real SSE → simulation fallback, never fake) ──
  const { fleetState, connected, simulationMode, error } = useFleetSSE();
  const wasm = useWasmEngine();
  const [alerts, setAlerts] = useState<FleetAlert[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<number | null>(null);
  const [showReplay, setShowReplay] = useState(false);
  const [backendAnomalies, setBackendAnomalies] = useState<BackendAnomaly[]>([]);
  const [safetyEngine] = useState(() => new SafetyEngine());

  // ── Derived acoustic link health (honest: from SSE cadence only) ─────────
  // Expected cadence: 1 update / 5s from the DO stream. We count real updates
  // in a sliding 10s window; health = actual/expected × 100. Simulation has no
  // acoustic link → null ("—" in the UI). This is a derived estimate, never a
  // fabricated metric.
  const updateTimesRef = useRef<number[]>([]);
  const [linkHealth, setLinkHealth] = useState<number | null>(null);
  useEffect(() => {
    if (fleetState) {
      const now = Date.now();
      updateTimesRef.current = [
        ...updateTimesRef.current.filter((t) => now - t < 30_000),
        now,
      ];
    }
  }, [fleetState]);
  useEffect(() => {
    if (simulationMode) {
      setLinkHealth(null);
      return;
    }
    const tick = () => {
      const now = Date.now();
      const recent = updateTimesRef.current.filter((t) => now - t < 10_000);
      const expected = 2; // 2 updates per 10s at the 5s DO cadence
      const health = Math.min(100, Math.round((recent.length / expected) * 100));
      setLinkHealth(connected ? health : 0);
    };
    tick();
    const t = setInterval(tick, 5000);
    return () => clearInterval(t);
  }, [simulationMode, connected]);

  const recording = useMemo(() => generateMockRecording(), []);
  const recordedStates = useMemo(() => generateMockStates(), []);

  // Backend state → map assets (anchored to MISSION_ORIGIN).
  // PNR is computed by the SafetyEngine ONLY when the wire carries batteryPct —
  // otherwise etPnr stays null and the UI says "N/A" (honesty contract).
  const assets = useMemo(() => {
    const base = fleetToAssets(fleetState);
    return base.map((asset) => {
      if (!asset.latestState?.batteryPct) return asset;
      const pnr = safetyEngine.calculatePointOfNoReturn(
        asset,
        { x: 0, y: 0, z: 0 },
        {
          vehicleId: asset.id,
          vehicleType: asset.type === "support" ? "usv" : asset.type,
          massKg: asset.type === "auv" ? 150 : 80,
          dragCoefficient: 0.3,
          frontalAreaM2: 0.15,
          basePowerDrawW: 50,
          propulsionEfficiency: 0.7,
          batteryCapacityWh: 5000,
          currentSpeedMs: 2.5,
          maxSpeedMs: 4.0,
          maxDepthM: 6000,
        },
        {
          currentSpeedMs: 0.5,
          currentDirectionDegrees: 45,
          vehicleHeadingDegrees: asset.latestState.heading ?? 0,
          waterDensityKgM3: 1025,
          temperatureC: 4,
          seaState: 2,
        }
      );
      return { ...asset, etPnr: pnr.minutesToPnr };
    });
  }, [fleetState, safetyEngine]);
  const vehicles = useMemo(() => fleetState?.vehicles ?? [], [fleetState]);

  // Alerts derived ONLY from what the backend actually reports.
  useEffect(() => {
    setAlerts(generateFleetAlerts(assets));
  }, [assets]);

  // Backend CUSUM anomalies → banner (poll; ack writes back to D1).
  const refreshAnomalies = useCallback(() => {
    fetchAnomalies({ acked: false, limit: 20 }).then(setBackendAnomalies);
  }, []);
  useEffect(() => {
    refreshAnomalies();
    const t = setInterval(refreshAnomalies, 30000);
    return () => clearInterval(t);
  }, [refreshAnomalies]);

  // SafetyEngine is ready; PNR is computed per-asset in the assets memo above.
  const handleAssetSelect = useCallback((asset: FleetAsset) => {
    setSelectedAssetId(asset.id);
  }, []);

  const handleDismissAlert = useCallback((id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const handleAckAnomaly = useCallback(
    (id: number) => {
      acknowledgeAnomaly(id).then((ok) => {
        if (ok) refreshAnomalies();
      });
    },
    [refreshAnomalies]
  );

  const selectedAsset = useMemo(
    () => assets.find((a) => a.id === selectedAssetId),
    [assets, selectedAssetId]
  );

  const fleetSummary = useMemo(() => {
    const total = assets.length;
    const online = assets.filter((a) => a.status === "online").length;
    const partitioned = assets.filter((a) => a.status === "partitioned").length;
    const offline = assets.filter((a) => a.status === "offline").length;
    const anomalyCount = assets.filter((a) => a.latestState?.anomalyDetected).length;
    const totalValue = assets.reduce((sum, a) => sum + a.assetValue, 0);
    return { total, online, partitioned, offline, anomalyCount, totalValue };
  }, [assets]);

  // Selected asset telemetry — battery/PNR honest (null → "—").
  const selectedTelemetry = useMemo(() => {
    if (!selectedAsset?.latestState) return null;
    const state = selectedAsset.latestState;
    return {
      battery: state.batteryPct ?? null,
      depth: Math.abs(state.z),
      health: state.healthScore,
      pnr: selectedAsset.etPnr ?? null,
      heading: ((state.yaw * 180) / Math.PI + 360) % 360,
    };
  }, [selectedAsset]);
  
  return (
    <motion.div
      className="min-h-screen bg-abyss-void text-slate-200 relative overflow-hidden"
      variants={pageVariants}
      initial="initial"
      animate="animate"
    >
      {/* Background Effects — WebGPU aurora (Canvas2D fallback, reduced-motion safe) */}
      <AuroraField />
      
      {/* Header */}
      <motion.header
        className="bg-abyss-surface/80 backdrop-blur-md border-b border-bio-cyan/10 sticky top-0 z-50"
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      >
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <motion.div 
              className="flex items-center gap-3"
              whileHover={{ scale: 1.02 }}
            >
              <motion.div 
                className="w-10 h-10 bg-gradient-to-br from-bio-teal to-bio-cyan rounded-xl flex items-center justify-center text-white text-xl shadow-lg shadow-bio-cyan/30"
                animate={{ 
                  boxShadow: [
                    '0 10px 30px rgba(0,229,255,0.25)',
                    '0 10px 40px rgba(0,229,255,0.45)',
                    '0 10px 30px rgba(0,229,255,0.25)',
                  ]
                }}
                transition={{ duration: 3, repeat: Infinity }}
              >
                🌊
              </motion.div>
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-bio-cyan to-bio-teal bg-clip-text text-transparent">
                  Abyssal Twin
                </h1>
                <p className="text-xs text-slate-500 font-hud tracking-widest">
                  MISSION CONTROL — {MISSION_ORIGIN.lat.toFixed(1)}°N {Math.abs(MISSION_ORIGIN.lon).toFixed(1)}°W
                </p>
              </div>
            </motion.div>
            
            {/* Data-source honesty + Z-time + fleet status */}
            <div className="flex items-center gap-3">
              {/* LIVE / SIMULATION / STALE — provenance is never hidden */}
              <motion.div
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-hud tracking-wide ${
                  simulationMode
                    ? 'bg-bio-amber/10 border-bio-amber/40 text-bio-amber'
                    : connected
                    ? 'bg-bio-green/10 border-bio-green/40 text-bio-green'
                    : 'bg-bio-red/10 border-bio-red/40 text-bio-red'
                }`}
                whileHover={{ scale: 1.04 }}
              >
                <motion.span
                  className={`w-2 h-2 rounded-full ${
                    simulationMode
                      ? 'bg-bio-amber'
                      : connected
                      ? 'bg-bio-green'
                      : 'bg-bio-red'
                  }`}
                  animate={
                    simulationMode || connected
                      ? { opacity: [1, 0.4, 1] }
                      : undefined
                  }
                  transition={{ duration: 2, repeat: Infinity }}
                />
                <span>
                  {simulationMode
                    ? 'SIMULATION'
                    : connected
                    ? 'LIVE'
                    : error ?? 'LINK DOWN'}
                </span>
              </motion.div>

              <div className="hidden md:block text-slate-500">
                <UtcClock />
              </div>

              <motion.div
                className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/50 rounded-full border border-slate-700/50"
                whileHover={{ scale: 1.05 }}
              >
                <motion.span
                  className="w-2 h-2 bg-bio-green rounded-full"
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
                <span className="text-sm text-slate-300">
                  {fleetSummary.online}/{fleetSummary.total} Online
                </span>
              </motion.div>

              <AnimatePresence>
                {fleetSummary.partitioned > 0 && (
                  <motion.div
                    className="flex items-center gap-2 px-3 py-1.5 bg-bio-amber/10 border border-bio-amber/40 rounded-full"
                    initial={{ opacity: 0, scale: 0.8, x: -20 }}
                    animate={{ opacity: 1, scale: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                  >
                    <motion.span
                      className="w-2 h-2 bg-bio-amber rounded-full"
                      animate={{ scale: [1, 1.3, 1], opacity: [1, 0.7, 1] }}
                      transition={{ duration: 1, repeat: Infinity }}
                    />
                    <span className="text-sm text-bio-amber font-medium">
                      {fleetSummary.partitioned} partitioned
                    </span>
                  </motion.div>
                )}
                {fleetSummary.anomalyCount > 0 && (
                  <motion.div
                    className="flex items-center gap-2 px-3 py-1.5 bg-bio-red/10 border border-bio-red/40 rounded-full"
                    initial={{ opacity: 0, scale: 0.8, x: -20 }}
                    animate={{ opacity: 1, scale: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                  >
                    <motion.span
                      className="w-2 h-2 bg-bio-red rounded-full"
                      animate={{ scale: [1, 1.3, 1], opacity: [1, 0.7, 1] }}
                      transition={{ duration: 0.8, repeat: Infinity }}
                    />
                    <span className="text-sm text-bio-red font-medium">
                      {fleetSummary.anomalyCount} anomalous
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="text-sm text-slate-400 hidden lg:block">
                Value:{' '}
                <span className="text-slate-200 font-hud tabular-nums font-semibold">
                  ${(fleetSummary.totalValue / 1e6).toFixed(1)}M
                </span>
              </div>
            </div>

            {/* Actions */}
            <motion.button
              onClick={() => setShowReplay(!showReplay)}
              className={`
                px-4 py-2 rounded-lg text-sm font-medium transition-colors
                ${showReplay
                  ? 'bg-bio-cyan/20 text-bio-cyan border border-bio-cyan/40 shadow-lg shadow-bio-cyan/20'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}
              `}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              📼 Mission Replay
            </motion.button>
          </div>
        </div>
      </motion.header>
      
      {/* Alert Banner — stream alerts (dismiss) + backend CUSUM anomalies (ack) */}
      <AnimatePresence>
        {(alerts.length > 0 || backendAnomalies.length > 0) && (
          <motion.div
            className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 mt-4"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
          >
            <AlertContainer className="space-y-2">
              {alerts.slice(0, 3).map((alert) => (
                <AnimatedAlert
                  key={alert.id}
                  id={alert.id}
                  message={alert.message}
                  severity={alert.severity}
                  onDismiss={handleDismissAlert}
                />
              ))}
              {backendAnomalies.slice(0, 3).map((anomaly) => (
                <AnimatedAlert
                  key={`anom-${anomaly.id}`}
                  id={`anom-${anomaly.id}`}
                  message={`${anomaly.vehicleName ?? `AUV-${anomaly.vehicleId}`} — ${anomaly.detectorType} detected ${anomaly.dimension} anomaly (${(anomaly.confidence * 100).toFixed(0)}% conf)`}
                  severity={
                    anomaly.severity >= 0.8
                      ? "emergency"
                      : anomaly.severity >= 0.6
                      ? "critical"
                      : "warning"
                  }
                  onDismiss={() => handleAckAnomaly(anomaly.id)}
                />
              ))}
            </AlertContainer>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Main Content */}
      <main className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-6 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LEFT RAIL — the WHY (physics: fleet, link, CUSUM) */}
          <div className="lg:col-span-3 space-y-6">
            <FleetStats data={fleetSummary} />
            <AcousticLink
              connected={connected}
              simulationMode={simulationMode}
              linkHealth={linkHealth}
            />
            <CusumLive vehicles={vehicles} wasm={wasm} />
            <ExportPanel />
          </div>

          {/* CENTER — the WHERE (geospatial command + live decode) */}
          <div className="lg:col-span-6 space-y-6">
            <AnimatedCard className="overflow-hidden glass-card">
              <div className="p-4 border-b border-bio-cyan/10 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-200">Global Fleet Command</h2>
                  <p className="text-sm text-slate-500">
                    Real-time geospatial tracking · {simulationMode ? "simulated telemetry" : connected ? "live telemetry" : "link degraded"}
                  </p>
                </div>
                <motion.span 
                  className="text-sm text-slate-500 bg-slate-800/50 px-3 py-1 rounded-full font-hud tabular-nums"
                  animate={{ opacity: [0.7, 1, 0.7] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  {assets.length} assets tracked
                </motion.span>
              </div>
              
              <div className="h-[560px]">
                <GlobalFleetMap
                  assets={assets}
                  mapboxToken={import.meta.env.VITE_MAPBOX_TOKEN || ''}
                  activeAlerts={alerts}
                  onAssetSelect={handleAssetSelect}
                />
              </div>
            </AnimatedCard>

            {/* Live decode strip — flush under the map (mt-6 = 24px gap) */}
            <TelemetryStrip asset={selectedAsset ?? null} wasm={wasm} />

            <AnimatePresence>
              {showReplay && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                >
                  <MissionReplay
                    recording={recording}
                    states={recordedStates}
                    vehicles={vehicles}
                    onReplayComplete={() => console.log('Replay complete')}
                    onExport={(format) => console.log('Export:', format)}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* RIGHT RAIL — the WHO (selected asset, fleet list, actions) */}
          <div className="lg:col-span-3 space-y-6">
            {/* Selected Asset Details */}
            <AnimatePresence mode="wait">
              {selectedAsset ? (
                <motion.div
                  key="asset-detail"
                  variants={fadeInUp()}
                  initial="initial"
                  animate="animate"
                  exit={{ opacity: 0, x: 20 }}
                >
                  <AnimatedCard className="p-4" glowColor={selectedAsset.etPnr !== null && selectedAsset.etPnr < 15 ? 'red' : 'blue'}>
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="font-semibold text-slate-200 text-lg">{selectedAsset.name}</h3>
                        <p className="text-sm text-slate-500">{selectedAsset.type.toUpperCase()} • {selectedAsset.region}</p>
                      </div>
                      <motion.button 
                        onClick={() => setSelectedAssetId(null)}
                        className="text-slate-500 hover:text-slate-300 p-1 rounded-lg hover:bg-slate-800/50 transition-colors"
                        whileHover={{ scale: 1.1, rotate: 90 }}
                        whileTap={{ scale: 0.9 }}
                      >
                        ✕
                      </motion.button>
                    </div>
                    
                    {/* Telemetry Gauges — honest: "—" when the wire lacks the field */}
                    {selectedTelemetry && (
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        {selectedTelemetry.battery !== null ? (
                          <TelemetryGauge
                            value={selectedTelemetry.battery}
                            max={100}
                            label="Battery"
                            unit="%"
                            color={
                              selectedTelemetry.battery < 30
                                ? "red"
                                : selectedTelemetry.battery < 50
                                ? "yellow"
                                : "green"
                            }
                            size="sm"
                          />
                        ) : (
                          <div className="flex flex-col items-center justify-center rounded-xl bg-slate-800/40 border border-slate-700/40 p-2">
                            <div className="text-xs text-slate-500">Battery</div>
                            <div className="font-hud text-lg text-slate-600 tabular-nums">—</div>
                          </div>
                        )}
                        {selectedTelemetry.pnr !== null ? (
                          <TelemetryGauge
                            value={selectedTelemetry.pnr}
                            max={60}
                            label="PNR"
                            unit="min"
                            color={
                              selectedTelemetry.pnr < 15
                                ? "red"
                                : selectedTelemetry.pnr < 30
                                ? "yellow"
                                : "green"
                            }
                            size="sm"
                          />
                        ) : (
                          <div className="flex flex-col items-center justify-center rounded-xl bg-slate-800/40 border border-slate-700/40 p-2">
                            <div className="text-xs text-slate-500">PNR</div>
                            <div className="font-hud text-[10px] text-slate-600 text-center leading-tight">
                              N/A
                              <br />
                              battery unmeasured
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    
                    {/* Status Badge */}
                    <div className="flex items-center gap-2 mb-3">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium border ${
                        selectedAsset.status === 'online' ? 'bg-bio-green/10 text-bio-green border-bio-green/30' :
                        selectedAsset.status === 'partitioned' ? 'bg-bio-amber/10 text-bio-amber border-bio-amber/30' :
                        'bg-bio-red/10 text-bio-red border-bio-red/30'
                      }`}>
                        {selectedAsset.status.toUpperCase()}
                      </span>
                      <span className="text-xs text-slate-500 capitalize">
                        {selectedAsset.operationalMode}
                      </span>
                    </div>
                    
                    {/* Telemetry Grid */}
                    {selectedAsset.latestState && (
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="bg-slate-800/50 rounded-lg p-2">
                          <div className="text-xs text-slate-500">Depth</div>
                          <div className="font-hud text-slate-200 tabular-nums">
                            {selectedTelemetry?.depth.toFixed(0) ?? "--"}m
                          </div>
                        </div>
                        <div className="bg-slate-800/50 rounded-lg p-2">
                          <div className="text-xs text-slate-500">Health</div>
                          <div className="font-hud text-slate-200 tabular-nums">
                            {healthPct(selectedAsset.latestState.healthScore) ?? "--"}%
                          </div>
                        </div>
                        <div className="bg-slate-800/50 rounded-lg p-2">
                          <div className="text-xs text-slate-500">Heading</div>
                          <div className="font-hud text-slate-200 tabular-nums">
                            {selectedTelemetry?.heading.toFixed(0) ?? "--"}°
                          </div>
                        </div>
                        <div className="bg-slate-800/50 rounded-lg p-2">
                          <div className="text-xs text-slate-500">Variance</div>
                          <div className="font-hud text-slate-200 tabular-nums">
                            {(selectedAsset.latestState.positionVariance ?? 0).toFixed(2)}m²
                          </div>
                        </div>
                      </div>
                    )}
                  </AnimatedCard>
                </motion.div>
              ) : (
                <motion.div
                  key="no-selection"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-center py-8 text-slate-600 bg-slate-900/30 rounded-xl border border-dashed border-slate-800"
                >
                  <div className="text-4xl mb-2">🎯</div>
                  <p>Select an asset to view details</p>
                </motion.div>
              )}
            </AnimatePresence>
            
            {/* Asset List */}
            <AnimatedCard className="p-4">
              <h3 className="font-semibold text-slate-200 mb-4">Fleet Overview</h3>
              <motion.div 
                className="space-y-2"
                variants={containerVariants}
                initial="initial"
                animate="animate"
              >
                {assets.map((asset, index) => (
                  <AssetCard
                    key={asset.id}
                    asset={asset}
                    isSelected={selectedAssetId === asset.id}
                    onClick={() => handleAssetSelect(asset)}
                    index={index}
                  />
                ))}
              </motion.div>
            </AnimatedCard>
            
            {/* Quick Actions — every control is either functional or honestly disabled */}
            <AnimatedCard className="p-4">
              <h3 className="font-semibold text-slate-200 mb-4">Quick Actions</h3>
              <div className="space-y-2">
                <motion.button
                  onClick={() =>
                    window.open(
                      apiUrl("/api/v1/export/anomalies"),
                      "_blank",
                      "noopener,noreferrer"
                    )
                  }
                  className="w-full px-4 py-3 bg-slate-800/50 hover:bg-slate-700/50 text-slate-200 text-sm rounded-lg transition-colors text-left flex items-center gap-3 border border-slate-700/30 hover:border-bio-cyan/40"
                  whileHover={{ x: 4, scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                >
                  <span>📊</span>
                  <span>Export Anomaly Report (CSV)</span>
                </motion.button>

                <motion.button
                  onClick={() =>
                    window.open(
                      apiUrl("/api/v1/export/state-vectors"),
                      "_blank",
                      "noopener,noreferrer"
                    )
                  }
                  className="w-full px-4 py-3 bg-slate-800/50 hover:bg-slate-700/50 text-slate-200 text-sm rounded-lg transition-colors text-left flex items-center gap-3 border border-slate-700/30 hover:border-bio-cyan/40"
                  whileHover={{ x: 4, scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                >
                  <span>📡</span>
                  <span>Export State Vectors (CSV)</span>
                </motion.button>

                {/* Command uplink is not configured on the backend yet — honest */}
                <motion.button
                  disabled
                  title="Command uplink not configured on the backend"
                  className="w-full px-4 py-3 bg-slate-900/40 text-slate-600 text-sm rounded-lg text-left flex items-center gap-3 border border-slate-800/50 cursor-not-allowed"
                >
                  <span>🚨</span>
                  <span className="flex-1">Initiate Emergency Return</span>
                  <span className="text-[10px] text-slate-700 font-hud">UNAVAILABLE</span>
                </motion.button>

                <motion.button
                  disabled
                  title="Command uplink not configured on the backend"
                  className="w-full px-4 py-3 bg-slate-900/40 text-slate-600 text-sm rounded-lg text-left flex items-center gap-3 border border-slate-800/50 cursor-not-allowed"
                >
                  <span>⚙️</span>
                  <span className="flex-1">Configure Safety Thresholds</span>
                  <span className="text-[10px] text-slate-700 font-hud">LOCAL</span>
                </motion.button>
              </div>
              <p className="mt-3 text-[11px] text-slate-600 leading-snug">
                Remote command &amp; thresholds require the vessel command uplink
                (Phase 4). Reports export live data from the mission database.
              </p>
            </AnimatedCard>
          </div>
        </div>
      </main>

      {/* Footer — Z-time · sync lag · link quality · WASM engine badge */}
      <footer className="sticky bottom-0 z-40 border-t border-bio-cyan/10 bg-abyss-surface/80 backdrop-blur-md">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 h-10 flex items-center justify-between">
          <div className="flex items-center gap-4 text-[11px] font-hud text-slate-500">
            <span className="hidden sm:inline">
              Link: {simulationMode ? "SIM" : connected ? (linkHealth !== null ? `${linkHealth}%` : "—") : "DOWN"}
            </span>
            <span className="hidden md:inline">Sync: 8–20s measured recovery</span>
            <span className="hidden lg:inline">
              PNR: {fleetSummary.total === 0 ? "—" : "computed per-asset"}
            </span>
          </div>
          <div className="flex items-center gap-2 text-[11px] font-hud">
            <span className="text-slate-500">Engine:</span>
            <span className={wasm.ready ? "text-bio-green" : "text-bio-amber"}>
              {wasm.ready ? "WASM ready ●" : "JS fallback ○"}
            </span>
            {wasm.version && (
              <span className="text-slate-600 hidden lg:inline">{wasm.version}</span>
            )}
          </div>
        </div>
      </footer>
    </motion.div>
  );
};

export default App;
