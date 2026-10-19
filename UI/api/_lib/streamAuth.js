/**
 * Stream access control for the remote (VPS) video path.
 *
 * VEIL's Vercel functions are the identity provider for MediaMTX:
 *   - operators sign in → short-lived "read" JWT for a camera path
 *   - the Raspberry Pi signs in with its device key → short-lived "publish" JWT
 *   - MediaMTX (authMethod: jwt) validates both against GET /api/stream/jwks
 *
 * No video ever flows through these functions. Plain ESM + node:crypto so the
 * same file runs on Vercel, under vitest and in the local e2e harness.
 *
 * Environment (see UI/.env.stream.example):
 *   STREAM_JWT_PRIVATE_KEY          PKCS#8 PEM, RSA ≥ 2048 (RS256)
 *   STREAM_JWT_EXTRA_PUBLIC_KEYS    optional SPKI PEM(s) also published in the JWKS — the next key
 *                                   before a rotation, the old one after (docs/streaming/security.md)
 *   STREAM_JWT_ISSUER               must equal MediaMTX authJWTIssuer
 *   STREAM_JWT_AUDIENCE             must equal MediaMTX authJWTAudience (default "mediamtx")
 *   STREAM_SESSION_SECRET           ≥ 32 chars, signs the operator session cookie
 *   STREAM_VIEWERS                  JSON [{ "user", "hash", "paths": ["cam"] }]
 *   STREAM_PUBLISHERS               JSON [{ "id", "hash", "path": "cam" }]
 *   STREAM_WHEP_BASE                public HTTPS origin of MediaMTX, e.g. https://media.example.com
 *   STREAM_VIEW_TOKEN_TTL           seconds, default 120
 *   STREAM_PUBLISH_TOKEN_TTL        seconds, default 300
 *   STREAM_SESSION_TTL              seconds, default 43200 (12 h)
 */
import crypto from "node:crypto";

export const SESSION_COOKIE = "veil_stream_session";
const PATH_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const NAME_RE = /^[A-Za-z0-9._@-]{1,64}$/;

// ─── Config ──────────────────────────────────────────────────────────────────

export class ConfigError extends Error {}

/** @param {Record<string, string | undefined>} env */
export function loadConfig(env = process.env) {
  const missing = ["STREAM_JWT_PRIVATE_KEY", "STREAM_JWT_ISSUER", "STREAM_SESSION_SECRET", "STREAM_WHEP_BASE"]
    .filter((k) => !env[k]);
  if (missing.length) throw new ConfigError(`Missing ${missing.join(", ")}`);

  const privateKey = crypto.createPrivateKey(pemFromEnv(env.STREAM_JWT_PRIVATE_KEY));
  if (privateKey.asymmetricKeyType !== "rsa" || (privateKey.asymmetricKeyDetails?.modulusLength ?? 0) < 2048) {
    throw new ConfigError("STREAM_JWT_PRIVATE_KEY must be an RSA key of at least 2048 bits");
  }
  const sessionSecret = String(env.STREAM_SESSION_SECRET);
  if (sessionSecret.length < 32) throw new ConfigError("STREAM_SESSION_SECRET must be at least 32 characters");

  const whepBase = new URL(String(env.STREAM_WHEP_BASE));
  if (whepBase.protocol !== "https:" && !isLoopback(whepBase.hostname)) {
    throw new ConfigError("STREAM_WHEP_BASE must use https:// (http is allowed only for localhost testing)");
  }

  // MediaMTX v1.21 fetches the JWKS once and never refreshes it on an unknown kid, so a new
  // signing key must be published here (and MediaMTX restarted) before it is used.
  const publicKeys = [crypto.createPublicKey(privateKey)];
  const extra = pemFromEnv(env.STREAM_JWT_EXTRA_PUBLIC_KEYS ?? "").match(/-----BEGIN PUBLIC KEY-----[\s\S]+?-----END PUBLIC KEY-----/g) ?? [];
  for (const pem of extra) {
    const key = crypto.createPublicKey(pem);
    if (thumbprint(key) !== thumbprint(publicKeys[0])) publicKeys.push(key);
  }

  return {
    privateKey,
    kid: thumbprint(publicKeys[0]),
    publicKeys,
    issuer: String(env.STREAM_JWT_ISSUER),
    audience: env.STREAM_JWT_AUDIENCE || "mediamtx",
    sessionSecret,
    whepBase: whepBase.origin,
    viewers: parseViewers(env.STREAM_VIEWERS),
    publishers: parsePublishers(env.STREAM_PUBLISHERS),
    viewTtl: intEnv(env.STREAM_VIEW_TOKEN_TTL, 120, 30, 900),
    publishTtl: intEnv(env.STREAM_PUBLISH_TOKEN_TTL, 300, 30, 3600),
    sessionTtl: intEnv(env.STREAM_SESSION_TTL, 43200, 300, 7 * 86400),
  };
}

/** Vercel stores multi-line values fine, but "\n"-escaped single-line PEMs are common too. */
function pemFromEnv(v) {
  return String(v).includes("\\n") ? String(v).replace(/\\n/g, "\n") : String(v);
}

function isLoopback(host) {
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}

function intEnv(v, def, min, max) {
  if (v === undefined || v === "") return def;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new ConfigError(`Expected an integer in [${min}, ${max}], got "${v}"`);
  return n;
}

function parseJsonList(v, name) {
  if (!v) return [];
  let list;
  try { list = JSON.parse(v); } catch { throw new ConfigError(`${name} is not valid JSON`); }
  if (!Array.isArray(list)) throw new ConfigError(`${name} must be a JSON array`);
  return list;
}

function parseViewers(v) {
  return parseJsonList(v, "STREAM_VIEWERS").map((e, i) => {
    if (!NAME_RE.test(e?.user ?? "")) throw new ConfigError(`STREAM_VIEWERS[${i}].user is invalid`);
    parseHash(e.hash, `STREAM_VIEWERS[${i}].hash`);
    const paths = e.paths ?? ["cam"];
    if (!Array.isArray(paths) || !paths.length || !paths.every((p) => PATH_RE.test(p))) {
      throw new ConfigError(`STREAM_VIEWERS[${i}].paths is invalid`);
    }
    return { user: e.user, hash: e.hash, paths };
  });
}

function parsePublishers(v) {
  return parseJsonList(v, "STREAM_PUBLISHERS").map((e, i) => {
    if (!NAME_RE.test(e?.id ?? "")) throw new ConfigError(`STREAM_PUBLISHERS[${i}].id is invalid`);
    parseHash(e.hash, `STREAM_PUBLISHERS[${i}].hash`);
    if (!PATH_RE.test(e.path ?? "")) throw new ConfigError(`STREAM_PUBLISHERS[${i}].path is invalid`);
    return { id: e.id, hash: e.hash, path: e.path };
  });
}

// ─── Passwords (scrypt) ──────────────────────────────────────────────────────

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 };

/** Produces "scrypt$N$r$p$salt$hash" (base64url). Used by tools/stream-admin.mjs. */
export function hashPassword(password) {
  if (typeof password !== "string" || password.length < 12) throw new Error("Use at least 12 characters");
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("base64url"), hash.toString("base64url")].join("$");
}

function parseHash(stored, label = "hash") {
  const parts = String(stored ?? "").split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") throw new ConfigError(`${label} is not a scrypt hash from stream-admin`);
  const [, N, r, p, salt, hash] = parts;
  return { N: Number(N), r: Number(r), p: Number(p), salt: Buffer.from(salt, "base64url"), hash: Buffer.from(hash, "base64url") };
}

// A fixed hash so unknown users cost the same scrypt work as known ones (no user enumeration by timing).
const DUMMY_HASH = "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

export function verifyPassword(password, stored) {
  const h = parseHash(stored ?? DUMMY_HASH);
  const got = crypto.scryptSync(String(password ?? ""), h.salt, h.hash.length, { N: h.N, r: h.r, p: h.p, maxmem: 64 * 1024 * 1024 });
  return stored !== undefined && crypto.timingSafeEqual(got, h.hash);
}

// ─── JWT (RS256) + JWKS ──────────────────────────────────────────────────────

function b64url(obj) { return Buffer.from(JSON.stringify(obj)).toString("base64url"); }

function thumbprint(publicKey) {
  const { e, kty, n } = publicKey.export({ format: "jwk" });
  return crypto.createHash("sha256").update(JSON.stringify({ e, kty, n })).digest("base64url");
}

/**
 * @param {ReturnType<typeof loadConfig>} cfg
 * @param {{ sub: string, permissions: { action: "read" | "publish", path: string }[], ttl: number }} p
 */
export function signMediaToken(cfg, { sub, permissions, ttl }, now = Date.now()) {
  const iat = Math.floor(now / 1000);
  const header = { alg: "RS256", typ: "JWT", kid: cfg.kid };
  const payload = {
    iss: cfg.issuer, aud: cfg.audience, sub, iat, nbf: iat - 5, exp: iat + ttl,
    jti: crypto.randomUUID(),
    mediamtx_permissions: permissions,
  };
  const input = `${b64url(header)}.${b64url(payload)}`;
  const sig = crypto.sign("sha256", Buffer.from(input), cfg.privateKey).toString("base64url");
  return { token: `${input}.${sig}`, expiresAt: payload.exp * 1000 };
}

export function jwks(cfg) {
  return {
    keys: cfg.publicKeys.map((k) => {
      const { kty, n, e } = k.export({ format: "jwk" });
      return { kty, n, e, kid: thumbprint(k), alg: "RS256", use: "sig" };
    }),
  };
}

// ─── Operator session cookie (HMAC) ──────────────────────────────────────────

export function createSession(cfg, user, now = Date.now()) {
  const body = Buffer.from(JSON.stringify({ u: user, exp: Math.floor(now / 1000) + cfg.sessionTtl })).toString("base64url");
  const mac = crypto.createHmac("sha256", cfg.sessionSecret).update(body).digest("base64url");
  return `${body}.${mac}`;
}

/** @returns {string | null} the user name when the cookie is authentic, unexpired and the user still exists */
export function readSession(cfg, value, now = Date.now()) {
  if (!value || typeof value !== "string") return null;
  const [body, mac] = value.split(".");
  if (!body || !mac) return null;
  const want = crypto.createHmac("sha256", cfg.sessionSecret).update(body).digest();
  const got = Buffer.from(mac, "base64url");
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return null;
  let data;
  try { data = JSON.parse(Buffer.from(body, "base64url").toString()); } catch { return null; }
  if (typeof data?.u !== "string" || typeof data.exp !== "number" || data.exp * 1000 <= now) return null;
  // Removing a viewer from STREAM_VIEWERS revokes their session on the next request.
  return cfg.viewers.some((v) => v.user === data.u) ? data.u : null;
}

export function sessionCookie(value, maxAge, secure = true) {
  return [
    `${SESSION_COOKIE}=${value}`, "Path=/api/stream", "HttpOnly", "SameSite=Strict", `Max-Age=${maxAge}`,
    secure ? "Secure" : "",
  ].filter(Boolean).join("; ");
}

export function getCookie(req, name) {
  for (const part of (req.headers.get("cookie") ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

// ─── Abuse protection ────────────────────────────────────────────────────────

/**
 * Best-effort, per-instance sliding window. Serverless instances do not share
 * memory, so this only slows a single attacker down; put a Vercel Firewall
 * rate-limit rule on /api/stream/* for a real global limit (docs/streaming).
 */
export class RateLimiter {
  constructor(limit, windowMs) { this.limit = limit; this.windowMs = windowMs; this.hits = new Map(); }
  allow(key, now = Date.now()) {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (this.hits.size > 5000) this.hits.clear();
    if (recent.length >= this.limit) { this.hits.set(key, recent); return false; }
    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }
}

export function clientIp(req) {
  return (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
}

/** Browser POSTs must come from this deployment's own origin (CSRF defence on top of SameSite=Strict). */
export function sameOrigin(req) {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  return origin === new URL(req.url).origin;
}

// ─── Responses ───────────────────────────────────────────────────────────────

export function json(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}

/** Loads config once per instance; a misconfiguration becomes a 503 without leaking details to the client. */
export function withConfig(handler) {
  let cached = null;
  return async (req) => {
    try {
      cached ??= loadConfig();
    } catch (e) {
      console.error("[stream] configuration error:", e instanceof Error ? e.message : e);
      return json(503, { error: "not_configured", message: "Remote streaming is not configured on this deployment." });
    }
    return handler(req, cached);
  };
}

// ─── Route handlers (each api/stream/*.js file re-exports one of these) ─────

const loginLimiter = new RateLimiter(10, 10 * 60 * 1000);
const publishLimiter = new RateLimiter(30, 10 * 60 * 1000);

async function readJson(req) {
  if (!(req.headers.get("content-type") ?? "").startsWith("application/json")) return null;
  const text = await req.text();
  if (text.length > 4096) return null;
  try { return JSON.parse(text); } catch { return null; }
}

/** GET → who am I · POST {user,password} → sign in · DELETE → sign out */
export async function sessionRoute(req, cfg) {
  const secure = new URL(req.url).protocol === "https:";
  if (req.method === "GET") {
    const user = readSession(cfg, getCookie(req, SESSION_COOKIE));
    if (!user) return json(401, { error: "unauthenticated" });
    return json(200, { user, paths: cfg.viewers.find((v) => v.user === user).paths });
  }
  if (req.method === "DELETE") {
    if (!sameOrigin(req)) return json(403, { error: "forbidden" });
    return json(200, { ok: true }, { "Set-Cookie": sessionCookie("", 0, secure) });
  }
  if (req.method === "POST") {
    if (!sameOrigin(req)) return json(403, { error: "forbidden" });
    if (!loginLimiter.allow(clientIp(req))) return json(429, { error: "rate_limited", message: "Too many sign-in attempts. Try again later." });
    const body = await readJson(req);
    const user = typeof body?.user === "string" ? body.user : "";
    const viewer = cfg.viewers.find((v) => v.user === user);
    if (!verifyPassword(body?.password, viewer?.hash)) {
      console.warn(`[stream] failed sign-in for "${user.slice(0, 64)}" from ${clientIp(req)}`);
      return json(401, { error: "invalid_credentials", message: "Wrong user name or password." });
    }
    console.info(`[stream] sign-in "${user}"`);
    return json(200, { user, paths: viewer.paths }, { "Set-Cookie": sessionCookie(createSession(cfg, user), cfg.sessionTtl, secure) });
  }
  return json(405, { error: "method_not_allowed" }, { Allow: "GET, POST, DELETE" });
}

/** POST {path?} with a session cookie → { token, whepUrl, expiresAt } for one camera path. */
export async function viewTokenRoute(req, cfg) {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" }, { Allow: "POST" });
  if (!sameOrigin(req)) return json(403, { error: "forbidden" });
  const user = readSession(cfg, getCookie(req, SESSION_COOKIE));
  if (!user) return json(401, { error: "unauthenticated" });
  const viewer = cfg.viewers.find((v) => v.user === user);
  const body = (await readJson(req)) ?? {};
  const path = typeof body.path === "string" ? body.path : viewer.paths[0];
  // Same answer for "no such path" and "not yours", so paths can't be discovered.
  if (!viewer.paths.includes(path)) return json(403, { error: "forbidden" });
  const { token, expiresAt } = signMediaToken(cfg, { sub: `viewer:${user}`, permissions: [{ action: "read", path }], ttl: cfg.viewTtl });
  return json(200, { token, expiresAt, path, whepUrl: `${cfg.whepBase}/${path}/whep` });
}

/**
 * POST with HTTP Basic auth (device id + device key) → { token, path, expiresAt }.
 * Called by the Raspberry Pi publisher before every (re)connection.
 */
export async function publishTokenRoute(req, cfg) {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" }, { Allow: "POST" });
  const ip = clientIp(req);
  if (!publishLimiter.allow(ip)) return json(429, { error: "rate_limited" }, { "Retry-After": "60" });
  const m = /^Basic\s+(.+)$/i.exec(req.headers.get("authorization") ?? "");
  const [id, ...rest] = m ? Buffer.from(m[1], "base64").toString().split(":") : [""];
  const device = cfg.publishers.find((p) => p.id === id);
  if (!verifyPassword(rest.join(":"), device?.hash)) {
    console.warn(`[stream] rejected publisher "${String(id).slice(0, 64)}" from ${ip}`);
    return json(401, { error: "invalid_credentials" }, { "WWW-Authenticate": 'Basic realm="veil-stream"' });
  }
  const { token, expiresAt } = signMediaToken(cfg, {
    sub: `publisher:${device.id}`, permissions: [{ action: "publish", path: device.path }], ttl: cfg.publishTtl,
  });
  console.info(`[stream] publish token issued to "${device.id}" for path "${device.path}"`);
  return json(200, { token, path: device.path, expiresAt });
}

export async function jwksRoute(req, cfg) {
  if (req.method !== "GET" && req.method !== "HEAD") return json(405, { error: "method_not_allowed" }, { Allow: "GET" });
  return json(200, jwks(cfg), { "Cache-Control": "public, max-age=300" });
}
