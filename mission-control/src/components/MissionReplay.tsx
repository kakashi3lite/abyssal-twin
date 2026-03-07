/**
 * MissionReplay.tsx
 * 
 * Black Box Mission Replay System
 * 
 * Commercial Value:
 * - Provides forensic mission analysis for incident investigation
 * - Insurance claim documentation with tamper-proof audit trail
 * - Operator training via historical mission replay
 * - Regulatory compliance (ISO 45001, maritime safety)
 * 
 * @module MissionReplay
 * @version 2.0.0
 */

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { StateVector, Vehicle } from '../types';

// ============================================
// TYPES & INTERFACES
// ============================================

export interface RecordedState {
  timestamp: number;
  state: StateVector;
  events: ReplayEvent[];
  isKeyframe: boolean;
}

export interface ReplayEvent {
  id: string;
  timestamp: number;
  type: ReplayEventType;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  metadata?: Record<string, unknown>;
}

export type ReplayEventType =
  | 'mission_start'
  | 'mission_end'
  | 'anomaly_detected'
  | 'command_sent'
  | 'status_change'
  | 'communication_loss'
  | 'communication_restore'
  | 'depth_threshold'
  | 'battery_threshold'
  | 'operator_override';

export interface MissionRecording {
  id: string;
  missionName: string;
  vehicleId: number;
  vehicleName: string;
  startTime: number;
  endTime: number | null;
  durationSeconds: number;
  stateCount: number;
  eventCount: number;
  hasAnomalies: boolean;
  fileSizeBytes: number;
  recordingQuality: 'high' | 'normal' | 'low';
}

export interface MissionReplayProps {
  recording: MissionRecording;
  states: RecordedState[];
  vehicles: Vehicle[];
  onReplayComplete?: () => void;
  onTimeChange?: (time: number) => void;
  onStateChange?: (states: Map<number, StateVector>) => void;
  onExport?: (format: ExportFormat) => void;
}

export type ExportFormat = 'rosbag' | 'csv' | 'json' | 'mp4' | 'pdf_report';

// ============================================
// CONSTANTS
// ============================================

const PLAYBACK_RATES = [0.25, 0.5, 1, 2, 5, 10] as const;

// ============================================
// UTILITY FUNCTIONS
// ============================================

export function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  
  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

export function getEventIcon(type: ReplayEventType): string {
  const icons: Record<ReplayEventType, string> = {
    mission_start: '🚀',
    mission_end: '🏁',
    anomaly_detected: '⚠️',
    command_sent: '📡',
    status_change: '📊',
    communication_loss: '📡❌',
    communication_restore: '📡✓',
    depth_threshold: '🌊',
    battery_threshold: '🔋',
    operator_override: '👤',
  };
  return icons[type] || '•';
}

// ============================================
// MAIN COMPONENT
// ============================================

export const MissionReplay: React.FC<MissionReplayProps> = ({
  recording,
  states,
  vehicles,
  onReplayComplete,
  onTimeChange,
  onStateChange,
  onExport,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [loop, setLoop] = useState(false);
  
  const animationFrameRef = useRef<number>();
  const lastFrameTimeRef = useRef<number>(0);
  
  const duration = recording.durationSeconds * 1000;
  const allEvents = useMemo(() => states.flatMap(s => s.events), [states]);
  
  // Find state at current time
  const currentState = useMemo(() => {
    const index = states.findIndex(s => s.timestamp > currentTime);
    if (index === -1) return states[states.length - 1]?.state;
    if (index === 0) return states[0]?.state;
    return states[index - 1]?.state;
  }, [states, currentTime]);
  
  // Animation loop
  const animate = useCallback((timestamp: number) => {
    if (!lastFrameTimeRef.current) lastFrameTimeRef.current = timestamp;
    const deltaTime = timestamp - lastFrameTimeRef.current;
    lastFrameTimeRef.current = timestamp;
    
    setCurrentTime(prev => {
      const newTime = prev + deltaTime * playbackRate;
      
      if (newTime >= duration) {
        if (loop) {
          onStateChange?.(new Map());
          return 0;
        }
        setIsPlaying(false);
        onReplayComplete?.();
        return duration;
      }
      
      const stateMap = new Map<number, StateVector>();
      if (currentState) stateMap.set(currentState.auvId, currentState);
      onStateChange?.(stateMap);
      onTimeChange?.(newTime);
      
      return newTime;
    });
    
    animationFrameRef.current = requestAnimationFrame(animate);
  }, [duration, loop, playbackRate, currentState, onReplayComplete, onStateChange, onTimeChange]);
  
  useEffect(() => {
    if (isPlaying) {
      lastFrameTimeRef.current = 0;
      animationFrameRef.current = requestAnimationFrame(animate);
    } else {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    }
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [isPlaying, animate]);
  
  const handleSeek = useCallback((time: number) => {
    setCurrentTime(time);
    onTimeChange?.(time);
  }, [onTimeChange]);
  
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  
  return (
    <div className="bg-slate-900 rounded-xl border border-slate-700 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-slate-700">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-slate-100">{recording.missionName}</h3>
            <p className="text-sm text-slate-500">{recording.vehicleName}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => onExport?.('csv')} className="px-3 py-1.5 bg-slate-800 text-slate-300 text-sm rounded hover:bg-slate-700">
              Export CSV
            </button>
          </div>
        </div>
      </div>
      
      {/* Timeline */}
      <div className="p-4 space-y-4">
        <div className="relative h-12 bg-slate-800 rounded-lg overflow-hidden">
          {/* Progress */}
          <div className="absolute top-0 left-0 h-full bg-blue-500/20" style={{ width: `${progress}%` }} />
          
          {/* Event markers */}
          {allEvents.map(event => {
            const eventProgress = (event.timestamp / duration) * 100;
            return (
              <div
                key={event.id}
                className={`absolute top-1 w-2 h-2 rounded-full transform -translate-x-1/2
                  ${event.severity === 'critical' ? 'bg-red-500' : ''}
                  ${event.severity === 'warning' ? 'bg-yellow-500' : ''}
                  ${event.severity === 'info' ? 'bg-blue-500' : ''}
                `}
                style={{ left: `${eventProgress}%` }}
                title={event.message}
              />
            );
          })}
          
          {/* Seek bar */}
          <input
            type="range"
            min={0}
            max={duration}
            value={currentTime}
            onChange={(e) => handleSeek(Number(e.target.value))}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
          
          {/* Playhead */}
          <div className="absolute top-0 h-full w-0.5 bg-blue-400" style={{ left: `${progress}%` }} />
        </div>
        
        {/* Time display */}
        <div className="flex justify-between text-sm text-slate-400 font-mono">
          <span>{formatTimestamp(currentTime)}</span>
          <span>{formatTimestamp(duration)}</span>
        </div>
        
        {/* Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="w-10 h-10 bg-blue-600 hover:bg-blue-500 text-white rounded-full flex items-center justify-center"
            >
              {isPlaying ? '⏸' : '▶'}
            </button>
            
            <button onClick={() => handleSeek(0)} className="px-3 py-2 bg-slate-800 text-slate-300 rounded">
              ⏮
            </button>
            
            <div className="flex gap-1 ml-4">
              {PLAYBACK_RATES.map(rate => (
                <button
                  key={rate}
                  onClick={() => setPlaybackRate(rate)}
                  className={`px-2 py-1 text-xs rounded ${playbackRate === rate ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'}`}
                >
                  {rate}x
                </button>
              ))}
            </div>
          </div>
          
          <label className="flex items-center gap-2 text-sm text-slate-400">
            <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} className="rounded" />
            Loop
          </label>
        </div>
        
        {/* Current state display */}
        {currentState && (
          <div className="grid grid-cols-4 gap-3 p-3 bg-slate-800 rounded-lg">
            <TelemetryItem label="Depth" value={`${Math.abs(currentState.z).toFixed(0)}m`} />
            <TelemetryItem 
              label="Battery" 
              value={`${currentState.batteryPct?.toFixed(0) ?? '--'}%`}
              alert={currentState.batteryPct !== undefined && currentState.batteryPct < 30}
            />
            <TelemetryItem label="Health" value={`${currentState.healthScore.toFixed(0)}%`} />
            <TelemetryItem 
              label="Status" 
              value={currentState.anomalyDetected ? '⚠️ Anomaly' : '✓ Normal'}
              alert={currentState.anomalyDetected}
            />
          </div>
        )}
        
        {/* Recent events */}
        <div className="max-h-48 overflow-y-auto space-y-1">
          {allEvents.slice(-10).map(event => (
            <div 
              key={event.id}
              className={`flex items-center gap-2 p-2 rounded text-sm
                ${event.severity === 'critical' ? 'bg-red-900/20 text-red-300' : ''}
                ${event.severity === 'warning' ? 'bg-yellow-900/20 text-yellow-300' : ''}
                ${event.severity === 'info' ? 'bg-slate-800 text-slate-300' : ''}
              `}
            >
              <span>{getEventIcon(event.type)}</span>
              <span className="flex-1">{event.message}</span>
              <span className="text-xs text-slate-500">{formatTimestamp(event.timestamp)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

interface TelemetryItemProps {
  label: string;
  value: string;
  alert?: boolean;
}

const TelemetryItem: React.FC<TelemetryItemProps> = ({ label, value, alert }) => (
  <div className="text-center">
    <div className="text-xs text-slate-500">{label}</div>
    <div className={`text-sm font-mono font-semibold ${alert ? 'text-red-400' : 'text-slate-200'}`}>
      {value}
    </div>
  </div>
);

export default MissionReplay;
