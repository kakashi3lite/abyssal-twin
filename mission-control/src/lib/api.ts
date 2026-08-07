import { apiUrl } from "./config";

/**
 * api — REST client for the Abyssal Twin backend (real data).
 * Used by the alert banner to surface + acknowledge CUSUM anomalies.
 */

export interface BackendAnomaly {
  id: number;
  vehicleId: number;
  vehicleName?: string | null;
  detectedAt: string;
  receivedAt?: string;
  detectorType: string;
  confidence: number;
  severity: number;
  dimension: string;
  ackBy: string | null;
  ackAt?: string | null;
}

export async function fetchAnomalies(opts: {
  acked?: boolean;
  limit?: number;
} = {}): Promise<BackendAnomaly[]> {
  const params = new URLSearchParams();
  if (opts.acked !== undefined) params.set("acked", String(opts.acked));
  if (opts.limit !== undefined) params.set("limit", String(opts.limit));
  const qs = params.toString();
  const resp = await fetch(apiUrl(`/api/v1/anomalies${qs ? `?${qs}` : ""}`), {
    credentials: "include", // Cloudflare Access: send CF_Authorization cookie
  });
  if (!resp.ok) return [];
  const data = await resp.json();
  return Array.isArray(data.anomalies) ? data.anomalies : [];
}

export async function acknowledgeAnomaly(id: number): Promise<boolean> {
  const resp = await fetch(apiUrl(`/api/v1/anomalies/${id}/ack`), {
    method: "POST",
    credentials: "include", // Cloudflare Access: send CF_Authorization cookie
  });
  return resp.ok;
}
