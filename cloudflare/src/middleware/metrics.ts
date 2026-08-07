// IoRT-DT: Observability middleware and metrics collection.
// Custom metrics for monitoring satellite bandwidth usage, sync lag,
// partition duration, and compression ratios.

import type { Context, Next } from "hono";
import type { Env } from "../types";

// ─── Metrics Counters (in-memory, checkpointed to D1 by DO alarm) ────────

interface MetricsSnapshot {
  timestamp: string;
  // Satellite bandwidth usage
  satelliteBytesUploaded: number;
  satelliteBytesDownloaded: number;
  // Compression ratio (from vessel ingest batches)
  compressionRatioSum: number;
  compressionSamples: number;
  // Sync lag (delay between vessel detection and cloud receipt)
  syncLagSumMs: number;
  syncLagSamples: number;
  // Partition tracking
  activePartitions: number;
  partitionEventsTotal: number;
  // API metrics
  requestsTotal: number;
  errorsTotal: number;
}

// Singleton metrics state per Worker isolate
let currentMetrics: MetricsSnapshot = newMetricsSnapshot();

function newMetricsSnapshot(): MetricsSnapshot {
  return {
    timestamp: new Date().toISOString(),
    satelliteBytesUploaded: 0,
    satelliteBytesDownloaded: 0,
    compressionRatioSum: 0,
    compressionSamples: 0,
    syncLagSumMs: 0,
    syncLagSamples: 0,
    activePartitions: 0,
    partitionEventsTotal: 0,
    requestsTotal: 0,
    errorsTotal: 0,
  };
}

/** Record satellite bytes uploaded (from ingest endpoint). */
export function recordSatelliteUpload(bytes: number): void {
  currentMetrics.satelliteBytesUploaded += bytes;
}

/** Record compression ratio observation. */
export function recordCompressionRatio(ratio: number): void {
  currentMetrics.compressionRatioSum += ratio;
  currentMetrics.compressionSamples++;
}

/** Record sync lag between vessel detection and cloud receipt. */
export function recordSyncLag(lagMs: number): void {
  currentMetrics.syncLagSumMs += lagMs;
  currentMetrics.syncLagSamples++;
}

/** Increment partition event counter. */
export function recordPartitionEvent(): void {
  currentMetrics.partitionEventsTotal++;
}

/** Get current metrics snapshot (for /metrics endpoint). */
export function getMetrics(): MetricsSnapshot & { derived: Record<string, number> } {
  const avgCompression =
    currentMetrics.compressionSamples > 0
      ? currentMetrics.compressionRatioSum / currentMetrics.compressionSamples
      : 0;

  const avgSyncLag =
    currentMetrics.syncLagSamples > 0
      ? currentMetrics.syncLagSumMs / currentMetrics.syncLagSamples
      : 0;

  return {
    ...currentMetrics,
    derived: {
      averageCompressionRatio: avgCompression,
      averageSyncLagMs: avgSyncLag,
      satelliteBytesUploadedKB: currentMetrics.satelliteBytesUploaded / 1024,
      errorRate:
        currentMetrics.requestsTotal > 0
          ? currentMetrics.errorsTotal / currentMetrics.requestsTotal
          : 0,
    },
  };
}

/** Reset metrics (called after checkpoint to D1). */
export function resetMetrics(): void {
  currentMetrics = newMetricsSnapshot();
}

/**
 * Request metrics middleware: tracks request count and latency.
 */
export function metricsMiddleware() {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    currentMetrics.requestsTotal++;
    const start = Date.now();

    try {
      await next();
    } catch (err) {
      currentMetrics.errorsTotal++;
      throw err;
    }

    // Log slow requests (>500ms — may indicate satellite latency issues)
    const duration = Date.now() - start;
    if (duration > 500) {
      console.warn(
        `[Metrics] Slow request: ${c.req.method} ${c.req.path} took ${duration}ms`
      );
    }
  };
}
