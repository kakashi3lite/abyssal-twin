// Unit tests for the JWT auth middleware.
// These test the pure functions (signature verification, role hierarchy, base64url)
// without requiring the full Workers runtime or network access to Cloudflare JWKS.

import { describe, it, expect } from "vitest";
import {
  verifyJwtSignature,
  isRoleAuthorized,
  validateAudience,
  validateIssuer,
  timingSafeEqual,
  decodeB64url,
  base64UrlToBytes,
} from "../src/middleware/auth";

// ─── Test Helpers ───────────────────────────────────────────────────────────

/** URL-safe base64 encode (no padding), as used in JWTs. */
function encodeB64url(data: string | Uint8Array): string {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Generate an RS256 key pair (same algorithm family as Cloudflare Access). */
async function generateKeyPair(): Promise<CryptoKeyPair> {
  const pair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  // TS's WebCrypto overloads don't always narrow RsaHashedKeyGenParams → CryptoKeyPair
  return pair as CryptoKeyPair;
}

interface SignedJwt {
  jwt: string;
  signingInput: string;
}

/** Build a signed RS256 JWT from header/payload. */
async function signJwt(
  privateKey: CryptoKey,
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
): Promise<SignedJwt> {
  const signingInput = `${encodeB64url(JSON.stringify(header))}.${encodeB64url(
    JSON.stringify(payload),
  )}`;
  const signature = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    privateKey,
    new TextEncoder().encode(signingInput),
  );
  return { jwt: `${signingInput}.${encodeB64url(new Uint8Array(signature))}`, signingInput };
}

const nowSec = () => Math.floor(Date.now() / 1000);
const validHeader = { alg: "RS256", kid: "test-key" };
const sampleClaims = (overrides: Record<string, unknown> = {}) => ({
  sub: "operator-1",
  email: "op@example.com",
  iss: "https://test.cloudflareaccess.com",
  aud: ["test-aud"],
  iat: nowSec(),
  exp: nowSec() + 3600,
  role: "operator",
  ...overrides,
});

// ─── Signature Verification ─────────────────────────────────────────────────

describe("verifyJwtSignature", () => {
  it("accepts a token with a valid RS256 signature", async () => {
    const { publicKey, privateKey } = await generateKeyPair();
    const { jwt } = await signJwt(privateKey, validHeader, sampleClaims());
    await expect(verifyJwtSignature(publicKey, jwt)).resolves.toBe(true);
  });

  it("rejects a token whose payload was tampered with (privilege escalation)", async () => {
    const { publicKey, privateKey } = await generateKeyPair();
    const { jwt } = await signJwt(privateKey, validHeader, sampleClaims({ role: "researcher" }));

    // Swap the payload to claim admin WITHOUT re-signing — must fail
    const [h, , s] = jwt.split(".");
    const forged = `${h}.${encodeB64url(JSON.stringify(sampleClaims({ role: "admin" })))}.${s}`;
    await expect(verifyJwtSignature(publicKey, forged)).resolves.toBe(false);
  });

  it("rejects a token with a corrupted signature", async () => {
    const { publicKey, privateKey } = await generateKeyPair();
    const { jwt } = await signJwt(privateKey, validHeader, sampleClaims());
    const corrupted = `${jwt.slice(0, -4)}AAAA`;
    await expect(verifyJwtSignature(publicKey, corrupted)).resolves.toBe(false);
  });

  it("rejects a token signed with a different key", async () => {
    const { publicKey } = await generateKeyPair();
    const { privateKey: otherKey } = await generateKeyPair();
    const { jwt } = await signJwt(otherKey, validHeader, sampleClaims());
    await expect(verifyJwtSignature(publicKey, jwt)).resolves.toBe(false);
  });

  it("returns false (never throws) for malformed tokens", async () => {
    const { publicKey } = await generateKeyPair();
    await expect(verifyJwtSignature(publicKey, "only-two.parts")).resolves.toBe(false);
    await expect(verifyJwtSignature(publicKey, "")).resolves.toBe(false);
  });
});

// ─── Role Hierarchy ─────────────────────────────────────────────────────────

describe("isRoleAuthorized", () => {
  it("admin satisfies all minimums", () => {
    expect(isRoleAuthorized("admin", "admin")).toBe(true);
    expect(isRoleAuthorized("admin", "operator")).toBe(true);
    expect(isRoleAuthorized("admin", "researcher")).toBe(true);
  });

  it("operator satisfies operator and researcher, not admin", () => {
    expect(isRoleAuthorized("operator", "operator")).toBe(true);
    expect(isRoleAuthorized("operator", "researcher")).toBe(true);
    expect(isRoleAuthorized("operator", "admin")).toBe(false);
  });

  it("researcher satisfies only researcher", () => {
    expect(isRoleAuthorized("researcher", "researcher")).toBe(true);
    expect(isRoleAuthorized("researcher", "operator")).toBe(false);
    expect(isRoleAuthorized("researcher", "admin")).toBe(false);
  });

  it("unknown roles are treated as the lowest privilege", () => {
    // @ts-expect-error deliberately passing an invalid role string
    expect(isRoleAuthorized("superuser", "researcher")).toBe(false);
  });
});

// ─── Audience Validation (ACCESS_AUD) ────────────────────────────────────────

describe("validateAudience", () => {
  const expectedAud = "a3b81afd706fb532bda52de8cb1d3c2db0b4bdead8721ecab4a641d60f8165f4";

  it("accepts a token whose aud includes the expected AUD tag", () => {
    expect(validateAudience([expectedAud, "other-app"], expectedAud)).toBe(true);
  });

  it("rejects a token whose aud does not include the expected AUD tag", () => {
    // Token issued by a DIFFERENT Access application in the same org
    expect(validateAudience(["4f2f9ac31d0e4dca2b93f8d72f55ef1f9c3a8b1c0d3e4f5a6b7c8d9e0f1a2b3c"], expectedAud)).toBe(false);
  });

  it("rejects missing or malformed aud claims", () => {
    expect(validateAudience(undefined, expectedAud)).toBe(false);
    expect(validateAudience([], expectedAud)).toBe(false);
  });

  it("passes through when ACCESS_AUD is unset (backward compat)", () => {
    expect(validateAudience(undefined, undefined)).toBe(true);
    expect(validateAudience(["anything"], undefined)).toBe(true);
  });
});

// ─── Issuer Pinning (key-confusion defense) ─────────────────────────────────
// CVE-class bug being tested: the worker previously fetched JWKS from
// `${payload.iss}/cdn-cgi/access/certs` — the attacker-controlled `iss` claim.
// An attacker could host a fake JWKS and mint `role: admin` tokens.

describe("validateIssuer", () => {
  const pinned = "https://abyssal-twin.dalecabra.com";

  it("accepts the exact pinned issuer (ACCESS_ISSUER)", () => {
    expect(validateIssuer(pinned, pinned)).toBe(true);
    expect(validateIssuer(`${pinned}/`, pinned)).toBe(true);
  });

  it("accepts Cloudflare-controlled *.cloudflareaccess.com issuers", () => {
    expect(validateIssuer("https://team.cloudflareaccess.com", pinned)).toBe(true);
    expect(validateIssuer("https://abyssal-twin.cloudflareaccess.com", pinned)).toBe(true);
  });

  it("rejects attacker-controlled issuer (the key-confusion attack)", () => {
    // Attacker sets iss to their own host serving a fake JWKS — must be rejected
    expect(validateIssuer("https://evil.example.com", pinned)).toBe(false);
    expect(validateIssuer("https://evil.example.com/cdn-cgi/access/certs", pinned)).toBe(false);
    expect(validateIssuer("https://attacker.com", undefined)).toBe(false);
  });

  it("rejects non-https or malformed issuers", () => {
    expect(validateIssuer("http://team.cloudflareaccess.com", pinned)).toBe(false);
    expect(validateIssuer("not-a-url", pinned)).toBe(false);
    expect(validateIssuer(undefined, pinned)).toBe(false);
    expect(validateIssuer("cloudflareaccess.com", pinned)).toBe(false); // no scheme
  });

  it("rejects lookalike domains (typosquatting)", () => {
    expect(validateIssuer("https://cloudflareaccess.com.evil.example", pinned)).toBe(false);
    expect(validateIssuer("https://notcloudflareaccess.com", pinned)).toBe(false);
  });
});

// ─── Timing-Safe Comparison ─────────────────────────────────────────────────

describe("timingSafeEqual", () => {
  it("returns true for identical strings", () => {
    expect(timingSafeEqual("secret-token-123", "secret-token-123")).toBe(true);
  });

  it("returns false for different strings of equal length", () => {
    expect(timingSafeEqual("secret-token-123", "secret-token-124")).toBe(false);
  });

  it("returns false for different lengths", () => {
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
    expect(timingSafeEqual("", "x")).toBe(false);
  });
});

// ─── Base64url Robustness ───────────────────────────────────────────────────

describe("base64url decoding", () => {
  it("decodes padded and unpadded URL-safe base64 equivalently", () => {
    const json = JSON.stringify({ alg: "RS256" });
    const unpadded = encodeB64url(json); // JWT form: no '=' padding
    const withPadding = unpadded + "=".repeat((4 - (unpadded.length % 4)) % 4);
    expect(decodeB64url(unpadded)).toBe(json);
    expect(decodeB64url(withPadding)).toBe(json);
  });

  it("restores the '=' padding that atob requires", () => {
    // "ab" encodes to "YWI=" (1 pad); the JWT form strips it to "YWI"
    expect(decodeB64url("YWI")).toBe("ab");
    expect(decodeB64url("YWI=")).toBe("ab");
  });

  it("round-trips signature bytes through URL-safe encoding", () => {
    const sig = new Uint8Array([0xfb, 0xff, 0x3e, 0x12, 0x7a, 0x90, 0x00, 0x01]);
    const encoded = encodeB64url(sig);
    expect(Array.from(base64UrlToBytes(encoded))).toEqual(Array.from(sig));
  });
});

// ─── requireAuth: service-token path (production env) ───────────────────────
// The edge gateway authenticates machine-to-machine with `Authorization: Bearer
// {INGEST_TOKEN}`. In production this must be accepted (operator role) and any
// wrong/missing token must fail closed.

import { Hono } from "hono";
import { requireAuth } from "../src/middleware/auth";
import type { Env } from "../src/types";

describe("requireAuth service-token path (production)", () => {
  const PROD_TOKEN = "prod-ingest-token-1234567890abcdef";
  const PROD_ENV: Env = {
    ENVIRONMENT: "production",
    ACCESS_AUD: "a3b81afd706fb532bda52de8cb1d3c2db0b4bdead8721ecab4a641d60f8165f4",
    ACCESS_ISSUER: "https://abyssal-twin.dalecabra.com",
    ALLOWED_ORIGIN: "https://abyssal-twin.dalecabra.com",
    INGEST_TOKEN: PROD_TOKEN,
  } as unknown as Env;

  function buildApp() {
    const app = new Hono<{ Bindings: Env }>();
    app.get("/protected", requireAuth("researcher"), (c) => c.json({ ok: true }));
    app.get("/admin-only", requireAuth("admin"), (c) => c.json({ ok: true }));
    return app;
  }

  it("accepts the correct gateway service token (operator role)", async () => {
    const app = buildApp();
    const res = await app.request(
      "https://test.local/protected",
      { headers: { Authorization: `Bearer ${PROD_TOKEN}` } },
      PROD_ENV,
    );
    expect(res.status).toBe(200);
  });

  it("rejects a wrong service token (fail closed)", async () => {
    const app = buildApp();
    const res = await app.request(
      "https://test.local/protected",
      { headers: { Authorization: "Bearer wrong-token" } },
      PROD_ENV,
    );
    expect(res.status).toBe(401);
  });

  it("rejects missing credentials (fail closed)", async () => {
    const app = buildApp();
    const res = await app.request("https://test.local/protected", {}, PROD_ENV);
    expect(res.status).toBe(401);
  });

  it("service token cannot escalate to admin-only routes", async () => {
    const app = buildApp();
    const res = await app.request(
      "https://test.local/admin-only",
      { headers: { Authorization: `Bearer ${PROD_TOKEN}` } },
      PROD_ENV,
    );
    expect(res.status).toBe(403); // operator < admin
  });

  it("service token rejected when INGEST_TOKEN unconfigured (fail closed)", async () => {
    const app = new Hono<{ Bindings: Env }>();
    app.get("/protected", requireAuth("researcher"), (c) => c.json({ ok: true }));
    const noTokenEnv = { ...PROD_ENV, INGEST_TOKEN: "" } as Env;
    const res = await app.request(
      "https://test.local/protected",
      { headers: { Authorization: `Bearer whatever` } },
      noTokenEnv,
    );
    expect(res.status).toBe(401);
  });
});
