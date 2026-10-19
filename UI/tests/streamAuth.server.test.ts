// @vitest-environment node
import crypto from "node:crypto";
import { describe, it, expect, beforeAll } from "vitest";
import {
  loadConfig, hashPassword, verifyPassword, signMediaToken, jwks, createSession, readSession,
  sessionRoute, viewTokenRoute, publishTokenRoute, jwksRoute, ConfigError, SESSION_COOKIE,
} from "../api/_lib/streamAuth.js";

const ORIGIN = "https://veil.test";
let env: Record<string, string>;
let cfg: ReturnType<typeof loadConfig>;

beforeAll(() => {
  const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  env = {
    STREAM_JWT_PRIVATE_KEY: privateKey.export({ type: "pkcs8", format: "pem" }).toString().replace(/\n/g, "\\n"),
    STREAM_JWT_ISSUER: `${ORIGIN}/api/stream`,
    STREAM_SESSION_SECRET: "s".repeat(40),
    STREAM_WHEP_BASE: "https://media.test",
    STREAM_VIEWERS: JSON.stringify([
      { user: "alice", hash: hashPassword("correct horse battery"), paths: ["cam"] },
      { user: "bob", hash: hashPassword("another long password"), paths: ["cam2"] },
    ]),
    STREAM_PUBLISHERS: JSON.stringify([{ id: "robot-01", hash: hashPassword("device-key-0123456789"), path: "cam" }]),
  };
  cfg = loadConfig(env);
});

function decode(token: string) {
  const [h, p, s] = token.split(".");
  return { header: JSON.parse(Buffer.from(h, "base64url").toString()), payload: JSON.parse(Buffer.from(p, "base64url").toString()), input: `${h}.${p}`, sig: s };
}

function verifyWithJwks(token: string, set = jwks(cfg)) {
  const { header, input, sig } = decode(token);
  const jwk = set.keys.find((k: { kid: string }) => k.kid === header.kid);
  if (!jwk) return false;
  const key = crypto.createPublicKey({ key: jwk, format: "jwk" });
  return crypto.verify("sha256", Buffer.from(input), key, Buffer.from(sig, "base64url"));
}

const req = (path: string, init: RequestInit & { cookie?: string; origin?: string | null } = {}) => {
  const headers = new Headers(init.headers);
  if (init.origin !== null) headers.set("origin", init.origin ?? ORIGIN);
  if (init.cookie) headers.set("cookie", init.cookie);
  headers.set("x-forwarded-for", "203.0.113.7");
  return new Request(`${ORIGIN}${path}`, { ...init, headers });
};
const jsonBody = (body: unknown) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

async function login(user = "alice", password = "correct horse battery") {
  const res = await sessionRoute(req("/api/stream/session", jsonBody({ user, password })), cfg);
  const set = res.headers.get("set-cookie") ?? "";
  return { res, cookie: set.split(";")[0] };
}

describe("config", () => {
  it("rejects missing secrets and weak values without echoing them", () => {
    expect(() => loadConfig({})).toThrow(ConfigError);
    expect(() => loadConfig({ ...env, STREAM_SESSION_SECRET: "short" })).toThrow(/at least 32/);
    expect(() => loadConfig({ ...env, STREAM_WHEP_BASE: "http://media.test" })).toThrow(/https/);
    expect(() => loadConfig({ ...env, STREAM_VIEWERS: "[{\"user\":\"x\",\"hash\":\"plain\"}]" })).toThrow(/scrypt/);
    expect(() => loadConfig({ ...env, STREAM_PUBLISHERS: "[{\"id\":\"r\",\"hash\":\"x\",\"path\":\"../etc\"}]" })).toThrow();
  });
  it("allows plain http only for loopback media servers (local testing)", () => {
    expect(loadConfig({ ...env, STREAM_WHEP_BASE: "http://127.0.0.1:8889" }).whepBase).toBe("http://127.0.0.1:8889");
  });
});

describe("passwords", () => {
  it("verifies scrypt hashes and rejects wrong or unknown", () => {
    const h = hashPassword("a sufficiently long one");
    expect(verifyPassword("a sufficiently long one", h)).toBe(true);
    expect(verifyPassword("a sufficiently long onE", h)).toBe(false);
    expect(verifyPassword("anything", undefined)).toBe(false);
    expect(() => hashPassword("short")).toThrow();
  });
});

describe("media JWT", () => {
  it("is RS256, verifiable with the JWKS, scoped and short-lived", () => {
    const now = Date.now();
    const { token, expiresAt } = signMediaToken(cfg, { sub: "viewer:alice", permissions: [{ action: "read", path: "cam" }], ttl: 120 }, now);
    const { header, payload } = decode(token);
    expect(header).toMatchObject({ alg: "RS256", kid: cfg.kid });
    expect(payload).toMatchObject({ iss: env.STREAM_JWT_ISSUER, aud: "mediamtx", sub: "viewer:alice", mediamtx_permissions: [{ action: "read", path: "cam" }] });
    expect(payload.exp - payload.iat).toBe(120);
    expect(expiresAt).toBe(payload.exp * 1000);
    expect(verifyWithJwks(token)).toBe(true);
    // A token signed by any other key must not verify.
    const other = loadConfig({ ...env, STREAM_JWT_PRIVATE_KEY: crypto.generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString() });
    expect(verifyWithJwks(signMediaToken(other, { sub: "x", permissions: [], ttl: 60 }).token)).toBe(false);
  });
  it("JWKS publishes only public material and carries extra keys for rotation", async () => {
    const res = await jwksRoute(req("/api/stream/jwks", { method: "GET" }), cfg);
    const body = await res.json();
    expect(body.keys).toHaveLength(1);
    expect(Object.keys(body.keys[0]).sort()).toEqual(["alg", "e", "kid", "kty", "n", "use"]);
    const prev = crypto.createPublicKey(cfg.privateKey).export({ type: "spki", format: "pem" }).toString();
    const next = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
    const nextPub = next.publicKey.export({ type: "spki", format: "pem" }).toString();
    // Step 1: publish the next key while still signing with the current one.
    const staged = loadConfig({ ...env, STREAM_JWT_EXTRA_PUBLIC_KEYS: nextPub });
    expect(jwks(staged).keys).toHaveLength(2);
    // Step 2: sign with the next key, keep the old one published (both PEMs in one variable also works).
    const rotated = loadConfig({ ...env, STREAM_JWT_PRIVATE_KEY: next.privateKey.export({ type: "pkcs8", format: "pem" }).toString(), STREAM_JWT_EXTRA_PUBLIC_KEYS: `${prev}\n${nextPub}` });
    expect(jwks(rotated).keys).toHaveLength(2); // the signing key is not duplicated
    const oldToken = signMediaToken(cfg, { sub: "x", permissions: [], ttl: 60 }).token;
    const newToken = signMediaToken(rotated, { sub: "x", permissions: [], ttl: 60 }).token;
    expect(verifyWithJwks(oldToken, jwks(staged))).toBe(true);
    expect(verifyWithJwks(newToken, jwks(staged))).toBe(true); // MediaMTX restarted at step 1 already trusts it
  });
});

describe("session cookie", () => {
  it("rejects tampering, expiry and removed users", () => {
    const v = createSession(cfg, "alice");
    expect(readSession(cfg, v)).toBe("alice");
    const [body, mac] = v.split(".");
    const forged = Buffer.from(JSON.stringify({ u: "bob", exp: 9e9 })).toString("base64url");
    expect(readSession(cfg, `${forged}.${mac}`)).toBeNull();
    expect(readSession(cfg, `${body}.${mac.slice(0, -2)}AA`)).toBeNull();
    expect(readSession(cfg, v, Date.now() + cfg.sessionTtl * 1000 + 1)).toBeNull();
    expect(readSession({ ...cfg, viewers: [] }, v)).toBeNull();
  });
});

describe("routes", () => {
  it("sign-in sets an HttpOnly, Secure, SameSite=Strict cookie scoped to /api/stream", async () => {
    const { res } = await login();
    expect(res.status).toBe(200);
    const set = res.headers.get("set-cookie")!;
    expect(set).toMatch(new RegExp(`^${SESSION_COOKIE}=`));
    for (const attr of ["HttpOnly", "Secure", "SameSite=Strict", "Path=/api/stream"]) expect(set).toContain(attr);
    expect(await res.json()).toEqual({ user: "alice", paths: ["cam"] });
  });
  it("wrong password and unknown user get the same 401", async () => {
    const a = await sessionRoute(req("/api/stream/session", jsonBody({ user: "alice", password: "nope nope nope" })), cfg);
    const b = await sessionRoute(req("/api/stream/session", jsonBody({ user: "mallory", password: "nope nope nope" })), cfg);
    expect([a.status, b.status]).toEqual([401, 401]);
    expect(await a.json()).toEqual(await b.json());
  });
  it("cross-origin POSTs are refused (CSRF)", async () => {
    const res = await sessionRoute(req("/api/stream/session", { ...jsonBody({ user: "alice", password: "correct horse battery" }), origin: "https://evil.test" }), cfg);
    expect(res.status).toBe(403);
    const { cookie } = await login();
    const t = await viewTokenRoute(req("/api/stream/token", { ...jsonBody({}), cookie, origin: null }), cfg);
    expect(t.status).toBe(403);
  });
  it("view token needs a session and is limited to the viewer's paths", async () => {
    expect((await viewTokenRoute(req("/api/stream/token", jsonBody({})), cfg)).status).toBe(401);
    const { cookie } = await login();
    const ok = await viewTokenRoute(req("/api/stream/token", { ...jsonBody({}), cookie }), cfg);
    expect(ok.status).toBe(200);
    expect(ok.headers.get("cache-control")).toBe("no-store");
    const body = await ok.json();
    expect(body.whepUrl).toBe("https://media.test/cam/whep");
    expect(decode(body.token).payload.mediamtx_permissions).toEqual([{ action: "read", path: "cam" }]);
    const other = await viewTokenRoute(req("/api/stream/token", { ...jsonBody({ path: "cam2" }), cookie }), cfg);
    const nonexistent = await viewTokenRoute(req("/api/stream/token", { ...jsonBody({ path: "nope" }), cookie }), cfg);
    expect([other.status, nonexistent.status]).toEqual([403, 403]);
  });
  it("publish token requires the device key and grants publish on the device's path only", async () => {
    const basic = (id: string, key: string) => ({ method: "POST", headers: { authorization: `Basic ${Buffer.from(`${id}:${key}`).toString("base64")}` }, origin: null });
    const bad = await publishTokenRoute(req("/api/stream/publish-token", basic("robot-01", "wrong")), cfg);
    expect(bad.status).toBe(401);
    const res = await publishTokenRoute(req("/api/stream/publish-token", basic("robot-01", "device-key-0123456789")), cfg);
    expect(res.status).toBe(200);
    const { token, path } = await res.json();
    expect(path).toBe("cam");
    const { payload } = decode(token);
    expect(payload.mediamtx_permissions).toEqual([{ action: "publish", path: "cam" }]);
    expect(payload.exp - payload.iat).toBe(300);
    // A viewer session cannot mint a publish token.
    const { cookie } = await login();
    expect((await publishTokenRoute(req("/api/stream/publish-token", { method: "POST", cookie }), cfg)).status).toBe(401);
  });
  it("sign-in is rate limited per client", async () => {
    let last = 0;
    for (let i = 0; i < 12; i++) {
      const r = new Request(`${ORIGIN}/api/stream/session`, { ...jsonBody({ user: "alice", password: "x" }), headers: { "content-type": "application/json", origin: ORIGIN, "x-forwarded-for": "198.51.100.9" } });
      last = (await sessionRoute(r, cfg)).status;
    }
    expect(last).toBe(429);
  });
});
