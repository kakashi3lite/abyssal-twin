/**
 * TelemetryGauge - Circular gauge for telemetry visualization
 * 
 * Shows battery, depth, or other metrics in an animated circular display
 */

import React from 'react';
import { motion } from 'framer-motion';

interface TelemetryGaugeProps {
  value: number;
  max: number;
  label: string;
  unit: string;
  color: 'green' | 'yellow' | 'red' | 'blue';
  size?: 'sm' | 'md' | 'lg';
  animated?: boolean;
}

const sizeConfig = {
  sm: { width: 80, strokeWidth: 6, fontSize: 'text-sm' },
  md: { width: 120, strokeWidth: 8, fontSize: 'text-base' },
  lg: { width: 160, strokeWidth: 10, fontSize: 'text-lg' },
};

const colorConfig = {
  green: { stroke: '#22c55e', glow: 'rgba(34,197,94,0.5)' },
  yellow: { stroke: '#eab308', glow: 'rgba(234,179,8,0.5)' },
  red: { stroke: '#ef4444', glow: 'rgba(239,68,68,0.5)' },
  blue: { stroke: '#38bdf8', glow: 'rgba(56,189,248,0.5)' },
};

export const TelemetryGauge: React.FC<TelemetryGaugeProps> = ({
  value,
  max,
  label,
  unit,
  color,
  size = 'md',
  animated = true,
}) => {
  const config = sizeConfig[size];
  const colors = colorConfig[color];
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));
  
  const radius = (config.width - config.strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percentage / 100) * circumference;
  
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: config.width, height: config.width }}>
        {/* Background circle */}
        <svg
          width={config.width}
          height={config.width}
          className="transform -rotate-90"
        >
          <circle
            cx={config.width / 2}
            cy={config.width / 2}
            r={radius}
            fill="none"
            stroke="#1e293b"
            strokeWidth={config.strokeWidth}
          />
          <motion.circle
            cx={config.width / 2}
            cy={config.width / 2}
            r={radius}
            fill="none"
            stroke={colors.stroke}
            strokeWidth={config.strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={animated ? { strokeDashoffset: circumference } : false}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1, ease: "easeOut" }}
            style={{
              filter: `drop-shadow(0 0 6px ${colors.glow})`,
            }}
          />
        </svg>
        
        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <motion.span 
            className={`font-bold text-slate-100 ${config.fontSize}`}
            initial={animated ? { opacity: 0, scale: 0.5 } : false}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3, duration: 0.3 }}
          >
            {Math.round(value)}
          </motion.span>
          <span className="text-xs text-slate-500">{unit}</span>
        </div>
      </div>
      
      <span className="text-sm text-slate-400 font-medium">{label}</span>
    </div>
  );
};

export default TelemetryGauge;
