/**
 * Abyssal Twin — Demo Data Engine
 * Generates realistic AUV mission data for dashboard demonstration
 */

import type { FleetStatus, Vehicle, StateVector, ResearchMetrics, SystemEvent } from './types';

export const DEMO_CONFIG = {
  VEHICLE_COUNT: 4,
  UPDATE_INTERVAL_MS: 2000,
  ANOMALY_CHANCE: 0.05,
  EVENT_CHANCE: 0.15,
  HISTORY_LENGTH: 100,
};

export interface TimeSeriesPoint {
  timestamp: number;
  value: number;
  vehicleId?: number;
}

export interface DemoDataStore {
  fleetHistory: FleetStatus[];
  compressionHistory: TimeSeriesPoint[];
  anomalyHistory: TimeSeriesPoint[];
  events: SystemEvent[];
}

// Mission profiles for realistic AUV behavior
const MISSION_PROFILES = [
  { id: 1, name: 'AUV-01 Nautilus', type: 'auv' as const, baseX: 100, baseY: 100, depth: 100 },
  { id: 2, name: 'AUV-02 Poseidon', type: 'auv' as const, baseX: 300, baseY: 200, depth: 150 },
  { id: 3, name: 'USV-01 Triton', type: 'usv' as const, baseX: 500, baseY: 300, depth: 0 },
  { id: 4, name: 'AUV-03 Kraken', type: 'auv' as const, baseX: 700, baseY: 400, depth: 200 },
];

/**
 * Demo Data Engine - Generates realistic AUV mission data
 */
export class DemoDataEngine {
  private vehicles: Map<number, any> = new Map();
  private store: DemoDataStore;
  private updateTimer: number | null = null;
  private onUpdate: ((fleet: FleetStatus, metrics: ResearchMetrics, event?: SystemEvent) => void) | null = null;

  constructor() {
    this.store = {
      fleetHistory: [],
      compressionHistory: [],
      anomalyHistory: [],
      events: [],
    };

    // Initialize vehicle states
    MISSION_PROFILES.forEach(profile => {
      this.vehicles.set(profile.id, {
        ...profile,
        x: profile.baseX,
        y: profile.baseY,
        z: -profile.depth,
        vx: 0,
        vy: 0,
        yaw: 0,
        healthScore: 98,
        missionTime: 0,
        hasAnomaly: false,
        anomalyType: null,
        anomalySeverity: null,
        anomalyStartTime: 0,
      });
    });
  }

  start(callback: (fleet: FleetStatus, metrics: ResearchMetrics, event?: SystemEvent) => void) {
    this.onUpdate = callback;
    this.generateUpdate();
    
    this.updateTimer = window.setInterval(() => {
      this.generateUpdate();
    }, DEMO_CONFIG.UPDATE_INTERVAL_MS);
  }

  stop() {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }
  }

  private generateUpdate() {
    const now = new Date().toISOString();
    const vehicles: Vehicle[] = [];
    let totalAnomalies = 0;

    this.vehicles.forEach((state, id) => {
      // Update mission time
      state.missionTime += 2;

      // Simulate movement (lawnmower pattern)
      const legDuration = 60; // seconds per leg
      const leg = Math.floor(state.missionTime / legDuration) % 4;
      const progress = (state.missionTime % legDuration) / legDuration;
      
      switch (leg) {
        case 0: // East
          state.vx = 2.5; state.vy = 0;
          state.x = state.baseX + progress * 200;
          state.y = state.baseY;
          break;
        case 1: // North
          state.vx = 0; state.vy = 2.5;
          state.x = state.baseX + 200;
          state.y = state.baseY + progress * 200;
          break;
        case 2: // West
          state.vx = -2.5; state.vy = 0;
          state.x = state.baseX + 200 - progress * 200;
          state.y = state.baseY + 200;
          break;
        case 3: // South
          state.vx = 0; state.vy = -2.5;
          state.x = state.baseX;
          state.y = state.baseY + 200 - progress * 200;
          break;
      }

      // Add noise
      state.x += (Math.random() - 0.5) * 2;
      state.y += (Math.random() - 0.5) * 2;
      state.z = -state.depth + Math.sin(state.missionTime * 0.1) * 2;

      // Calculate yaw
      state.yaw = Math.atan2(state.vy, state.vx);

      // Position variance based on depth
      const positionVariance = 0.5 + (Math.abs(state.z) / 200);

      // Health fluctuation
      state.healthScore = Math.max(85, Math.min(100, state.healthScore + (Math.random() - 0.5)));

      // Check/clear anomalies
      if (state.hasAnomaly) {
        if (Date.now() - state.anomalyStartTime > 30000) {
          state.hasAnomaly = false;
          state.anomalyType = null;
        } else {
          totalAnomalies++;
        }
      } else if (Math.random() < DEMO_CONFIG.ANOMALY_CHANCE) {
        const anomalies = [
          { type: 'High Position Variance', severity: 'warning' as const },
          { type: 'Communication Delay', severity: 'warning' as const },
          { type: 'Depth Exceeded', severity: 'critical' as const },
        ];
        const anomaly = anomalies[Math.floor(Math.random() * anomalies.length)];
        state.hasAnomaly = true;
        state.anomalyType = anomaly.type;
        state.anomalySeverity = anomaly.severity;
        state.anomalyStartTime = Date.now();
        totalAnomalies++;

        // Emit anomaly event
        if (this.onUpdate) {
          const event: SystemEvent = {
            id: `evt-${Date.now()}`,
            timestamp: new Date(),
            type: 'anomaly',
            message: `${anomaly.type} detected on ${state.name}`,
            severity: anomaly.severity,
          };
          this.store.events.unshift(event);
          if (this.store.events.length > 50) this.store.events.pop();
          
          const metrics = this.calculateMetrics(vehicles, totalAnomalies);
          this.onUpdate({ vehicles, updatedAt: now }, metrics, event);
        }
      }

      vehicles.push({
        id,
        name: state.name,
        type: state.type,
        status: state.healthScore > 90 ? 'online' : state.healthScore > 70 ? 'partitioned' : 'offline',
        lastSeen: now,
        latestState: {
          auvId: id,
          timestamp: Date.now(),
          x: Math.round(state.x * 100) / 100,
          y: Math.round(state.y * 100) / 100,
          z: Math.round(state.z * 100) / 100,
          yaw: Math.round(state.yaw * 100) / 100,
          positionVariance: Math.round(positionVariance * 100) / 100,
          anomalyDetected: state.hasAnomaly,
          healthScore: Math.round(state.healthScore),
        },
      });
    });

    const fleetStatus: FleetStatus = { vehicles, updatedAt: now };
    this.store.fleetHistory.push(fleetStatus);
    if (this.store.fleetHistory.length > DEMO_CONFIG.HISTORY_LENGTH) {
      this.store.fleetHistory.shift();
    }

    // Generate random event
    let event: SystemEvent | undefined;
    if (Math.random() < DEMO_CONFIG.EVENT_CHANCE) {
      const events = [
        { msg: 'State vector synchronized', type: 'sync' as const },
        { msg: 'Mission waypoint reached', type: 'mission' as const },
        { msg: 'Sensor calibration complete', type: 'system' as const },
        { msg: 'Data compression optimized', type: 'system' as const },
      ];
      const evt = events[Math.floor(Math.random() * events.length)];
      const v = vehicles[Math.floor(Math.random() * vehicles.length)];
      event = {
        id: `evt-${Date.now()}`,
        timestamp: new Date(),
        type: evt.type,
        message: `${evt.msg} — ${v.name}`,
        severity: 'info',
      };
      this.store.events.unshift(event);
      if (this.store.events.length > 50) this.store.events.pop();
    }

    // Update histories
    this.store.compressionHistory.push({
      timestamp: Date.now(),
      value: 12.4 + (Math.random() - 0.5) * 0.5,
    });
    if (this.store.compressionHistory.length > DEMO_CONFIG.HISTORY_LENGTH) {
      this.store.compressionHistory.shift();
    }

    this.store.anomalyHistory.push({
      timestamp: Date.now(),
      value: totalAnomalies,
    });
    if (this.store.anomalyHistory.length > DEMO_CONFIG.HISTORY_LENGTH) {
      this.store.anomalyHistory.shift();
    }

    const metrics = this.calculateMetrics(vehicles, totalAnomalies);

    if (this.onUpdate) {
      this.onUpdate(fleetStatus, metrics, event);
    }
  }

  private calculateMetrics(vehicles: Vehicle[], totalAnomalies: number): ResearchMetrics {
    const avgVariance = vehicles.reduce((sum, v) => sum + (v.latestState?.positionVariance || 0), 0) / vehicles.length;

    return {
      rq1: {
        wireFormatBytes: 24,
        baselineBytes: 1200,
        compressionRatio: '12.4x',
        target: '>10x',
        status: 'PASS',
      },
      rq2: {
        totalStateVectors: vehicles.length * 50,
        vehiclesTracked: vehicles.length,
        averagePositionVariance: Math.round(avgVariance * 100) / 100,
      },
      rq3: {
        totalAnomalies,
        averageConfidence: 0.89,
        averageSeverity: 2.3,
        acknowledgedCount: Math.floor(totalAnomalies * 0.8),
        averageSyncLagSeconds: 0.45,
      },
    };
  }

  getStore(): DemoDataStore {
    return this.store;
  }

  isRunning(): boolean {
    return this.updateTimer !== null;
  }
}

/**
 * Demo WebSocket - Simulates real-time WebSocket with demo data
 */
export class DemoWebSocket {
  private engine: DemoDataEngine;
  private listeners: Map<string, ((data: any) => void)[]> = new Map();
  public readyState: number = 0;

  constructor(url: string) {
    this.engine = new DemoDataEngine();
    
    setTimeout(() => {
      this.readyState = 1;
      this.emit('open', {});
      
      this.engine.start((fleet, metrics, event) => {
        fleet.vehicles.forEach(v => {
          if (v.latestState) {
            this.emit('message', {
              data: JSON.stringify({
                type: v.latestState.anomalyDetected ? 'anomaly' : 'state_update',
                auvId: v.id,
                state: v.latestState,
              })
            });
          }
        });
      });
    }, 500);
  }

  on(event: string, callback: (data: any) => void) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
  }

  private emit(event: string, data: any) {
    const callbacks = this.listeners.get(event) || [];
    callbacks.forEach(cb => {
      try {
        cb(data);
      } catch (e) {
        console.error('DemoWebSocket error:', e);
      }
    });
  }

  send(data: string) {
    this.emit('message', { data: `Echo: ${data}` });
  }

  close() {
    this.readyState = 3;
    this.engine.stop();
    this.emit('close', {});
  }
}

// Demo mode utilities
export function shouldUseDemoMode(): boolean {
  const isGitHubPages = window.location.hostname.includes('github.io');
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const forceDemo = localStorage.getItem('demo_mode') === 'true';
  return isGitHubPages || forceDemo || (isLocalhost && !localStorage.getItem('use_real_api'));
}

export function enableDemoMode() {
  localStorage.setItem('demo_mode', 'true');
}

export function disableDemoMode() {
  localStorage.removeItem('demo_mode');
  localStorage.setItem('use_real_api', 'true');
}
