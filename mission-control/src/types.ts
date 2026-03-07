/**
 * Abyssal Twin — Type Definitions
 */

export interface FleetStatus {
  vehicles: Vehicle[];
  updatedAt: string;
}

export interface Vehicle {
  id: number;
  name: string;
  type: 'auv' | 'usv' | 'support';
  status: 'online' | 'partitioned' | 'offline';
  lastSeen: string | null;
  latestState: StateVector | null;
}

export interface StateVector {
  auvId: number;
  timestamp: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  positionVariance: number;
  anomalyDetected: boolean;
  healthScore: number;
  // Live telemetry fields
  depthM?: number;      // Depth in metres, positive (e.g. 3042.5)
  batteryPct?: number;  // 0–100 %
  pressureBar?: number; // ~300 bar at abyssal depth (1 bar ≈ 10 m seawater)
  heading?: number;     // 0–360 °, compass bearing
}

export interface ResearchMetrics {
  rq1: {
    wireFormatBytes: number;
    baselineBytes: number;
    compressionRatio: string;
    target: string;
    status: string;
  };
  rq2: {
    totalStateVectors: number;
    vehiclesTracked: number;
    averagePositionVariance: number | null;
  };
  rq3: {
    totalAnomalies: number;
    averageConfidence: number | null;
    averageSeverity: number | null;
    acknowledgedCount: number;
    averageSyncLagSeconds: number | null;
  };
}

export interface SystemEvent {
  id: string;
  timestamp: Date;
  type: 'sync' | 'anomaly' | 'mission' | 'system';
  message: string;
  severity?: 'info' | 'warning' | 'critical';
}

export interface DashboardState {
  fleetStatus: FleetStatus | null;
  metrics: ResearchMetrics | null;
  events: SystemEvent[];
  connectionStatus: 'connected' | 'disconnected' | 'connecting';
  isDemoMode: boolean;
  selectedTimeRange: string;
  autoRefresh: boolean;
  theme: 'dark' | 'light';
}
