// IoRT-DT: Authentication middleware using Cloudflare Access JWT.
// Validates JWT tokens and extracts operator roles from custom claims.
//
// Roles:
//   admin      — Full access (mission control, security settings)
//   operator   — Fleet monitoring, anomaly acknowledgment
//   researcher — Read-only access for dissertation data export

import type { Context, Next } from "hono";
import type { Env } from "../types";

/** Operator roles hierarchy. */
export type OperatorRole = "admin" | "operator" | "researcher";

/** Hono variable keys set by this middleware. */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface AuthVariables {
  operatorId: string;
  operatorRole: OperatorRole;
  operatorEmail: string;
}

/** Claims extracted from Cloudflare Access JWT. */
interface AccessClaims {
  sub: string;         // Operator UUID
  email: string;
  iss: string;
  aud: string[];
  iat: number;
  exp: number;
  nbf?: number;        // Not-before (optional)
  // Custom claims for role-based access
  role?: OperatorRole;
}

/** JWT clock-skew tolerance in seconds (fail-safe: rejects early, never late). */
const CLOCK_SKEW_SECONDS = 30;

/** Decode URL-safe base64 (JWT style) to a UTF-8 string, tolerating missing padding. */
export function decodeB64url(s: string): string {
  const normalized = s.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return atob(padded);
}

/** Decode URL-safe base64 (JWT style) to raw bytes. */
export function base64UrlToBytes(s: string): Uint8Array {
  const binary = decodeB64url(s);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/**
 * Verify an RS256 JWT signature against a public key.
 * Pure function (no network, no cache) — exported for unit testing.
 * Returns false for malformed tokens or failed verification; never throws.
 */
export async function verifyJwtSignature(publicKey: CryptoKey, jwt: string): Promise<boolean> {
  const parts = jwt.split(".");
  if (parts.length !== 3) return false;

  // JWT signing input is "<header_b64url>.<payload_b64url>"
  const signingInput = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const signature = base64UrlToBytes(parts[2]!);

  return crypto.subtle.verify(
    { name: "RSASSA-PKCS1-v1_5" },
    publicKey,
    signature,
    signingInput,
  );
}

/**
 * Validate that a token's `aud` claim includes the expected Access application AUD tag.
 * Returns true when the check is disabled (expectedAud unset) or the audience matches.
 * Exported for unit testing.
 */
export function validateAudience(actualAud: string[] | undefined, expectedAud?: string): boolean {
  if (!expectedAud) return true; // ACCESS_AUD not configured → check disabled (backward compat)
  return Array.isArray(actualAud) && actualAud.includes(expectedAud);
}

/**
 * Cloudflare Access JWT validation middleware.
 * In production, verifies the CF-Access-JWT-Assertion header against
 * Cloudflare's public keys. In development, bypasses with a dev token.
 */
export function requireAuth(minimumRole: OperatorRole = "researcher") {
  return async (c: Context<{ Bindings: Env; Variables: AuthVariables }>, next: Next) => {
    const env = c.env;

    // Skip auth in development (allows local testing without Access configured)
    if (env.ENVIRONMENT === "development") {
      c.set("operatorId" as never, "dev-operator" as never);
      c.set("operatorRole" as never, "admin" as never);
      return next();
    }

    // ── Path 1: machine service token (edge gateway, machine-to-machine) ──
    // The support-vessel gateway authenticates with `Authorization: Bearer
    // {INGEST_TOKEN}`. Timing-safe compare; fails closed.
    const authz = c.req.header("Authorization");
    if (authz?.startsWith("Bearer ")) {
      const presented = authz.slice("Bearer ".length);
      if (env.INGEST_TOKEN && timingSafeEqual(presented, env.INGEST_TOKEN)) {
        if (!isRoleAuthorized("operator", minimumRole)) {
          return c.json(
            { error: "Insufficient permissions", required: minimumRole, current: "service" },
            403
          );
        }
        c.set("operatorId" as never, "gateway" as never);
        c.set("operatorRole" as never, "operator" as never);
        c.set("operatorEmail" as never, "gateway@abyssal.local" as never);
        return next();
      }
      // Bearer presented but wrong → reject (fail closed, no fallthrough)
      return c.json({ error: "Invalid service token" }, 401);
    }

    // ── Path 2: Cloudflare Access JWT (human dashboard) ──
    const jwt =
      c.req.header("CF-Access-JWT-Assertion") ??
      getCookie(c.req.header("Cookie") ?? "", "CF_Authorization");

    if (!jwt) {
      return c.json(
        { error: "Authentication required", hint: "Missing CF-Access-JWT-Assertion header" },
        401
      );
    }

    try {
      // Pass the expected Access application AUD tag + pinned issuer so tokens
      // from other apps in the same Cloudflare org cannot be replayed here.
      const claims = await validateAccessJWT(jwt, env.ACCESS_AUD, env.ACCESS_ISSUER);

      // Check role authorization
      const role = claims.role ?? "researcher";
      if (!isRoleAuthorized(role, minimumRole)) {
        return c.json(
          { error: "Insufficient permissions", required: minimumRole, current: role },
          403
        );
      }

      // Attach claims to context for downstream handlers
      c.set("operatorId" as never, claims.sub as never);
      c.set("operatorRole" as never, role as never);
      c.set("operatorEmail" as never, claims.email as never);

      return next();
    } catch (err) {
      // Never leak internal error details (JWKS URLs, crypto errors) to clients in production
      const isProd = env.ENVIRONMENT === "production";
      return c.json(
        isProd
          ? { error: "Invalid authentication token" }
          : { error: "Invalid authentication token", details: String(err) },
        401
      );
    }
  };
}

/** Cloudflare Access JWKS keys include `kid` which is not in the TS stdlib JsonWebKey. */
interface AccessJwk extends JsonWebKey {
  kid?: string;
}

/** Constant-time string comparison (no early exit on length mismatch beyond length check). */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Module-level key cache — survives across requests within the same warm worker instance.
// Indexed by `kid`; entries expire after KEY_CACHE_TTL_MS (Cloudflare rotates Access keys,
// so a bounded TTL is safer than caching forever).
const KEY_CACHE_TTL_MS = 5 * 60 * 1000;
const keyCache = new Map<string, { key: CryptoKey; fetchedAt: number }>();

/**
 * Validate a JWT issuer claim. An issuer is trusted ONLY when:
 *  1. It exactly matches the configured `expectedIssuer` (ACCESS_ISSUER), OR
 *  2. It is an https host under `*.cloudflareaccess.com` (Cloudflare-controlled
 *     namespace — an attacker cannot host a JWKS there).
 * This pins the key source and defeats the key-confusion attack where a forged
 * token sets `iss` to an attacker-controlled host serving a fake JWKS.
 */
export function validateIssuer(actualIss: string | undefined, expectedIssuer?: string): boolean {
  if (!actualIss) return false;
  let u: URL;
  try {
    u = new URL(actualIss);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase();
  if (expectedIssuer) {
    try {
      const expected = new URL(expectedIssuer);
      if (expected.protocol === "https:" && expected.hostname.toLowerCase() === host) return true;
    } catch {
      /* fall through to namespace check */
    }
  }
  return host === "cloudflareaccess.com" || host.endsWith(".cloudflareaccess.com");
}

/**
 * Validate Cloudflare Access JWT using RS256 signature verification.
 *
 * CRITICAL (security): the JWKS endpoint is derived ONLY from the configured
 * `expectedIssuer` (ACCESS_ISSUER) or a Cloudflare-controlled `*.cloudflareaccess.com`
 * issuer validated by `validateIssuer`. It is NEVER derived from an arbitrary
 * `iss` claim — that was the key-confusion bypass.
 *
 * @param expectedAud Cloudflare Access application AUD tag. When provided, tokens
 *   whose `aud` does not include it are rejected (prevents cross-app confusion).
 * @param expectedIssuer Pinned issuer (ACCESS_ISSUER). When absent, only
 *   `*.cloudflareaccess.com` issuers are accepted.
 */
export async function validateAccessJWT(
  jwt: string,
  expectedAud?: string,
  expectedIssuer?: string,
): Promise<AccessClaims> {
  const parts = jwt.split(".");
  if (parts.length !== 3) throw new Error("Malformed JWT");

  // Decode header and payload (no crypto yet)
  const header = JSON.parse(decodeB64url(parts[0]!)) as { kid?: string; alg?: string };
  const payload = JSON.parse(decodeB64url(parts[1]!)) as AccessClaims;

  // 1. Algorithm enforcement — reject anything that is not RS256
  if (header.alg !== "RS256") throw new Error("Unsupported JWT algorithm");

  // 2. Time validation (exp/iat/nbf) with clock-skew tolerance
  const now = Date.now() / 1000;
  if (!payload.exp) throw new Error("JWT missing expiration (exp)");
  if (payload.exp < now - CLOCK_SKEW_SECONDS) throw new Error("Token expired");
  if (payload.iat && payload.iat > now + CLOCK_SKEW_SECONDS) {
    throw new Error("Token issued in the future");
  }
  if (payload.nbf && payload.nbf > now + CLOCK_SKEW_SECONDS) {
    throw new Error("Token not yet valid (nbf)");
  }
  if (!payload.iss) throw new Error("JWT missing issuer (iss)");

  // 3. ISSUER PINNING — the key source must be Cloudflare-controlled or the
  //    configured issuer. Never trust the token's iss for the JWKS endpoint.
  if (!validateIssuer(payload.iss, expectedIssuer)) {
    throw new Error("JWT issuer not trusted");
  }

  // 4. Audience validation — prevents replaying tokens issued for other applications.
  if (!validateAudience(payload.aud, expectedAud)) {
    throw new Error("JWT audience mismatch");
  }

  // 5. Fetch Cloudflare Access public keys from the TRUSTED issuer only
  const issuerBase = expectedIssuer ? expectedIssuer.replace(/\/+$/, "") : payload.iss;
  const certsUrl = `${issuerBase}/cdn-cgi/access/certs`;
  const { keys } = await fetch(certsUrl).then((r) => {
    if (!r.ok) throw new Error(`Failed to fetch Access certs: HTTP ${r.status}`);
    return r.json<{ keys: AccessJwk[] }>();
  });

  // 6. Require the kid to match a presented key (no silent keys[0] fallback)
  if (!header.kid) throw new Error("JWT missing key id (kid)");
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error("No matching public key in Cloudflare Access certs");

  // 7. Import + cache the CryptoKey (TTL-bounded)
  const cacheKey = jwk.kid ?? "default";
  const nowMs = Date.now();
  let entry = keyCache.get(cacheKey);
  if (!entry || nowMs - entry.fetchedAt > KEY_CACHE_TTL_MS) {
    const key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    entry = { key, fetchedAt: nowMs };
    keyCache.set(cacheKey, entry);
  }

  // 8. Verify RS256 signature over the signing input "<header_b64url>.<payload_b64url>"
  const valid = await verifyJwtSignature(entry.key, jwt);
  if (!valid) throw new Error("JWT signature verification failed");

  return payload;
}

/**
 * WebSocket upgrade auth: accept either a valid service token (query `token` or
 * `Authorization: Bearer`) or a valid Cloudflare Access JWT. Used by /ws/live
 * before proxying to the Durable Object — the gossip channel must not be open.
 */
export async function authenticateRequest(c: Context<{ Bindings: Env }>): Promise<boolean> {
  const env = c.env;
  const authz = c.req.header("Authorization");
  const presented = authz?.startsWith("Bearer ")
    ? authz.slice("Bearer ".length)
    : c.req.query("token");
  if (presented && env.INGEST_TOKEN && timingSafeEqual(presented, env.INGEST_TOKEN)) {
    return true;
  }
  const jwt = c.req.header("CF-Access-JWT-Assertion");
  if (jwt) {
    try {
      await validateAccessJWT(jwt, env.ACCESS_AUD, env.ACCESS_ISSUER);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

/** Check if a role meets the minimum required level. */
export function isRoleAuthorized(role: OperatorRole, minimum: OperatorRole): boolean {
  const hierarchy: Record<OperatorRole, number> = {
    admin: 3,
    operator: 2,
    researcher: 1,
  };
  return (hierarchy[role] ?? 0) >= (hierarchy[minimum] ?? 0);
}

/** Extract a cookie value by name. */
function getCookie(cookies: string, name: string): string | undefined {
  const match = cookies.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match?.[1];
}
