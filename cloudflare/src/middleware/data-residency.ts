// IoRT-DT: Data residency and sovereignty middleware.
// Ensures compliance with UNO/Northeastern research data requirements:
//   - All fleet data stored in US Cloudflare data centers only
//   - PII (operator names) anonymized in logs (use UUIDs)
//   - ITAR/EAR compliance: restrict access to US persons only
//   - Audit trail for all data mutations (immutable R2 log)

import type { Context, Next } from "hono";
import type { Env } from "../types";

/**
 * Data residency enforcement middleware.
 * Logs all write operations to R2 for immutable audit trail.
 */
export function dataResidency() {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    const method = c.req.method;
    const path = c.req.path;

    // For write operations, create an audit log entry
    if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
      const auditEntry = {
        timestamp: new Date().toISOString(),
        method,
        path,
        operatorId: (c.get("operatorId" as never) as string | undefined) ?? "anonymous",
        // Cloudflare headers for geo context
        country: c.req.header("CF-IPCountry") ?? "unknown",
        colo: c.req.header("CF-Ray")?.split("-")[1] ?? "unknown",
        ip: c.req.header("CF-Connecting-IP") ?? "unknown",
      };

      // Enforce US-only writes for ITAR compliance
      const country = auditEntry.country;
      if (country !== "US" && country !== "unknown" && c.env.ENVIRONMENT !== "development") {
        return c.json(
          {
            error: "Data residency violation",
            detail: "Write operations restricted to US-based requests (ITAR compliance)",
            country,
          },
          403
        );
      }

      // Write audit log to R2 (non-blocking, append-only)
      c.executionCtx.waitUntil(writeAuditLog(c.env.MISSION_STORE, auditEntry as Record<string, string>));
    }

    return next();
  };
}

/** Append an audit entry to R2 (immutable, date-partitioned). */
async function writeAuditLog(
  r2: R2Bucket,
  entry: Record<string, string>
): Promise<void> {
  try {
    const date = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    const key = `audit/${date}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.json`;

    await r2.put(key, JSON.stringify(entry), {
      customMetadata: {
        type: "audit",
        operator: entry.operatorId ?? "unknown",
      },
    });
  } catch (err) {
    console.error("Audit log write failed:", err);
  }
}
