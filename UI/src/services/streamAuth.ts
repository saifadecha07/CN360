/**
 * Where the camera stream comes from and how to get access to it.
 *
 * - direct: the Pi serves VEIL and MediaMTX on one origin (/cam/whep, LAN, no login).
 * - remote: VEIL runs on Vercel; the stream is on a MediaMTX VPS. The operator signs in
 *   against /api/stream/session (httpOnly cookie) and every connection attempt gets a fresh
 *   short-lived JWT from /api/stream/token. No media credential is ever stored in the page.
 */

export interface StreamTarget { whepUrl: string; token: string | null }

export interface StreamSource {
  readonly kind: "direct" | "remote";
  /** Throws AuthRequiredError when the operator must sign in first. */
  target(): Promise<StreamTarget>;
}

export class AuthRequiredError extends Error {
  constructor() { super("Sign in to watch the camera"); this.name = "AuthRequiredError"; }
}

/** Non-auth failure of the stream API (misconfiguration, outage). Message is safe to show. */
export class StreamApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); this.name = "StreamApiError"; }
}

export class DirectSource implements StreamSource {
  readonly kind = "direct";
  constructor(private url: string) {}
  async target(): Promise<StreamTarget> { return { whepUrl: this.url, token: null }; }
}

const API = "/api/stream";

async function apiError(res: Response): Promise<StreamApiError> {
  let message = `Stream service responded ${res.status}`;
  try {
    const body = await res.json();
    if (typeof body?.message === "string") message = body.message;
  } catch { /* not JSON */ }
  return new StreamApiError(message, res.status);
}

export class RemoteSource implements StreamSource {
  readonly kind = "remote";
  constructor(private path?: string) {}

  async target(): Promise<StreamTarget> {
    const res = await fetch(`${API}/token`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(this.path ? { path: this.path } : {}),
    });
    if (res.status === 401) throw new AuthRequiredError();
    if (res.status === 403) throw new StreamApiError("Your account cannot view this camera", 403);
    if (!res.ok) throw await apiError(res);
    const body = await res.json();
    return { whepUrl: String(body.whepUrl), token: String(body.token) };
  }
}

export interface Account { user: string; paths: string[] }

/** null = not signed in. Throws StreamApiError when the service is unreachable or not configured. */
export async function currentAccount(): Promise<Account | null> {
  const res = await fetch(`${API}/session`, { credentials: "same-origin" });
  if (res.status === 401) return null;
  if (!res.ok) throw await apiError(res);
  return res.json();
}

export async function signIn(user: string, password: string): Promise<Account> {
  const res = await fetch(`${API}/session`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user, password }),
  });
  if (!res.ok) throw await apiError(res);
  return res.json();
}

export async function signOut(): Promise<void> {
  await fetch(`${API}/session`, { method: "DELETE", credentials: "same-origin" }).catch(() => {});
}

/**
 * Remote mode is in effect when this origin answers /api/stream/session with JSON
 * (200 or 401) — i.e. the Vercel deployment. The Pi's static server answers 404.
 */
export async function detectRemote(fetchImpl: typeof fetch = fetch): Promise<boolean> {
  try {
    const res = await fetchImpl(`${API}/session`, { credentials: "same-origin" });
    const isJson = (res.headers.get("content-type") ?? "").includes("application/json");
    return isJson && (res.ok || res.status === 401 || res.status === 503);
  } catch {
    return false;
  }
}

/** Parses WHEP OPTIONS `Link: <turn:…>; rel="ice-server"; username="…"; credential="…"` headers. */
export function parseIceServers(link: string | null): RTCIceServer[] {
  if (!link) return [];
  const out: RTCIceServer[] = [];
  for (const part of link.split(/,(?=\s*<)/)) {
    const m = /<([^>]+)>(.*)/.exec(part.trim());
    if (!m || !/rel="?ice-server"?/i.test(m[2])) continue;
    const attr = (name: string) => {
      const a = new RegExp(`${name}="([^"]*)"`, "i").exec(m[2]);
      return a ? a[1].replace(/\\"/g, '"') : undefined;
    };
    const server: RTCIceServer = { urls: m[1] };
    const username = attr("username"), credential = attr("credential");
    if (username !== undefined) server.username = username;
    if (credential !== undefined) server.credential = credential;
    out.push(server);
  }
  return out;
}
