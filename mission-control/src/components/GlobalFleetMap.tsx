/**
 * GlobalFleetMap.tsx
 * 
 * Enterprise-grade geospatial fleet command center.
 * Transforms AUV telemetry into actionable global situational awareness.
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import Map, { Marker, NavigationControl, Popup } from 'react-map-gl';
import type { MapRef } from 'react-map-gl';
import type { Vehicle } from '../types';
import 'mapbox-gl/dist/mapbox-gl.css';

// ============================================
// TYPES & INTERFACES
// ============================================

export interface FleetAsset extends Vehicle {
  latitude: number;
  longitude: number;
  region: 'atlantic' | 'pacific' | 'indian' | 'arctic' | 'southern' | 'mediterranean';
  missionId: string | null;
  operationalMode: 'survey' | 'transit' | 'hover' | 'emergency' | 'docked';
  etPnr: number | null;
  assetValue: number;
}

export interface FleetCluster {
  id: string;
  latitude: number;
  longitude: number;
  count: number;
  assets: FleetAsset[];
  statusSummary: {
    online: number;
    warning: number;
    critical: number;
    offline: number;
    emergency: number;
  };
  totalValue: number;
}

export type AlertLevel = 'normal' | 'warning' | 'critical' | 'emergency';

export interface GlobalFleetMapProps {
  assets: FleetAsset[];
  mapboxToken: string;
  onAssetSelect?: (asset: FleetAsset) => void;
  onClusterSelect?: (cluster: FleetCluster) => void;
  activeAlerts?: FleetAlert[];
  layerVisibility?: LayerVisibility;
}

export interface FleetAlert {
  id: string;
  assetId: number;
  type: 'pnr_breach' | 'anomaly' | 'communication_loss' | 'battery_low' | 'depth_exceedance';
  severity: AlertLevel;
  message: string;
  timestamp: Date;
  latitude: number;
  longitude: number;
}

export interface LayerVisibility {
  assets: boolean;
  clusters: boolean;
  tracks: boolean;
  missionBoundaries: boolean;
  heatmap: boolean;
}

// ============================================
// CONSTANTS
// ============================================

const CLUSTER_RADIUS_KM = 500;
const CLUSTER_ZOOM_THRESHOLD = 5;

// ============================================
// UTILITY FUNCTIONS
// ============================================

function calculateAlertLevel(asset: FleetAsset): AlertLevel {
  if (asset.etPnr !== null && asset.etPnr <= 0) return 'emergency';
  if (asset.etPnr !== null && asset.etPnr <= 10) return 'critical';
  const battery = asset.latestState?.batteryPct ?? 100;
  if (battery < 15) return 'critical';
  if (battery < 30 || asset.status === 'partitioned' || (asset.etPnr !== null && asset.etPnr <= 20)) return 'warning';
  return 'normal';
}

function getAlertColor(level: AlertLevel): string {
  switch (level) {
    case 'emergency': return '#dc2626';
    case 'critical': return '#ea580c';
    case 'warning': return '#ca8a04';
    case 'normal': return '#16a34a';
  }
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) * Math.sin(Δλ/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ============================================
// SUB-COMPONENTS
// ============================================

interface AssetMarkerProps {
  asset: FleetAsset;
  isSelected: boolean;
  onClick: () => void;
}

const AssetMarker: React.FC<AssetMarkerProps> = ({ asset, isSelected, onClick }) => {
  const alertLevel = calculateAlertLevel(asset);
  const color = getAlertColor(alertLevel);
  
  return (
    <div 
      className={`relative cursor-pointer transition-transform hover:scale-110 ${isSelected ? 'z-50' : 'z-10'}`}
      onClick={onClick}
      style={{ transform: 'translate(-50%, -50%)' }}
    >
      {alertLevel === 'emergency' && (
        <div className="absolute inset-0 rounded-full animate-ping opacity-75" style={{ backgroundColor: color }} />
      )}
      <div 
        className="w-8 h-8 rounded-full flex items-center justify-center border-2 border-white shadow-lg transition-all"
        style={{ backgroundColor: color }}
      >
        <div className="w-2 h-2 bg-white rounded-full" />
      </div>
      {isSelected && <div className="absolute -inset-2 border-2 border-white rounded-full animate-pulse" />}
    </div>
  );
};

interface ClusterMarkerProps {
  cluster: FleetCluster;
  onClick: () => void;
}

const ClusterMarker: React.FC<ClusterMarkerProps> = ({ cluster, onClick }) => {
  const { statusSummary, count } = cluster;
  const alertLevel: AlertLevel = 
    statusSummary.emergency > 0 ? 'emergency' :
    statusSummary.critical > 0 ? 'critical' :
    statusSummary.warning > 0 ? 'warning' : 'normal';
  
  const color = getAlertColor(alertLevel);
  const size = Math.min(64, 32 + count * 2);
  
  return (
    <div 
      className="relative cursor-pointer transition-transform hover:scale-105 flex items-center justify-center"
      onClick={onClick}
      style={{ width: size, height: size, transform: 'translate(-50%, -50%)' }}
    >
      <div 
        className="w-full h-full rounded-full flex flex-col items-center justify-center border-2 border-white shadow-xl"
        style={{ backgroundColor: color }}
      >
        <span className="text-white font-bold text-base leading-none">{count}</span>
      </div>
      
      {(statusSummary.critical > 0 || statusSummary.warning > 0) && (
        <div className="absolute -bottom-1 -right-1 flex -space-x-1">
          {statusSummary.critical > 0 && <div className="w-3 h-3 bg-red-500 rounded-full border border-white" />}
          {statusSummary.warning > 0 && <div className="w-3 h-3 bg-yellow-500 rounded-full border border-white" />}
        </div>
      )}
    </div>
  );
};

// ============================================
// MAIN COMPONENT
// ============================================

export const GlobalFleetMap: React.FC<GlobalFleetMapProps> = ({
  assets,
  mapboxToken,
  onAssetSelect,
  onClusterSelect,
  activeAlerts = [],
  layerVisibility = { assets: true, clusters: true, tracks: false, missionBoundaries: true, heatmap: false },
}) => {
  const mapRef = React.useRef<MapRef>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<number | null>(null);
  const [hoveredAsset, setHoveredAsset] = useState<FleetAsset | null>(null);
  const [viewState, setViewState] = useState({
    longitude: -40,
    latitude: 25,
    zoom: 2
  });

  // Calculate clusters
  const clusters = useMemo((): FleetCluster[] => {
    if (!layerVisibility.clusters || viewState.zoom >= CLUSTER_ZOOM_THRESHOLD) return [];
    
    const clusters: FleetCluster[] = [];
    const processed = new Set<number>();
    
    for (const asset of assets) {
      if (processed.has(asset.id)) continue;
      
      const nearby = assets.filter(a => {
        if (processed.has(a.id)) return false;
        return calculateDistance(asset.latitude, asset.longitude, a.latitude, a.longitude) < CLUSTER_RADIUS_KM * 1000;
      });
      
      if (nearby.length > 1) {
        clusters.push({
          id: `cluster-${asset.id}`,
          latitude: nearby.reduce((sum, a) => sum + a.latitude, 0) / nearby.length,
          longitude: nearby.reduce((sum, a) => sum + a.longitude, 0) / nearby.length,
          count: nearby.length,
          assets: nearby,
          statusSummary: {
            online: nearby.filter(a => a.status === 'online').length,
            warning: nearby.filter(a => calculateAlertLevel(a) === 'warning').length,
            critical: nearby.filter(a => calculateAlertLevel(a) === 'critical').length,
            offline: nearby.filter(a => a.status === 'offline').length,
            emergency: nearby.filter(a => calculateAlertLevel(a) === 'emergency').length,
          },
          totalValue: nearby.reduce((sum, a) => sum + a.assetValue, 0),
        });
        nearby.forEach(a => processed.add(a.id));
      }
    }
    return clusters;
  }, [assets, layerVisibility.clusters, viewState.zoom]);

  const unclusteredAssets = useMemo(() => {
    const clusteredIds = new Set(clusters.flatMap(c => c.assets.map(a => a.id)));
    return assets.filter(a => !clusteredIds.has(a.id));
  }, [assets, clusters]);

  const handleClusterClick = useCallback((cluster: FleetCluster) => {
    mapRef.current?.flyTo({
      center: [cluster.longitude, cluster.latitude],
      zoom: CLUSTER_ZOOM_THRESHOLD + 2,
      duration: 1000
    });
    onClusterSelect?.(cluster);
  }, [onClusterSelect]);

  const handleAssetClick = useCallback((asset: FleetAsset) => {
    setSelectedAssetId(asset.id);
    onAssetSelect?.(asset);
  }, [onAssetSelect]);

  // Fit bounds to assets when loaded
  useEffect(() => {
    if (assets.length > 0 && mapRef.current) {
      const lats = assets.map(a => a.latitude);
      const lngs = assets.map(a => a.longitude);
      const bounds: [[number, number], [number, number]] = [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)]
      ];
      mapRef.current.fitBounds(bounds, { padding: 100, duration: 1500 });
    }
  }, [assets]);

  // Filter alerts for assets
  const assetAlerts = useMemo(() => {
    const alertMap: Map<number, FleetAlert[]> = new globalThis.Map();
    activeAlerts.forEach((alert: FleetAlert) => {
      const list = alertMap.get(alert.assetId) || [];
      list.push(alert);
      alertMap.set(alert.assetId, list);
    });
    return alertMap;
  }, [activeAlerts]);

  if (!mapboxToken) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-slate-900 text-slate-400">
        <div className="text-center p-8">
          <div className="text-4xl mb-4">🗺️</div>
          <p className="text-lg font-medium">Mapbox API token required</p>
          <p className="text-sm mt-2">Set VITE_MAPBOX_TOKEN environment variable</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      <Map
        ref={mapRef}
        {...viewState}
        onMove={evt => setViewState(evt.viewState)}
        mapboxAccessToken={mapboxToken}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        style={{ width: '100%', height: '100%' }}
        attributionControl={false}
      >
        {/* Navigation controls */}
        <NavigationControl position="bottom-right" />

        {/* Cluster markers */}
        {layerVisibility.clusters && clusters.map(cluster => (
          <Marker
            key={cluster.id}
            longitude={cluster.longitude}
            latitude={cluster.latitude}
          >
            <ClusterMarker cluster={cluster} onClick={() => handleClusterClick(cluster)} />
          </Marker>
        ))}

        {/* Individual asset markers */}
        {(viewState.zoom >= CLUSTER_ZOOM_THRESHOLD || !layerVisibility.clusters) && unclusteredAssets.map(asset => (
          <Marker
            key={asset.id}
            longitude={asset.longitude}
            latitude={asset.latitude}
          >
            <div
              onMouseEnter={() => setHoveredAsset(asset)}
              onMouseLeave={() => setHoveredAsset(null)}
            >
              <AssetMarker 
                asset={asset} 
                isSelected={selectedAssetId === asset.id}
                onClick={() => handleAssetClick(asset)}
              />
            </div>
          </Marker>
        ))}

        {/* Hover popup */}
        {hoveredAsset && (
          <Popup
            longitude={hoveredAsset.longitude}
            latitude={hoveredAsset.latitude}
            offset={[0, -20]}
            closeButton={false}
            anchor="bottom"
          >
            <div className="p-2 min-w-[180px]">
              <div className="font-semibold text-slate-800">{hoveredAsset.name}</div>
              <div className="text-xs text-slate-500 uppercase tracking-wide">{hoveredAsset.type}</div>
              <div className="mt-2 space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Region:</span>
                  <span className="text-slate-700 capitalize">{hoveredAsset.region}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Mode:</span>
                  <span className="text-slate-700 capitalize">{hoveredAsset.operationalMode}</span>
                </div>
                {hoveredAsset.etPnr !== null && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">PNR:</span>
                    <span className={hoveredAsset.etPnr <= 10 ? 'text-red-600 font-semibold' : 'text-slate-700'}>
                      {Math.max(0, hoveredAsset.etPnr).toFixed(0)} min
                    </span>
                  </div>
                )}
                {assetAlerts.get(hoveredAsset.id)?.map(alert => (
                  <div key={alert.id} className="text-red-600 font-medium mt-1">
                    ⚠ {alert.message}
                  </div>
                ))}
              </div>
            </div>
          </Popup>
        )}
      </Map>

      {/* Alert overlay */}
      {activeAlerts.length > 0 && (
        <div className="absolute top-4 left-4 right-16 z-10 space-y-2">
          {activeAlerts.slice(0, 3).map(alert => (
            <div 
              key={alert.id}
              className={`
                flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg border-l-4 backdrop-blur-sm
                ${alert.severity === 'emergency' ? 'bg-red-950/90 border-red-500' : ''}
                ${alert.severity === 'critical' ? 'bg-orange-950/90 border-orange-500' : ''}
                ${alert.severity === 'warning' ? 'bg-yellow-950/90 border-yellow-500' : ''}
                ${alert.severity === 'normal' ? 'bg-slate-900/90 border-slate-500' : ''}
              `}
            >
              <div className="flex-1">
                <div className="font-semibold text-sm text-slate-100">{alert.message}</div>
                <div className="text-xs text-slate-400">{alert.timestamp.toLocaleTimeString()}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Asset count badge */}
      <div className="absolute top-4 right-4 z-10">
        <div className="bg-slate-900/90 backdrop-blur-sm text-white px-4 py-2 rounded-lg shadow-lg border border-slate-700">
          <span className="text-2xl font-bold">{assets.length}</span>
          <span className="text-slate-400 text-sm ml-2">Assets</span>
        </div>
      </div>
    </div>
  );
};

export default GlobalFleetMap;
