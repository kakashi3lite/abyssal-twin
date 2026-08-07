/**
 * fleetAdapter — maps backend telemetry (FederatedDTState-shaped) onto the
 * Mission Control FleetAsset model used by the map + SafetyEngine.
 *
 * HONESTY CONTRACT (operator trust):
 *  - x/y/z meters in the local navigation frame are anchored to MISSION_ORIGIN
 *    to derive lat/long (the map is geographic).
 *  - batteryPct is NOT carried by the backend stream today → PNR (etPnr) is
 *    left null and the UI shows "—". We never synthesize battery/PNR numbers,
 *    because a PNR decision is a $1M+ safety call.
 *  - missionPhase maps to the operational-mode vocabulary the map understands.
 */
import type { Vehicle, FleetStatus } from "../types";
import type { FleetAsset, FleetAlert } from "../components/GlobalFleetMap";

/** Anchors the local (x,y) navigation frame to a geographic area. */
export const MISSION_ORIGIN = {
  lat: 25.0, // mission area origin (lat)
  lon: -80.0, // mission area origin (lon)
};
const METERS_PER_DEG_LAT = 111_320;

export function phaseToMode(
  phase: number | undefined
): FleetAsset["operationalMode"] {
  switch (phase) {
    case 1:
      return "transit";
    case 2:
      return "survey";
    case 3:
      return "emergency";
    case 0:
    default:
      return phase === 0 ? "docked" : "hover";
  }
}

export function healthPct(healthScore: number | undefined): number | null {
  if (typeof healthScore !== "number") return null;
  return Math.round((healthScore / 255) * 100);
}

/** Map one backend Vehicle to a FleetAsset (geographic anchoring). */
export function stateToFleetAsset(vehicle: Vehicle): FleetAsset {
  const s = vehicle.latestState;
  const cosLat = Math.cos((MISSION_ORIGIN.lat * Math.PI) / 180);
  const lat = MISSION_ORIGIN.lat + (s ? s.y / METERS_PER_DEG_LAT : 0);
  const lon =
    MISSION_ORIGIN.lon + (s ? s.x / (METERS_PER_DEG_LAT * cosLat) : 0);

  return {
    ...vehicle,
    latitude: lat,
    longitude: lon,
    region: "atlantic", // mission area; backend does not classify region
    missionId: null,
    operationalMode: phaseToMode(s?.missionPhase),
    // PNR requires battery, which the stream doesn't carry → honest "unknown".
    etPnr: null,
    assetValue: vehicle.type === "support" ? 800_000 : 2_500_000,
  };
}

/** Derive alerts ONLY from what the backend actually reports (or PNR math). */
export function generateFleetAlerts(assets: FleetAsset[]): FleetAlert[] {
  const alerts: FleetAlert[] = [];

  for (const asset of assets) {
    const s = asset.latestState;
    if (!s) continue;

    // PNR — only when the SafetyEngine actually computed one (battery present).
    if (asset.etPnr !== null) {
      if (asset.etPnr <= 0) {
        alerts.push({
          id: `alert-pnr-${asset.id}`,
          assetId: asset.id,
          type: "pnr_breach",
          severity: "emergency",
          message: `${asset.name} — POINT OF NO RETURN BREACHED`,
          timestamp: new Date(s.timestamp * 1000),
          latitude: asset.latitude,
          longitude: asset.longitude,
        });
      } else if (asset.etPnr <= 15) {
        alerts.push({
          id: `alert-pnr-low-${asset.id}`,
          assetId: asset.id,
          type: "battery_low",
          severity: "critical",
          message: `${asset.name} — ${asset.etPnr.toFixed(0)} min to PNR`,
          timestamp: new Date(s.timestamp * 1000),
          latitude: asset.latitude,
          longitude: asset.longitude,
        });
      }
    }

    if (s.anomalyDetected) {
      alerts.push({
        id: `alert-anomaly-${asset.id}-${Math.round(s.timestamp)}`,
        assetId: asset.id,
        type: "anomaly",
        severity: "critical",
        message: `${asset.name} — anomaly detected`,
        timestamp: new Date(s.timestamp * 1000),
        latitude: asset.latitude,
        longitude: asset.longitude,
      });
    } else if (s.healthScore < 128) {
      alerts.push({
        id: `alert-health-${asset.id}`,
        assetId: asset.id,
        type: "health_warning",
        severity: "warning",
        message: `${asset.name} — degraded health (${healthPct(s.healthScore)}%)`,
        timestamp: new Date(s.timestamp * 1000),
        latitude: asset.latitude,
        longitude: asset.longitude,
      });
    }

    if (asset.status === "partitioned") {
      alerts.push({
        id: `alert-partition-${asset.id}`,
        assetId: asset.id,
        type: "communication_loss",
        severity: "warning",
        message: `${asset.name} — acoustic link partitioned`,
        timestamp: new Date(),
        latitude: asset.latitude,
        longitude: asset.longitude,
      });
    }
  }

  return alerts;
}

/** Build FleetAsset[] from the fleet stream (stable order by id). */
export function fleetToAssets(fleet: FleetStatus | null): FleetAsset[] {
  if (!fleet) return [];
  return fleet.vehicles
    .slice()
    .sort((a, b) => a.id - b.id)
    .map(stateToFleetAsset);
}
