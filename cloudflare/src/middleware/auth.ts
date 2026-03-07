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
  // Custom claims for role-based access
  role?: OperatorRole;
}

/**
 * Cloudflare Access JWT validation middleware.
 * In production, verifies the CF-Access-JWT-Assertion header against
 * Cloudflare's public keys. In development, bypasses with a dev token.
 */
export function requireAuth(minimumRole: OperatorRole = "researcher") {
  return async (c: Context<{ Bindings: Env; Variables: AuthVariables }>, next: Next) => {
    const env = c.env.ENVIRONMENT;

    // Skip auth in development (allows local testing without Access configured)
    if (env === "development") {
      c.set("operatorId" as never, "dev-operator" as never);
      c.set("operatorRole" as never, "admin" as never);
      return next();
    }

    // Extract CF-Access-JWT-Assertion from header or cookie
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
      const claims = await validateAccessJWT(jwt);

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
      return c.json(
        { error: "Invalid authentication token", details: String(err) },
        401
      );
    }
  };
}

/** Cloudflare Access JWKS keys include `kid` which is not in the TS stdlib JsonWebKey. */
interface AccessJwk extends JsonWebKey {
  kid?: string;
}

// Module-level key cache — survives across requests within the same warm worker instance.
// Indexed by `kid` from the JWT header; effectively evicted on worker restart (CF manages this).
const keyCache = new Map<string, CryptoKey>();

/**
 * Validate Cloudflare Access JWT using RS256 signature verification.
 * Fetches JWKS from `<issuer>/cdn-cgi/access/certs` on first use per key ID,
 * then caches the imported CryptoKey for the lifetime of the worker instance.
 */
async function validateAccessJWT(jwt: string): Promise<AccessClaims> {
  const parts = jwt.split(".");
  if (parts.length !== 3) throw new Error("Malformed JWT");

  const decodeB64url = (s: string) => atob(s.replace(/-/g, "+").replace(/_/g, "/"));

  // Decode header and payload (no crypto yet — need iss for key lookup)
  const header = JSON.parse(decodeB64url(parts[0]!)) as { kid?: string; alg?: string };
  const payload = JSON.parse(decodeB64url(parts[1]!)) as AccessClaims;

  // 1. Expiration check (fast path — avoids unnecessary key fetch on expired tokens)
  if (payload.exp && payload.exp < Date.now() / 1000) {
    throw new Error("Token expired");
  }
  if (!payload.iss) throw new Error("JWT missing issuer (iss)");

  // 2. Fetch Cloudflare Access public keys (JWKS endpoint)
  const certsUrl = `${payload.iss}/cdn-cgi/access/certs`;
  const { keys } = await fetch(certsUrl).then((r) => {
    if (!r.ok) throw new Error(`Failed to fetch Access certs: HTTP ${r.status}`);
    return r.json<{ keys: AccessJwk[] }>();
  });

  // 3. Select key matching the JWT header's kid, or fall back to first key
  const jwk = header.kid ? keys.find((k) => k.kid === header.kid) : keys[0];
  if (!jwk) throw new Error("No matching public key in Cloudflare Access certs");

  const cacheKey = jwk.kid ?? "default";

  // 4. Import + cache the CryptoKey (importKey is expensive; only done once per kid)
  let cryptoKey = keyCache.get(cacheKey);
  if (!cryptoKey) {
    cryptoKey = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    keyCache.set(cacheKey, cryptoKey);
  }

  // 5. Verify RS256 signature over the signing input "<header_b64>.<payload_b64>"
  const signingInput = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const signature = Uint8Array.from(decodeB64url(parts[2]!), (c) => c.charCodeAt(0));

  const valid = await crypto.subtle.verify(
    { name: "RSASSA-PKCS1-v1_5" },
    cryptoKey,
    signature,
    signingInput,
  );
  if (!valid) throw new Error("JWT signature verification failed");

  return payload;
}

/** Check if a role meets the minimum required level. */
function isRoleAuthorized(role: OperatorRole, minimum: OperatorRole): boolean {
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
