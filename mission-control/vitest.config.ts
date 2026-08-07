// Vitest config for mission-control.
// Excludes macOS AppleDouble sidecar files (._*.test.ts) — binary junk that
// esbuild cannot parse; the external volume regenerates them on every write.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/._*",
    ],
  },
});
