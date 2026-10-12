/**
 * Endpoint configuration. Defaults follow WORKING_PROCESS.md §2.3: the web app,
 * WebSocket (/ws) and MediaMTX WHEP (/cam/whep) share the page's origin.
 * Override for development with ?robot=host:port or ?whep=<url>; overrides
 * persist in localStorage. No credentials are ever stored here.
 */

const KEY = "veil.endpoints";

export interface Endpoints { wsUrl: string; whepUrl: string }

function safeStorage(): Storage | null {
  try { return window.localStorage; } catch { return null; }
}

export function resolveEndpoints(loc: Location = window.location): Endpoints {
  const params = new URLSearchParams(loc.search);
  const secure = loc.protocol === "https:";
  let saved: Partial<Endpoints> = {};
  try { saved = JSON.parse(safeStorage()?.getItem(KEY) ?? "{}"); } catch { /* ignore */ }

  const robot = params.get("robot");
  const whep = params.get("whep");
  const wsUrl = robot
    ? `${secure ? "wss" : "ws"}://${robot}/ws`
    : saved.wsUrl ?? `${secure ? "wss" : "ws"}://${loc.host}/ws`;
  const whepUrl = whep ?? saved.whepUrl ?? `${loc.origin}/cam/whep`;

  if (robot || whep) {
    try { safeStorage()?.setItem(KEY, JSON.stringify({ wsUrl, whepUrl })); } catch { /* ignore */ }
  }
  return { wsUrl, whepUrl };
}

export function resetEndpoints(): void {
  try { safeStorage()?.removeItem(KEY); } catch { /* ignore */ }
}
