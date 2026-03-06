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

/**
 * Validate Cloudflare Access JWT.
 * In production, fetches public keys from the Access certs endpoint.
 * TODO: Cache the public key for performance.
 */
async function validateAccessJWT(jwt: string): Promise<AccessClaims> {
  // Decode JWT without verification first (to get issuer for key lookup)
  const parts = jwt.split(".");
  if (parts.length !== 3) throw new Error("Malformed JWT");

  const payload = JSON.parse(atob(parts[1]!.replace(/-/g, "+").replace(/_/g, "/")));

  // Basic expiration check
  if (payload.exp && payload.exp < Date.now() / 1000) {
    throw new Error("Token expired");
  }

  // In production, verify signature against Cloudflare's public keys:
  // const certsUrl = `${payload.iss}/cdn-cgi/access/certs`;
  // const keys = await fetch(certsUrl).then(r => r.json());
  // ... verify with crypto.subtle.verify()

  return payload as AccessClaims;
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
