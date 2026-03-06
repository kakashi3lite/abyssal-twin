// Vitest configuration for Cloudflare Workers integration testing.
// Uses @cloudflare/vitest-pool-workers to run tests in the Workers runtime,
// giving us access to D1, Durable Objects, R2, and the full Hono API.

import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: {
          configPath: "./wrangler.toml",
          environment: "dev",
        },
        miniflare: {
          d1Databases: ["FLEET_DB"],
          r2Buckets: ["MISSION_STORE"],
          durableObjects: {
            FEDERATION_COORDINATOR: "FederationCoordinator",
          },
        },
      },
    },
  },
});
