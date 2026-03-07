/**
 * App.tsx
 * 
 * Enterprise Mission Control Application
 * 
 * Integrates GlobalFleetMap, SafetyEngine, and MissionReplay
 * with the existing Abyssal Twin infrastructure.
 * 
 * @version 2.0.0
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { FleetAsset, FleetAlert } from './components/GlobalFleetMap';
import GlobalFleetMap from './components/GlobalFleetMap';
import type { PointOfNoReturn, SafetyEvent } from './services/SafetyEngine';
import { SafetyEngine } from './services/SafetyEngine';
import type { MissionRecording, RecordedState } from './components/MissionReplay';
import MissionReplay from './components/MissionReplay';
import type { Vehicle, StateVector } from './types';
import { DemoDataEngine } from './demo-data';

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
    
    // Simple PNR estimation
    const returnTime = distance / speed / 60; // minutes
    const batteryDrain = (85 - battery) / 100 * 480; // minutes elapsed (8hr mission)
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
      timestamp: progress * 60000, // 1 minute mission
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
      }] : hasAnomaly ? [] : [],
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
  
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-cyan-400 rounded-lg flex items-center justify-center text-white text-lg">
                🌊
              </div>
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                  Abyssal Twin
                </h1>
                <p className="text-xs text-slate-500">Enterprise Fleet Command v2.0</p>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 rounded-full">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <span className="text-sm text-slate-300">
                  {fleetSummary.online}/{fleetSummary.total} Online
                </span>
              </div>
              
              {fleetSummary.critical > 0 && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-red-900/50 border border-red-500/30 rounded-full">
                  <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                  <span className="text-sm text-red-300">{fleetSummary.critical} Critical</span>
                </div>
              )}
              
              <div className="text-sm text-slate-400">
                Value: <span className="text-slate-200 font-mono">${(fleetSummary.totalValue / 1e6).toFixed(1)}M</span>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowReplay(!showReplay)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  showReplay ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                📼 Mission Replay
              </button>
            </div>
          </div>
        </div>
      </header>
      
      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Map Section */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
              <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-200">Global Fleet Command</h2>
                <span className="text-sm text-slate-500">{assets.length} assets tracked</span>
              </div>
              
              <div className="h-[500px]">
                <GlobalFleetMap
                  assets={assets}
                  mapboxToken={import.meta.env.VITE_MAPBOX_TOKEN || ''}
                  activeAlerts={alerts}
                  onAssetSelect={handleAssetSelect}
                />
              </div>
            </div>
            
            {showReplay && (
              <MissionReplay
                recording={recording}
                states={recordedStates}
                vehicles={vehicles}
                onReplayComplete={() => console.log('Replay complete')}
                onExport={(format) => console.log('Export:', format)}
              />
            )}
          </div>
          
          {/* Sidebar */}
          <div className="space-y-6">
            {selectedAsset && (
              <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-slate-200">{selectedAsset.name}</h3>
                  <button onClick={() => setSelectedAssetId(null)} className="text-slate-500 hover:text-slate-300">✕</button>
                </div>
                
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-1 rounded text-xs font-medium
                      ${selectedAsset.status === 'online' ? 'bg-green-500/20 text-green-400' : ''}
                      ${selectedAsset.status === 'partitioned' ? 'bg-yellow-500/20 text-yellow-400' : ''}
                      ${selectedAsset.status === 'offline' ? 'bg-red-500/20 text-red-400' : ''}
                    `}>
                      {selectedAsset.status.toUpperCase()}
                    </span>
                    <span className="text-xs text-slate-500">{selectedAsset.operationalMode}</span>
                  </div>
                  
                  {selectedAsset.latestState && (
                    <div className="grid grid-cols-2 gap-3">
                      <TelemetryItem label="Depth" value={`${Math.abs(selectedAsset.latestState.z).toFixed(0)}m`} />
                      <TelemetryItem 
                        label="Battery" 
                        value={`${selectedAsset.latestState.batteryPct?.toFixed(0) ?? '--'}%`}
                        alert={selectedAsset.latestState.batteryPct !== undefined && selectedAsset.latestState.batteryPct < 30}
                      />
                      <TelemetryItem label="Health" value={`${selectedAsset.latestState.healthScore.toFixed(0)}%`} />
                      <TelemetryItem label="Heading" value={`${selectedAsset.latestState.heading?.toFixed(0) ?? '--'}°`} />
                    </div>
                  )}
                  
                  {selectedAsset.etPnr !== null && (
                    <div className={`p-3 rounded-lg border ${
                      selectedAsset.etPnr > 0 ? 'bg-green-900/20 border-green-500/30' : 'bg-red-900/20 border-red-500/30'
                    }`}>
                      <div className="text-xs text-slate-400 mb-1">Point of No Return</div>
                      <div className={`font-semibold ${selectedAsset.etPnr > 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {selectedAsset.etPnr > 0 ? `${selectedAsset.etPnr.toFixed(0)} min to PNR` : 'PNR BREACHED'}
                      </div>
                    </div>
                  )}
                  
                  <div className="pt-3 border-t border-slate-800">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">Asset Value</span>
                      <span className="text-slate-200 font-mono">${(selectedAsset.assetValue / 1e6).toFixed(2)}M</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {/* Active Alerts */}
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
              <h3 className="font-semibold text-slate-200 mb-4">Active Alerts</h3>
              
              {safetyEvents.length === 0 ? (
                <div className="text-center py-8 text-slate-500">No active alerts</div>
              ) : (
                <div className="space-y-2">
                  {safetyEvents.slice(0, 5).map(event => (
                    <div 
                      key={event.id}
                      className={`p-3 rounded-lg border cursor-pointer transition-colors hover:bg-slate-800
                        ${event.level === 'EMERGENCY_ABORT' ? 'bg-red-900/20 border-red-500/30' : ''}
                        ${event.level === 'CRITICAL' ? 'bg-orange-900/20 border-orange-500/30' : ''}
                        ${event.level === 'WARNING' ? 'bg-yellow-900/20 border-yellow-500/30' : ''}
                      `}
                      onClick={() => setSelectedAssetId(event.vehicleId)}
                    >
                      <div className="flex items-center gap-2">
                        <span>{event.level === 'EMERGENCY_ABORT' ? '🚨' : event.level === 'CRITICAL' ? '⚠️' : '⚡'}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-slate-200 truncate">{event.message}</div>
                          <div className="text-xs text-slate-500">Asset {event.vehicleId}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            {/* Quick Actions */}
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
              <h3 className="font-semibold text-slate-200 mb-4">Quick Actions</h3>
              <div className="space-y-2">
                <button className="w-full px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm rounded-lg transition-colors text-left">
                  🚨 Initiate Emergency Return
                </button>
                <button className="w-full px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm rounded-lg transition-colors text-left">
                  📡 Send Command to Fleet
                </button>
                <button className="w-full px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm rounded-lg transition-colors text-left">
                  📊 Generate Mission Report
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

interface TelemetryItemProps {
  label: string;
  value: string;
  alert?: boolean;
}

const TelemetryItem: React.FC<TelemetryItemProps> = ({ label, value, alert }) => (
  <div className="bg-slate-800 rounded p-2">
    <div className="text-xs text-slate-500">{label}</div>
    <div className={`text-sm font-mono font-semibold ${alert ? 'text-red-400' : 'text-slate-200'}`}>
      {value}
    </div>
  </div>
);

export default App;
