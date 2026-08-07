// Type declarations for the Cloudflare Workers test environment.
// Augments ProvidedEnv with our specific bindings from wrangler.toml.

import type { Env } from "../src/types";

declare module "cloudflare:test" {
  interface ProvidedEnv extends Env {}
}
