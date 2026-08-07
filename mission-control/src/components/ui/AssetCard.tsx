/**
 * AssetCard - Enhanced AUV asset card with animations and telemetry
 */

import React from 'react';
import { motion } from 'framer-motion';
import { itemVariants } from '../../lib/animations';
import TelemetryGauge from './TelemetryGauge';
import type { FleetAsset } from '../GlobalFleetMap';

interface AssetCardProps {
  asset: FleetAsset;
  isSelected: boolean;
  onClick: () => void;
  index: number;
}

const statusConfig = {
  online: { color: 'green', label: 'Online', dot: 'bg-green-500' },
  partitioned: { color: 'yellow', label: 'Partitioned', dot: 'bg-yellow-500' },
  offline: { color: 'red', label: 'Offline', dot: 'bg-red-500' },
};

const alertColor = (etPnr: number | null): 'green' | 'yellow' | 'red' => {
  if (etPnr === null) return 'green';
  if (etPnr < 0) return 'red';
  if (etPnr < 20) return 'yellow';
  return 'green';
};

export const AssetCard: React.FC<AssetCardProps> = ({
  asset,
  isSelected,
  onClick,
  index,
}) => {
  const status = statusConfig[asset.status];
  const state = asset.latestState;
  const battery = state?.batteryPct ?? 0;
  const pnrColor = alertColor(asset.etPnr);
  
  return (
    <motion.div
      variants={itemVariants}
      custom={index}
      layout
      whileHover={{ scale: 1.02, y: -2 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={`
        relative p-4 rounded-xl cursor-pointer
        border transition-all duration-300
        ${isSelected 
          ? 'bg-slate-800/90 border-blue-500/50 shadow-[0_0_30px_rgba(56,189,248,0.2)]' 
          : 'bg-slate-900/60 border-slate-700/50 hover:border-slate-600/50'
        }
      `}
    >
      {/* Status indicator line */}
      <motion.div 
        className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-xl ${status.dot}`}
        layoutId={`status-${asset.id}`}
      />
      
      {/* Header */}
      <div className="flex items-center justify-between mb-3 pl-2">
        <div>
          <h3 className="font-semibold text-slate-200">{asset.name}</h3>
          <span className="text-xs text-slate-500 uppercase tracking-wider">
            {asset.type} • {asset.region}
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          <motion.span 
            className={`w-2 h-2 rounded-full ${status.dot}`}
            animate={asset.status === 'online' ? {
              scale: [1, 1.2, 1],
              opacity: [1, 0.7, 1],
            } : {}}
            transition={{ duration: 2, repeat: Infinity }}
          />
          <span className={`text-xs font-medium ${
            asset.status === 'online' ? 'text-green-400' : 
            asset.status === 'partitioned' ? 'text-yellow-400' : 'text-red-400'
          }`}>
            {status.label}
          </span>
        </div>
      </div>
      
      {/* Telemetry Grid */}
      <div className="grid grid-cols-3 gap-2 pl-2">
        <div className="text-center">
          <div className="text-xs text-slate-500 mb-1">Battery</div>
          <div className={`text-sm font-mono font-semibold ${
            battery < 20 ? 'text-red-400' : battery < 50 ? 'text-yellow-400' : 'text-green-400'
          }`}>
            {battery.toFixed(0)}%
          </div>
          <div className="w-full h-1 bg-slate-800 rounded-full mt-1 overflow-hidden">
            <motion.div 
              className={`h-full rounded-full ${
                battery < 20 ? 'bg-red-500' : battery < 50 ? 'bg-yellow-500' : 'bg-green-500'
              }`}
              initial={{ width: 0 }}
              animate={{ width: `${battery}%` }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
            />
          </div>
        </div>
        
        <div className="text-center">
          <div className="text-xs text-slate-500 mb-1">Depth</div>
          <div className="text-sm font-mono font-semibold text-slate-200">
            {state ? Math.abs(state.z).toFixed(0) : '--'}
          </div>
          <div className="text-xs text-slate-600">m</div>
        </div>
        
        <div className="text-center">
          <div className="text-xs text-slate-500 mb-1">PNR</div>
          <div className={`text-sm font-mono font-semibold ${
            pnrColor === 'red' ? 'text-red-400 animate-pulse' :
            pnrColor === 'yellow' ? 'text-yellow-400' : 'text-green-400'
          }`}>
            {asset.etPnr !== null ? `${Math.max(0, asset.etPnr).toFixed(0)}m` : '--'}
          </div>
          <div className="text-xs text-slate-600">to return</div>
        </div>
      </div>
      
      {/* Operation mode badge */}
      <div className="mt-3 pl-2 flex items-center justify-between">
        <span className={`
          text-xs px-2 py-0.5 rounded-full
          ${asset.operationalMode === 'emergency' 
            ? 'bg-red-500/20 text-red-300 border border-red-500/30' :
            asset.operationalMode === 'survey'
            ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' :
            'bg-slate-700/50 text-slate-400'
          }
        `}>
          {asset.operationalMode}
        </span>
        
        {state?.anomalyDetected && (
          <motion.span 
            className="text-xs text-red-400 flex items-center gap-1"
            animate={{ opacity: [1, 0.5, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            ⚠️ Anomaly
          </motion.span>
        )}
      </div>
    </motion.div>
  );
};

export default AssetCard;
