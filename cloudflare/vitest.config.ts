// Vitest configuration for Cloudflare Workers integration testing.
// Uses @cloudflare/vitest-pool-workers to run tests in the Workers runtime,
// giving us access to D1, Durable Objects, R2, and the full Hono API.

import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    // Exclude macOS AppleDouble sidecar files (._*.test.ts) — binary junk that
    // esbuild cannot parse. Created automatically on external/APFS volumes.
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/cypress/**",
      "**/.{idea,git,cache,output,temp}/**",
      "**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build,eslint,prettier}.config.*",
      "**/._*",
    ],
    poolOptions: {
      workers: {
        // DO WebSocket Hibernation handlers (webSocketMessage / webSocketClose)
        // write to durable storage asynchronously, after the test's storage
        // snapshot context has ended — the isolated-storage rollback cannot
        // track those writes and fails. Disable isolation for DO integration
        // tests (state is scoped by distinct auvIds per test).
        isolatedStorage: false,
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
