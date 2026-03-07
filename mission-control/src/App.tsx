/**
 * App.tsx - Enhanced Enterprise Mission Control
 * 
 * Integrates GlobalFleetMap, SafetyEngine, and MissionReplay
 * with smooth animations and polished UI components
 * 
 * @version 2.1.0 - UX Enhanced
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { FleetAsset, FleetAlert } from './components/GlobalFleetMap';
import GlobalFleetMap from './components/GlobalFleetMap';
import type { PointOfNoReturn, SafetyEvent } from './services/SafetyEngine';
import { SafetyEngine } from './services/SafetyEngine';
import type { MissionRecording, RecordedState } from './components/MissionReplay';
import MissionReplay from './components/MissionReplay';
import type { Vehicle, StateVector } from './types';
import { DemoDataEngine } from './demo-data';

// New animated components
import { AnimatedCard } from './components/ui/AnimatedCard';
import { TelemetryGauge } from './components/ui/TelemetryGauge';
import { AnimatedAlert, AlertContainer } from './components/ui/AnimatedAlert';
import { AssetCard } from './components/ui/AssetCard';
import { ParticleField } from './components/effects/ParticleField';
import { pageVariants, containerVariants, fadeInUp } from './lib/animations';

// ============================================
// MOCK DATA GENERATORS
// ============================================

const MOCK_VEHICLES: Vehicle[] = [
  { id: 1, name: 'AUV-01 Nautilus', type: 'auv', status: 'online', lastSeen: new Date().toISOString(), latestState: null },
  { id: 2, name: 'AUV-02 Poseidon', type: 'auv', status: 'online', lastSeen: new Date().toISOString(), latestState: null },
  { id: 3, name: 'USV-01 Triton', type: 'usv', status: 'online', lastSeen: new Date().toISOString(), latestState: null },
  { id: 4, name: 'AUV-03 Kraken', type: 'auv', status: 'partitioned', lastSeen: new Date(Date.now() - 120000).toISOString(), latestState: null },
];

const generateFleetAssets = (vehicles: Vehicle[]): FleetAsset[] => {
  const regions: FleetAsset['region'][] = ['atlantic', 'pacific', 'indian', 'arctic'];
  const modes: FleetAsset['operationalMode'][] = ['survey', 'transit', 'hover', 'emergency', 'docked'];
  
  return vehicles.map((v, i) => {
    const state = v.latestState;
    const battery = state?.batteryPct ?? 85 - i * 20;
    const distance = 1000 + i * 500;
    const speed = 2.5;
    
    const returnTime = distance / speed / 60;
    const batteryDrain = (85 - battery) / 100 * 480;
    const remainingTime = (battery / 100) * 480 - batteryDrain;
    const etPnr = remainingTime - returnTime;
    
    return {
      ...v,
      latitude: 25 + i * 10 + Math.random() * 5,
      longitude: -80 + i * 15 + Math.random() * 10,
      region: regions[i % regions.length],
      missionId: `mission-00${i + 1}`,
      operationalMode: battery < 20 ? 'emergency' : modes[i % modes.length],
      etPnr: v.status === 'offline' ? null : etPnr,
      assetValue: v.type === 'auv' ? 2500000 : 800000,
    };
  });
};

const generateAlerts = (assets: FleetAsset[]): FleetAlert[] => {
  const alerts: FleetAlert[] = [];
  
  assets.forEach(asset => {
    if (asset.etPnr !== null && asset.etPnr < 0) {
      alerts.push({
        id: `alert-pnr-${asset.id}`,
        assetId: asset.id,
        type: 'pnr_breach',
        severity: 'emergency',
        message: `${asset.name} has breached Point of No Return!`,
        timestamp: new Date(),
        latitude: asset.latitude,
        longitude: asset.longitude,
      });
    } else if (asset.etPnr !== null && asset.etPnr < 15) {
      alerts.push({
        id: `alert-battery-${asset.id}`,
        assetId: asset.id,
        type: 'battery_low',
        severity: 'critical',
        message: `${asset.name} approaching PNR (${asset.etPnr.toFixed(0)} min)`,
        timestamp: new Date(),
        latitude: asset.latitude,
        longitude: asset.longitude,
      });
    }
  });
  
  return alerts;
};

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
  const [vehicles, setVehicles] = useState<Vehicle[]>(MOCK_VEHICLES);
  const [assets, setAssets] = useState<FleetAsset[]>([]);
  const [alerts, setAlerts] = useState<FleetAlert[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<number | null>(null);
  const [showReplay, setShowReplay] = useState(false);
  const [safetyEngine] = useState(() => new SafetyEngine());
  const [safetyEvents, setSafetyEvents] = useState<SafetyEvent[]>([]);
  
  const recording = useMemo(() => generateMockRecording(), []);
  const recordedStates = useMemo(() => generateMockStates(), []);
  
  // Initialize demo data engine
  useEffect(() => {
    const engine = new DemoDataEngine();
    
    engine.start((fleet) => {
      const updatedVehicles = fleet.vehicles;
      setVehicles(updatedVehicles);
      
      const fleetAssets = generateFleetAssets(updatedVehicles);
      setAssets(fleetAssets);
      
      const activeAlerts = generateAlerts(fleetAssets);
      setAlerts(activeAlerts);
      
      // Run safety calculations
      fleetAssets.forEach(asset => {
        if (asset.latestState) {
          safetyEngine.calculatePointOfNoReturn(
            asset,
            { x: 0, y: 0, z: 0 },
            {
              vehicleId: asset.id,
              vehicleType: asset.type === 'support' ? 'usv' : asset.type,
              massKg: asset.type === 'auv' ? 150 : 80,
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
        }
      });
      
      setSafetyEvents(safetyEngine.getActiveAlerts());
    });
    
    return () => engine.stop();
  }, [safetyEngine]);
  
  const handleAssetSelect = useCallback((asset: FleetAsset) => {
    setSelectedAssetId(asset.id);
  }, []);
  
  const handleDismissAlert = useCallback((id: string) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
  }, []);
  
  const selectedAsset = useMemo(() => 
    assets.find(a => a.id === selectedAssetId),
    [assets, selectedAssetId]
  );
  
  const fleetSummary = useMemo(() => {
    const total = assets.length;
    const online = assets.filter(a => a.status === 'online').length;
    const critical = assets.filter(a => {
      const pnr = safetyEvents.find(e => e.vehicleId === a.id)?.pnrData;
      return pnr && pnr.minutesToPnr < 15;
    }).length;
    const totalValue = assets.reduce((sum, a) => sum + a.assetValue, 0);
    
    return { total, online, critical, totalValue };
  }, [assets, safetyEvents]);
  
  // Get selected asset's telemetry
  const selectedTelemetry = useMemo(() => {
    if (!selectedAsset?.latestState) return null;
    const state = selectedAsset.latestState;
    return {
      battery: state.batteryPct ?? 0,
      depth: Math.abs(state.z),
      health: state.healthScore,
      pnr: selectedAsset.etPnr ?? 0,
    };
  }, [selectedAsset]);
  
  return (
    <motion.div 
      className="min-h-screen bg-slate-950 text-slate-200 relative overflow-hidden"
      variants={pageVariants}
      initial="initial"
      animate="animate"
    >
      {/* Background Effects */}
      <ParticleField particleCount={15} color="rgba(56, 189, 248, 0.1)" />
      
      {/* Header */}
      <motion.header 
        className="bg-slate-900/80 backdrop-blur-md border-b border-slate-800/50 sticky top-0 z-50"
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <motion.div 
              className="flex items-center gap-3"
              whileHover={{ scale: 1.02 }}
            >
              <motion.div 
                className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-400 rounded-xl flex items-center justify-center text-white text-xl shadow-lg shadow-blue-500/30"
                animate={{ 
                  boxShadow: [
                    '0 10px 30px rgba(56,189,248,0.3)',
                    '0 10px 40px rgba(56,189,248,0.5)',
                    '0 10px 30px rgba(56,189,248,0.3)',
                  ]
                }}
                transition={{ duration: 3, repeat: Infinity }}
              >
                🌊
              </motion.div>
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                  Abyssal Twin
                </h1>
                <p className="text-xs text-slate-500">Enterprise Fleet Command v2.1</p>
              </div>
            </motion.div>
            
            {/* Fleet Status Badges */}
            <div className="flex items-center gap-3">
              <motion.div 
                className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/50 rounded-full border border-slate-700/50"
                whileHover={{ scale: 1.05 }}
              >
                <motion.span 
                  className="w-2 h-2 bg-green-500 rounded-full"
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
                <span className="text-sm text-slate-300">
                  {fleetSummary.online}/{fleetSummary.total} Online
                </span>
              </motion.div>
              
              <AnimatePresence>
                {fleetSummary.critical > 0 && (
                  <motion.div 
                    className="flex items-center gap-2 px-3 py-1.5 bg-red-900/30 border border-red-500/30 rounded-full"
                    initial={{ opacity: 0, scale: 0.8, x: -20 }}
                    animate={{ opacity: 1, scale: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                  >
                    <motion.span 
                      className="w-2 h-2 bg-red-500 rounded-full"
                      animate={{ scale: [1, 1.3, 1], opacity: [1, 0.7, 1] }}
                      transition={{ duration: 1, repeat: Infinity }}
                    />
                    <span className="text-sm text-red-300 font-medium">
                      {fleetSummary.critical} Critical
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>
              
              <div className="text-sm text-slate-400 hidden sm:block">
                Value: <span className="text-slate-200 font-mono font-semibold">${(fleetSummary.totalValue / 1e6).toFixed(1)}M</span>
              </div>
            </div>
            
            {/* Actions */}
            <motion.button
              onClick={() => setShowReplay(!showReplay)}
              className={`
                px-4 py-2 rounded-lg text-sm font-medium transition-colors
                ${showReplay 
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30' 
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
      
      {/* Alert Banner */}
      <AnimatePresence>
        {alerts.length > 0 && (
          <motion.div 
            className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-4"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <AlertContainer className="space-y-2">
              {alerts.slice(0, 3).map(alert => (
                <AnimatedAlert
                  key={alert.id}
                  id={alert.id}
                  message={alert.message}
                  severity={alert.severity}
                  onDismiss={handleDismissAlert}
                />
              ))}
            </AlertContainer>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Map Section */}
          <div className="lg:col-span-2 space-y-6">
            <AnimatedCard className="overflow-hidden">
              <div className="p-4 border-b border-slate-800/50 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-200">Global Fleet Command</h2>
                  <p className="text-sm text-slate-500">Real-time geospatial tracking</p>
                </div>
                <motion.span 
                  className="text-sm text-slate-500 bg-slate-800/50 px-3 py-1 rounded-full"
                  animate={{ opacity: [0.7, 1, 0.7] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  {assets.length} assets tracked
                </motion.span>
              </div>
              
              <div className="h-[500px]">
                <GlobalFleetMap
                  assets={assets}
                  mapboxToken={import.meta.env.VITE_MAPBOX_TOKEN || ''}
                  activeAlerts={alerts}
                  onAssetSelect={handleAssetSelect}
                />
              </div>
            </AnimatedCard>
            
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
          
          {/* Sidebar */}
          <div className="space-y-6">
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
                    
                    {/* Telemetry Gauges */}
                    {selectedTelemetry && (
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <TelemetryGauge
                          value={selectedTelemetry.battery}
                          max={100}
                          label="Battery"
                          unit="%"
                          color={selectedTelemetry.battery < 30 ? 'red' : selectedTelemetry.battery < 50 ? 'yellow' : 'green'}
                          size="sm"
                        />
                        <TelemetryGauge
                          value={selectedTelemetry.pnr > 0 ? selectedTelemetry.pnr : 0}
                          max={60}
                          label="PNR"
                          unit="min"
                          color={selectedTelemetry.pnr < 15 ? 'red' : selectedTelemetry.pnr < 30 ? 'yellow' : 'green'}
                          size="sm"
                        />
                      </div>
                    )}
                    
                    {/* Status Badge */}
                    <div className="flex items-center gap-2 mb-3">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium border ${
                        selectedAsset.status === 'online' ? 'bg-green-500/10 text-green-400 border-green-500/30' :
                        selectedAsset.status === 'partitioned' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30' :
                        'bg-red-500/10 text-red-400 border-red-500/30'
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
                          <div className="font-mono text-slate-200">{Math.abs(selectedAsset.latestState.z).toFixed(0)}m</div>
                        </div>
                        <div className="bg-slate-800/50 rounded-lg p-2">
                          <div className="text-xs text-slate-500">Health</div>
                          <div className="font-mono text-slate-200">{selectedAsset.latestState.healthScore.toFixed(0)}%</div>
                        </div>
                        <div className="bg-slate-800/50 rounded-lg p-2">
                          <div className="text-xs text-slate-500">Heading</div>
                          <div className="font-mono text-slate-200">{selectedAsset.latestState.heading?.toFixed(0) ?? '--'}°</div>
                        </div>
                        <div className="bg-slate-800/50 rounded-lg p-2">
                          <div className="text-xs text-slate-500">Value</div>
                          <div className="font-mono text-slate-200">${(selectedAsset.assetValue / 1e6).toFixed(1)}M</div>
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
            
            {/* Quick Actions */}
            <AnimatedCard className="p-4">
              <h3 className="font-semibold text-slate-200 mb-4">Quick Actions</h3>
              <div className="space-y-2">
                {[
                  { icon: '🚨', label: 'Initiate Emergency Return', color: 'red' },
                  { icon: '📡', label: 'Send Command to Fleet', color: 'blue' },
                  { icon: '📊', label: 'Generate Mission Report', color: 'green' },
                  { icon: '⚙️', label: 'Configure Safety Thresholds', color: 'slate' },
                ].map((action, i) => (
                  <motion.button
                    key={action.label}
                    className="w-full px-4 py-3 bg-slate-800/50 hover:bg-slate-700/50 text-slate-200 text-sm rounded-lg transition-colors text-left flex items-center gap-3 border border-slate-700/30 hover:border-slate-600/50"
                    whileHover={{ x: 4, scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                  >
                    <span>{action.icon}</span>
                    <span>{action.label}</span>
                  </motion.button>
                ))}
              </div>
            </AnimatedCard>
          </div>
        </div>
      </main>
    </motion.div>
  );
};

export default App;
