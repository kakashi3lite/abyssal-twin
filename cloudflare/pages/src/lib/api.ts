// API client for Abyssal Twin Workers backend.
// All endpoints are relative — Vite proxy handles routing in dev,
// Cloudflare Pages routes handle it in production.

const BASE = "/api/v1";

export async function fetchFleetStatus() {
  const res = await fetch(`${BASE}/fleet/status`);
  if (!res.ok) throw new Error(`Fleet status failed: ${res.status}`);
  return res.json();
}

export async function fetchFleetHistory(vehicleId: number, from?: string, to?: string) {
  const params = new URLSearchParams({ vehicleId: String(vehicleId) });
  if (from) params.set("from", from);
  if (to) params.set("to", to);

  const res = await fetch(`${BASE}/fleet/history?${params}`);
  if (!res.ok) throw new Error(`Fleet history failed: ${res.status}`);
  return res.json();
}

export async function fetchAnomalies(opts?: {
  vehicleId?: number;
  acked?: boolean;
  limit?: number;
}) {
  const params = new URLSearchParams();
  if (opts?.vehicleId) params.set("vehicleId", String(opts.vehicleId));
  if (opts?.acked !== undefined) params.set("acked", String(opts.acked));
  if (opts?.limit) params.set("limit", String(opts.limit));

  const res = await fetch(`${BASE}/anomalies?${params}`);
  if (!res.ok) throw new Error(`Anomalies fetch failed: ${res.status}`);
  return res.json();
}

export async function acknowledgeAnomaly(id: number, operatorId: string) {
  const res = await fetch(`${BASE}/anomalies/${id}/ack`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operatorId }),
  });
  if (!res.ok) throw new Error(`Acknowledge failed: ${res.status}`);
  return res.json();
}

export async function fetchMissions() {
  const res = await fetch(`${BASE}/missions`);
  if (!res.ok) throw new Error(`Missions fetch failed: ${res.status}`);
  return res.json();
}

export async function createMission(name: string, notes?: string) {
  const res = await fetch(`${BASE}/missions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, notes }),
  });
  if (!res.ok) throw new Error(`Mission create failed: ${res.status}`);
  return res.json();
}
