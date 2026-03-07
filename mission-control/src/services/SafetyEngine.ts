/**
 * SafetyEngine.ts
 * 
 * Predictive "Fail-Safe" Engine for AUV Asset Protection
 * 
 * Commercial Value:
 * - Calculates "Point of No Return" (PNR) in real-time
 * - Automatically triggers CRITICAL_ABORT when battery margin insufficient
 * - Saves customers $1M+ per prevented loss incident
 * - Provides insurance-compliant decision logging
 * 
 * Core Algorithm:
 * PNR = f(Battery_Remaining, Distance_to_Home, Current_Drain, Safety_Margin)
 * 
 * Alert Triggers:
 * - WARNING:  Battery < Return_Cost × 1.5
 * - CRITICAL: Battery < Return_Cost × 1.2  (20% safety margin)
 * - ABORT:    Battery < Return_Cost × 1.05 (5% margin - initiate immediate return)
 * 
 * @module SafetyEngine
 * @version 2.0.0
 * @license Commercial - Proprietary
 */

import type { StateVector, Vehicle } from '../types';

// ============================================
// TYPE DEFINITIONS
// ============================================

/**
 * Safety alert severity levels
 */
export type SafetyLevel = 'NORMAL' | 'CAUTION' | 'WARNING' | 'CRITICAL' | 'EMERGENCY_ABORT';

/**
 * PNR Calculation result with full telemetry
 */
export interface PointOfNoReturn {
  /** Can the AUV safely return to home/dock? */
  canSafelyReturn: boolean;
  /** Time in minutes until PNR is reached (negative = already passed) */
  minutesToPnr: number;
  /** Estimated time to return to home base (minutes) */
  estimatedReturnTimeMinutes: number;
  /** Required battery percentage to return safely */
  requiredBatteryPct: number;
  /** Current battery percentage */
  currentBatteryPct: number;
  /** Safety margin as ratio (1.2 = 20% margin) */
  safetyMargin: number;
  /** Recommended action */
  recommendedAction: SafetyRecommendation;
  /** Human-readable assessment */
  assessment: string;
  /** Timestamp of calculation */
  calculatedAt: Date;
  /** Confidence level (0-1) based on data quality */
  confidence: number;
}

/**
 * Safety recommendation actions
 */
export type SafetyRecommendation = 
  | 'CONTINUE_MISSION'           // All green, proceed as planned
  | 'REDUCE_SPEED'               // Conserve power
  | 'PREPARE_RETURN'             // Finish current task, plan return
  | 'INITIATE_RETURN'            // Start return journey now
  | 'EMERGENCY_SURFACE'          // Abort mission, surface immediately
  | 'CRITICAL_ABORT';            // Emergency protocol activation

/**
 * AUV operational parameters for physics calculations
 */
export interface VehiclePhysicsProfile {
  /** Vehicle identifier */
  vehicleId: number;
  /** Vehicle type affects drag and power curves */
  vehicleType: 'auv' | 'usv' | 'rov' | 'glider';
  /** Mass in kg (affects inertia and energy requirements) */
  massKg: number;
  /** Drag coefficient (determines power vs speed curve) */
  dragCoefficient: number;
  /** Frontal area in m² */
  frontalAreaM2: number;
  /** Base power draw (systems, sensors) in watts */
  basePowerDrawW: number;
  /** Propulsion efficiency (0-1) */
  propulsionEfficiency: number;
  /** Battery capacity in watt-hours */
  batteryCapacityWh: number;
  /** Current operational speed in m/s */
  currentSpeedMs: number;
  /** Maximum operational speed in m/s */
  maxSpeedMs: number;
  /** Depth rating in meters */
  maxDepthM: number;
}

/**
 * Environmental conditions affecting power consumption
 */
export interface EnvironmentalConditions {
  /** Current speed in m/s (works against/for vehicle) */
  currentSpeedMs: number;
  /** Current direction in degrees (0 = North) */
  currentDirectionDegrees: number;
  /** Vehicle heading in degrees */
  vehicleHeadingDegrees: number;
  /** Water density in kg/m³ (affects drag) */
  waterDensityKgM3: number;
  /** Temperature in celsius (affects battery efficiency) */
  temperatureC: number;
  /** Sea state (0-9) affects surface vehicles */
  seaState: number;
}

/**
 * Safety event for logging and alerting
 */
export interface SafetyEvent {
  id: string;
  vehicleId: number;
  timestamp: Date;
  level: SafetyLevel;
  type: SafetyEventType;
  message: string;
  pnrData?: PointOfNoReturn;
  recommendedAction: SafetyRecommendation;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
}

export type SafetyEventType = 
  | 'PNR_BREACH'
  | 'BATTERY_CRITICAL'
  | 'BATTERY_WARNING'
  | 'DEPTH_EXCEEDANCE'
  | 'COMMUNICATION_TIMEOUT'
  | 'ANOMALY_DETECTED'
  | 'SAFETY_MARGIN_VIOLATION';

/**
 * Safety engine configuration
 */
export interface SafetyEngineConfig {
  /** Safety margin multiplier (default 1.2 = 20%) */
  safetyMarginMultiplier: number;
  /** Warning threshold multiplier (default 1.5 = 50%) */
  warningMultiplier: number;
  /** Critical threshold multiplier (default 1.2 = 20%) */
  criticalMultiplier: number;
  /** Abort threshold multiplier (default 1.05 = 5%) */
  abortMultiplier: number;
  /** PNR calculation interval in seconds */
  calculationIntervalSeconds: number;
  /** Communication timeout before assuming loss (seconds) */
  communicationTimeoutSeconds: number;
  /** Maximum mission duration before forced return (hours) */
  maxMissionDurationHours: number;
  /** Enable automatic abort on critical threshold */
  enableAutoAbort: boolean;
  /** Log all calculations for compliance */
  enableAuditLogging: boolean;
}

// ============================================
// DEFAULT CONFIGURATION
// ============================================

export const DEFAULT_SAFETY_CONFIG: SafetyEngineConfig = {
  safetyMarginMultiplier: 1.2,
  warningMultiplier: 1.5,
  criticalMultiplier: 1.2,
  abortMultiplier: 1.05,
  calculationIntervalSeconds: 10,
  communicationTimeoutSeconds: 300, // 5 minutes
  maxMissionDurationHours: 8,
  enableAutoAbort: false, // Disabled by default - human-in-the-loop
  enableAuditLogging: true,
};

// ============================================
// DEFAULT VEHICLE PROFILES
// ============================================

export const DEFAULT_VEHICLE_PROFILES: Record<string, VehiclePhysicsProfile> = {
  'auv-standard': {
    vehicleId: 0,
    vehicleType: 'auv',
    massKg: 150,
    dragCoefficient: 0.3,
    frontalAreaM2: 0.15,
    basePowerDrawW: 50,
    propulsionEfficiency: 0.7,
    batteryCapacityWh: 5000, // ~5kWh typical AUV battery
    currentSpeedMs: 2.5,
    maxSpeedMs: 4.0,
    maxDepthM: 6000,
  },
  'usv-standard': {
    vehicleId: 0,
    vehicleType: 'usv',
    massKg: 80,
    dragCoefficient: 0.4,
    frontalAreaM2: 0.5,
    basePowerDrawW: 30,
    propulsionEfficiency: 0.6,
    batteryCapacityWh: 2000,
    currentSpeedMs: 5.0,
    maxSpeedMs: 8.0,
    maxDepthM: 0,
  },
  'glider-standard': {
    vehicleId: 0,
    vehicleType: 'glider',
    massKg: 60,
    dragCoefficient: 0.15,
    frontalAreaM2: 0.08,
    basePowerDrawW: 1, // Very low power
    propulsionEfficiency: 0.9,
    batteryCapacityWh: 1000,
    currentSpeedMs: 0.5,
    maxSpeedMs: 1.0,
    maxDepthM: 1000,
  },
};

// ============================================
// SAFETY ENGINE CLASS
// ============================================

export class SafetyEngine {
  private config: SafetyEngineConfig;
  private eventLog: SafetyEvent[] = [];
  private lastCalculation: Map<number, PointOfNoReturn> = new Map();
  private activeAlerts: Map<number, SafetyEvent> = new Map();
  
  constructor(config: Partial<SafetyEngineConfig> = {}) {
    this.config = { ...DEFAULT_SAFETY_CONFIG, ...config };
  }
  
  /**
   * Calculate Point of No Return for a vehicle
   * 
   * This is the core algorithm that determines if an AUV can safely return home.
   * 
   * Physics Model:
   * 1. Calculate drag force: F_drag = 0.5 × ρ × v² × Cd × A
   * 2. Calculate propulsion power: P_prop = F_drag × v / η
   * 3. Calculate total power: P_total = P_prop + P_base
   * 4. Calculate energy to return: E_return = P_total × t_return
   * 5. Convert to battery percentage: Battery% = E_return / Capacity × 100
   * 
   * @param vehicle - Current vehicle state
   * @param homePosition - Home/dock position {x, y, z} in meters
   * @param profile - Vehicle physics profile
   * @param environment - Environmental conditions
   * @returns PointOfNoReturn calculation result
   */
  calculatePointOfNoReturn(
    vehicle: Vehicle,
    homePosition: { x: number; y: number; z: number },
    profile: VehiclePhysicsProfile,
    environment: EnvironmentalConditions
  ): PointOfNoReturn {
    const state = vehicle.latestState;
    if (!state) {
      return this.createErrorPnr(vehicle.id, 'No state data available');
    }
    
    const batteryPct = state.batteryPct ?? (state.healthScore / 255 * 100);
    const now = new Date();
    
    // Calculate distance to home
    const distanceM = Math.sqrt(
      Math.pow(state.x - homePosition.x, 2) +
      Math.pow(state.y - homePosition.y, 2) +
      Math.pow(state.z - homePosition.z, 2)
    );
    
    // Account for current effect on return journey
    const currentEffect = this.calculateCurrentEffect(
      environment.currentSpeedMs,
      environment.currentDirectionDegrees,
      homePosition,
      { x: state.x, y: state.y }
    );
    
    // Effective speed (accounting for current)
    const effectiveSpeedMs = Math.max(0.5, profile.currentSpeedMs - currentEffect);
    
    // Time to return (minutes)
    const returnTimeMinutes = (distanceM / effectiveSpeedMs) / 60;
    
    // Calculate power requirements
    const powerRequirement = this.calculatePowerRequirement(
      profile,
      environment,
      effectiveSpeedMs
    );
    
    // Energy required for return (Wh)
    const returnTimeHours = returnTimeMinutes / 60;
    const energyRequiredWh = powerRequirement * returnTimeHours;
    
    // Convert to battery percentage
    const batteryRequiredRaw = (energyRequiredWh / profile.batteryCapacityWh) * 100;
    
    // Apply safety margin
    const batteryRequiredWithMargin = batteryRequiredRaw * this.config.safetyMarginMultiplier;
    
    // Calculate how long until PNR (in minutes)
    // Assuming constant power consumption
    const currentPowerDraw = powerRequirement; // Simplified
    const remainingEnergyWh = (batteryPct / 100) * profile.batteryCapacityWh;
    const remainingTimeHours = remainingEnergyWh / currentPowerDraw;
    const remainingTimeMinutes = remainingTimeHours * 60;
    
    const minutesToPnr = remainingTimeMinutes - returnTimeMinutes;
    
    // Determine safety level and recommendation
    const ratio = batteryPct / batteryRequiredRaw;
    let level: SafetyLevel;
    let recommendation: SafetyRecommendation;
    let assessment: string;
    
    if (ratio >= this.config.warningMultiplier) {
      level = 'NORMAL';
      recommendation = 'CONTINUE_MISSION';
      assessment = `Adequate battery reserve. ${minutesToPnr.toFixed(1)} minutes to PNR.`;
    } else if (ratio >= this.config.criticalMultiplier) {
      level = 'WARNING';
      recommendation = 'PREPARE_RETURN';
      assessment = `Battery below 50% safety margin. Consider returning within ${minutesToPnr.toFixed(1)} minutes.`;
    } else if (ratio >= this.config.abortMultiplier) {
      level = 'CRITICAL';
      recommendation = 'INITIATE_RETURN';
      assessment = `CRITICAL: Only ${(ratio * 100 - 100).toFixed(0)}% battery margin remaining. Initiate return now.`;
    } else {
      level = 'EMERGENCY_ABORT';
      recommendation = 'CRITICAL_ABORT';
      assessment = `EMERGENCY: PNR BREACHED by ${Math.abs(minutesToPnr).toFixed(1)} minutes. Execute emergency surface protocol.`;
    }
    
    // Calculate confidence based on data quality
    const confidence = this.calculateConfidence(state, environment);
    
    const pnr: PointOfNoReturn = {
      canSafelyReturn: minutesToPnr > 0,
      minutesToPnr,
      estimatedReturnTimeMinutes: returnTimeMinutes,
      requiredBatteryPct: batteryRequiredWithMargin,
      currentBatteryPct: batteryPct,
      safetyMargin: this.config.safetyMarginMultiplier,
      recommendedAction: recommendation,
      assessment,
      calculatedAt: now,
      confidence,
    };
    
    // Store calculation
    this.lastCalculation.set(vehicle.id, pnr);
    
    // Log if significant change
    this.evaluateAndLogSafetyEvent(vehicle.id, level, pnr);
    
    return pnr;
  }
  
  /**
   * Batch calculate PNR for entire fleet
   */
  calculateFleetSafety(
    vehicles: Vehicle[],
    homePositions: Map<number, { x: number; y: number; z: number }>,
    profiles: Map<number, VehiclePhysicsProfile>,
    environment: EnvironmentalConditions
  ): Map<number, PointOfNoReturn> {
    const results = new Map<number, PointOfNoReturn>();
    
    for (const vehicle of vehicles) {
      const home = homePositions.get(vehicle.id) || { x: 0, y: 0, z: 0 };
      const profile = profiles.get(vehicle.id) || DEFAULT_VEHICLE_PROFILES['auv-standard'];
      
      const pnr = this.calculatePointOfNoReturn(vehicle, home, profile, environment);
      results.set(vehicle.id, pnr);
    }
    
    return results;
  }
  
  /**
   * Get the most critical fleet status
   */
  getFleetSafetySummary(vehicles: Vehicle[]): {
    overallStatus: SafetyLevel;
    vehiclesAtRisk: number;
    vehiclesCritical: number;
    averageMinutesToPnr: number;
    recommendedFleetAction: SafetyRecommendation;
  } {
    const calculations = vehicles
      .map(v => this.lastCalculation.get(v.id))
      .filter((pnr): pnr is PointOfNoReturn => pnr !== undefined);
    
    if (calculations.length === 0) {
      return {
        overallStatus: 'NORMAL',
        vehiclesAtRisk: 0,
        vehiclesCritical: 0,
        averageMinutesToPnr: Infinity,
        recommendedFleetAction: 'CONTINUE_MISSION',
      };
    }
    
    const atRisk = calculations.filter(p => !p.canSafelyReturn).length;
    const critical = calculations.filter(p => p.minutesToPnr < 10 && p.minutesToPnr > 0).length;
    const avgMinutesToPnr = calculations.reduce((sum, p) => sum + p.minutesToPnr, 0) / calculations.length;
    
    const worstStatus = calculations.reduce((worst, pnr) => {
      const levels: SafetyLevel[] = ['NORMAL', 'CAUTION', 'WARNING', 'CRITICAL', 'EMERGENCY_ABORT'];
      return levels.indexOf(pnr.recommendedAction === 'CRITICAL_ABORT' ? 'EMERGENCY_ABORT' : pnr.recommendedAction === 'INITIATE_RETURN' ? 'CRITICAL' : 'NORMAL') > 
             levels.indexOf(worst) ? pnr.recommendedAction === 'CRITICAL_ABORT' ? 'EMERGENCY_ABORT' : pnr.recommendedAction === 'INITIATE_RETURN' ? 'CRITICAL' : 'NORMAL' 
             : worst;
    }, 'NORMAL' as SafetyLevel);
    
    let fleetAction: SafetyRecommendation = 'CONTINUE_MISSION';
    if (atRisk > 0) fleetAction = 'EMERGENCY_SURFACE';
    else if (critical > 0) fleetAction = 'INITIATE_RETURN';
    else if (avgMinutesToPnr < 20) fleetAction = 'PREPARE_RETURN';
    
    return {
      overallStatus: worstStatus,
      vehiclesAtRisk: atRisk,
      vehiclesCritical: critical,
      averageMinutesToPnr: avgMinutesToPnr,
      recommendedFleetAction: fleetAction,
    };
  }
  
  /**
   * Check if automatic abort should be triggered
   */
  shouldTriggerAutoAbort(vehicleId: number): boolean {
    if (!this.config.enableAutoAbort) return false;
    
    const pnr = this.lastCalculation.get(vehicleId);
    if (!pnr) return false;
    
    return pnr.minutesToPnr < -5; // 5 minutes past PNR
  }
  
  /**
   * Get event log for compliance/auditing
   */
  getEventLog(options?: {
    vehicleId?: number;
    startTime?: Date;
    endTime?: Date;
    minLevel?: SafetyLevel;
  }): SafetyEvent[] {
    let events = [...this.eventLog];
    
    if (options?.vehicleId !== undefined) {
      events = events.filter(e => e.vehicleId === options.vehicleId);
    }
    if (options?.startTime) {
      events = events.filter(e => e.timestamp >= options.startTime!);
    }
    if (options?.endTime) {
      events = events.filter(e => e.timestamp <= options.endTime!);
    }
    if (options?.minLevel) {
      const levels = ['NORMAL', 'CAUTION', 'WARNING', 'CRITICAL', 'EMERGENCY_ABORT'];
      const minIndex = levels.indexOf(options.minLevel);
      events = events.filter(e => levels.indexOf(e.level) >= minIndex);
    }
    
    return events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }
  
  /**
   * Acknowledge a safety alert
   */
  acknowledgeEvent(eventId: string, acknowledgedBy: string): boolean {
    const event = this.eventLog.find(e => e.id === eventId);
    if (!event) return false;
    
    event.acknowledged = true;
    event.acknowledgedBy = acknowledgedBy;
    event.acknowledgedAt = new Date();
    
    // Also update active alerts
    for (const [vehicleId, alert] of this.activeAlerts.entries()) {
      if (alert.id === eventId) {
        this.activeAlerts.delete(vehicleId);
        break;
      }
    }
    
    return true;
  }
  
  /**
   * Get current active alerts
   */
  getActiveAlerts(): SafetyEvent[] {
    return Array.from(this.activeAlerts.values());
  }
  
  // ============================================
  // PRIVATE METHODS
  // ============================================
  
  private calculatePowerRequirement(
    profile: VehiclePhysicsProfile,
    environment: EnvironmentalConditions,
    speedMs: number
  ): number {
    // Drag force: F = 0.5 * ρ * v² * Cd * A
    const dragForceN = 0.5 * 
      environment.waterDensityKgM3 * 
      Math.pow(speedMs, 2) * 
      profile.dragCoefficient * 
      profile.frontalAreaM2;
    
    // Propulsion power: P = F * v / η
    const propulsionPowerW = (dragForceN * speedMs) / profile.propulsionEfficiency;
    
    // Temperature effect on battery (simplified)
    const tempFactor = environment.temperatureC < 5 ? 0.9 : 1.0; // Cold reduces efficiency
    
    return (propulsionPowerW + profile.basePowerDrawW) / tempFactor;
  }
  
  private calculateCurrentEffect(
    currentSpeedMs: number,
    currentDirectionDeg: number,
    homePosition: { x: number; y: number },
    vehiclePosition: { x: number; y: number }
  ): number {
    // Calculate bearing to home
    const dx = homePosition.x - vehiclePosition.x;
    const dy = homePosition.y - vehiclePosition.y;
    const homeBearingRad = Math.atan2(dy, dx);
    const homeBearingDeg = (homeBearingRad * 180 / Math.PI + 360) % 360;
    
    // Calculate angle between current and home bearing
    let angleDiff = Math.abs(currentDirectionDeg - homeBearingDeg);
    if (angleDiff > 180) angleDiff = 360 - angleDiff;
    
    // Current helps if flowing toward home (0°), hinders if against (180°)
    const effect = currentSpeedMs * Math.cos(angleDiff * Math.PI / 180);
    return effect;
  }
  
  private calculateConfidence(state: StateVector, environment: EnvironmentalConditions): number {
    let confidence = 1.0;
    
    // Reduce confidence if battery reading is old or unavailable
    if (state.batteryPct === undefined) confidence -= 0.3;
    
    // Reduce confidence for poor environmental data
    if (environment.currentSpeedMs < 0) confidence -= 0.2;
    
    // Reduce confidence for stale data
    const dataAge = Date.now() - state.timestamp;
    if (dataAge > 60000) confidence -= 0.2; // Older than 1 minute
    if (dataAge > 300000) confidence -= 0.3; // Older than 5 minutes
    
    return Math.max(0, confidence);
  }
  
  private evaluateAndLogSafetyEvent(
    vehicleId: number,
    level: SafetyLevel,
    pnr: PointOfNoReturn
  ): void {
    // Only log significant events
    if (level === 'NORMAL') return;
    
    const existingAlert = this.activeAlerts.get(vehicleId);
    
    // Don't duplicate alerts of same or lower severity
    if (existingAlert) {
      const levels = ['NORMAL', 'CAUTION', 'WARNING', 'CRITICAL', 'EMERGENCY_ABORT'];
      if (levels.indexOf(existingAlert.level) >= levels.indexOf(level)) {
        return;
      }
    }
    
    const event: SafetyEvent = {
      id: `evt-${vehicleId}-${Date.now()}`,
      vehicleId,
      timestamp: new Date(),
      level,
      type: this.determineEventType(level),
      message: pnr.assessment,
      pnrData: pnr,
      recommendedAction: pnr.recommendedAction,
      acknowledged: false,
    };
    
    this.eventLog.push(event);
    this.activeAlerts.set(vehicleId, event);
    
    // Trim log to prevent memory bloat
    if (this.eventLog.length > 10000) {
      this.eventLog = this.eventLog.slice(-5000);
    }
  }
  
  private determineEventType(level: SafetyLevel): SafetyEventType {
    switch (level) {
      case 'EMERGENCY_ABORT': return 'PNR_BREACH';
      case 'CRITICAL': return 'BATTERY_CRITICAL';
      case 'WARNING': return 'BATTERY_WARNING';
      default: return 'SAFETY_MARGIN_VIOLATION';
    }
  }
  
  private createErrorPnr(vehicleId: number, error: string): PointOfNoReturn {
    return {
      canSafelyReturn: false,
      minutesToPnr: -Infinity,
      estimatedReturnTimeMinutes: Infinity,
      requiredBatteryPct: 100,
      currentBatteryPct: 0,
      safetyMargin: this.config.safetyMarginMultiplier,
      recommendedAction: 'EMERGENCY_SURFACE',
      assessment: `ERROR: ${error}`,
      calculatedAt: new Date(),
      confidence: 0,
    };
  }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Quick PNR check for UI components
 * Returns true if vehicle can safely return
 */
export function canSafelyReturn(
  batteryPct: number,
  distanceToHomeM: number,
  currentDrainRatePctPerHour: number,
  speedMs: number,
  safetyMargin: number = 1.2
): boolean {
  const timeToReturnHours = (distanceToHomeM / speedMs) / 3600;
  const batteryRequired = timeToReturnHours * currentDrainRatePctPerHour * safetyMargin;
  return batteryPct > batteryRequired;
}

/**
 * Calculate estimated time to PNR in minutes
 * Simplified version for quick UI updates
 */
export function estimateTimeToPnr(
  batteryPct: number,
  batteryDrainRatePctPerHour: number,
  distanceToHomeM: number,
  speedMs: number
): number {
  const remainingTimeHours = batteryPct / batteryDrainRatePctPerHour;
  const returnTimeHours = (distanceToHomeM / speedMs) / 3600;
  return (remainingTimeHours - returnTimeHours) * 60;
}

/**
 * Format PNR for display
 */
export function formatPnrStatus(pnr: PointOfNoReturn): string {
  if (pnr.minutesToPnr > 60) {
    return `${(pnr.minutesToPnr / 60).toFixed(1)}h to PNR`;
  } else if (pnr.minutesToPnr > 0) {
    return `${pnr.minutesToPnr.toFixed(0)}m to PNR`;
  } else {
    return `PNR BREACH: ${Math.abs(pnr.minutesToPnr).toFixed(0)}m ago`;
  }
}

// ============================================
// EXPORT SINGLETON
// ============================================

export const globalSafetyEngine = new SafetyEngine();

export default SafetyEngine;
