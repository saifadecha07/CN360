import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Store } from "../src/app/store";
import { VideoStream } from "../src/services/video";
import { FakePC } from "./fakes";
import { AuthRequiredError, DirectSource, RemoteSource, parseIceServers, detectRemote, type StreamSource } from "../src/services/streamAuth";

type Call = { url: string; method: string; headers: Record<string, string> };
let calls: Call[];
let whepStatus: number;

function installFetch() {
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
    const headers = Object.fromEntries(new Headers(init.headers).entries());
    calls.push({ url: String(url), method: init.method ?? "GET", headers });
    if (init.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: { Link: '<turn:media.test:3478?transport=udp>; rel="ice-server"; username="1700000000:veil"; credential="abc="; credential-type="password"' } });
    }
    if (init.method === "DELETE") return new Response(null, { status: 200 });
    if (whepStatus !== 201) return new Response(whepStatus === 404 ? "no one is publishing to path 'cam'" : "internal error", { status: whepStatus });
    return new Response("v=0 answer", { status: 201, headers: { Location: "/cam/whep/session-1" } });
  }));
}

const flush = async (n = 10) => { for (let i = 0; i < n; i++) await Promise.resolve(); };

beforeEach(() => {
  FakePC.all = [];
  whepStatus = 201;
  vi.stubGlobal("RTCPeerConnection", FakePC);
  vi.stubGlobal("MediaStream", class {});
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  installFetch();
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const tokenSource = (token = "jwt-1"): StreamSource => ({ kind: "remote", target: async () => ({ whepUrl: "https://media.test/cam/whep", token }) });

describe("VideoStream", () => {
  it("goes live, uses ICE servers from OPTIONS and sends the Bearer token", async () => {
    const store = new Store();
    const v = new VideoStream(store, async () => tokenSource());
    expect(await v.start()).toBe(true);
    expect(store.state.video.state).toBe("live");
    expect(FakePC.last!.config.iceServers).toEqual([{ urls: "turn:media.test:3478?transport=udp", username: "1700000000:veil", credential: "abc=" }]);
    const post = calls.find((c) => c.method === "POST")!;
    expect(post.headers.authorization).toBe("Bearer jwt-1");
    expect(post.headers["content-type"]).toBe("application/sdp");
  });

  it("stop() closes the peer connection, deletes the WHEP session with auth and goes idle", async () => {
    const store = new Store();
    const v = new VideoStream(store, async () => tokenSource());
    await v.start();
    const pc = FakePC.last!;
    v.stop();
    expect(pc.closed).toBe(true);
    const del = calls.find((c) => c.method === "DELETE")!;
    expect(del.url).toBe("https://media.test/cam/whep/session-1");
    expect(del.headers.authorization).toBe("Bearer jwt-1");
    expect(store.state.video.state).toBe("idle");
    expect(v.element.srcObject).toBeNull();
  });

  it("an unpublished camera is 'offline' and is retried with backoff until it appears", async () => {
    vi.useFakeTimers();
    whepStatus = 404;
    const store = new Store();
    const v = new VideoStream(store, async () => new DirectSource("http://pi/cam/whep"), { backoff: { baseMs: 1000, maxMs: 4000 } });
    await v.start();
    expect(store.state.video).toMatchObject({ state: "offline", attempt: 1 });
    whepStatus = 201;
    await vi.advanceTimersByTimeAsync(1300);
    await flush();
    expect(store.state.video.state).toBe("live");
    expect(store.state.video.attempt).toBe(0);
    v.stop();
  });

  it("explains a full server instead of a bare status code", async () => {
    whepStatus = 400;
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init: RequestInit = {}) =>
      init.method === "POST" ? new Response('{"status":"error","error":"maximum reader count reached"}', { status: 400 }) : new Response(null, { status: 204 })));
    const store = new Store();
    const v = new VideoStream(store, async () => tokenSource(), { backoff: { baseMs: 60000, maxMs: 60000 } });
    await v.start();
    expect(store.state.video).toMatchObject({ state: "reconnecting", error: expect.stringMatching(/Viewer limit reached/) });
    v.stop();
  });

  it("caps the backoff delay", async () => {
    vi.useFakeTimers();
    whepStatus = 500;
    const store = new Store();
    const v = new VideoStream(store, async () => new DirectSource("http://pi/cam/whep"), { backoff: { baseMs: 1000, maxMs: 4000 } });
    await v.start();
    for (let i = 0; i < 6; i++) await vi.advanceTimersByTimeAsync(4900);
    const posts = calls.filter((c) => c.method === "POST").length;
    expect(posts).toBeGreaterThanOrEqual(6); // never waits longer than maxMs·1.2 between tries
    expect(store.state.video.state).toBe("reconnecting");
    v.stop();
    const after = calls.length;
    await vi.advanceTimersByTimeAsync(20000);
    expect(calls.length).toBe(after); // stop() cancels pending retries
  });

  it("a failed connection reconnects with a fresh token", async () => {
    vi.useFakeTimers();
    let n = 0;
    const store = new Store();
    const v = new VideoStream(store, async () => ({ kind: "remote", target: async () => ({ whepUrl: "https://media.test/cam/whep", token: `jwt-${++n}` }) }), { backoff: { baseMs: 500, maxMs: 500 } });
    await v.start();
    FakePC.last!.setState("failed");
    expect(store.state.video.state).toBe("reconnecting");
    await vi.advanceTimersByTimeAsync(700);
    await flush();
    expect(store.state.video.state).toBe("live");
    expect(calls.filter((c) => c.method === "POST").map((c) => c.headers.authorization)).toEqual(["Bearer jwt-1", "Bearer jwt-2"]);
    v.stop();
  });

  it("a brief 'disconnected' that recovers does not renegotiate", async () => {
    vi.useFakeTimers();
    const store = new Store();
    const v = new VideoStream(store, async () => tokenSource(), { graceMs: 3000 });
    await v.start();
    const pc = FakePC.last!;
    pc.setState("disconnected");
    expect(store.state.video.state).toBe("reconnecting");
    await vi.advanceTimersByTimeAsync(1000);
    pc.setState("connected");
    expect(store.state.video.state).toBe("live");
    await vi.advanceTimersByTimeAsync(5000);
    expect(FakePC.all).toHaveLength(1);
    v.stop();
  });

  it("asks for sign-in instead of retrying when the stream API says 401", async () => {
    const store = new Store();
    const v = new VideoStream(store, async () => ({ kind: "remote", target: async () => { throw new AuthRequiredError(); } }));
    expect(await v.start()).toBe(false);
    expect(store.state.video.state).toBe("unauthorized");
    expect(calls).toHaveLength(0);
  });

  it("reports unsupported browsers", async () => {
    vi.stubGlobal("RTCPeerConnection", undefined);
    const store = new Store();
    const v = new VideoStream(store, async () => tokenSource());
    expect(await v.start()).toBe(false);
    expect(store.state.video.state).toBe("unavailable");
  });

  it("flags autoplay refusal so the viewer can offer 'Tap to play'", async () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockRejectedValue(new DOMException("blocked", "NotAllowedError"));
    const store = new Store();
    const v = new VideoStream(store, async () => tokenSource());
    await v.start();
    await flush();
    expect(store.state.video).toMatchObject({ state: "live", blocked: true });
    v.stop();
  });
});

describe("stream source helpers", () => {
  it("parses ICE servers from Link headers and ignores other relations", () => {
    expect(parseIceServers(null)).toEqual([]);
    expect(parseIceServers('<stun:stun.test:3478>; rel="ice-server", <https://x>; rel="preload"')).toEqual([{ urls: "stun:stun.test:3478" }]);
  });

  it("detects remote mode only from a JSON /api/stream/session answer", async () => {
    const res = (status: number, type: string) => async () => new Response("{}", { status, headers: { "content-type": type } });
    expect(await detectRemote(res(401, "application/json") as typeof fetch)).toBe(true);
    expect(await detectRemote(res(200, "application/json") as typeof fetch)).toBe(true);
    expect(await detectRemote(res(404, "text/html") as typeof fetch)).toBe(false);
    expect(await detectRemote(res(200, "text/html") as typeof fetch)).toBe(false); // SPA fallback page
    expect(await detectRemote((async () => { throw new TypeError("offline"); }) as typeof fetch)).toBe(false);
  });

  it("RemoteSource maps 401 to AuthRequiredError", async () => {
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 401 }));
    await expect(new RemoteSource().target()).rejects.toBeInstanceOf(AuthRequiredError);
  });
});

describe("VideoStream honesty", () => {
  it("does not report LIVE when the track is negotiated but no media ever arrives", async () => {
    vi.useFakeTimers();
    const Blocked = class extends FakePC { constructor(c: RTCConfiguration) { super(c); this.mediaFlows = false; } };
    vi.stubGlobal("RTCPeerConnection", Blocked);
    const store = new Store();
    const seen: string[] = [];
    store.subscribe((s) => seen.push(s.video.state));
    const v = new VideoStream(store, async () => tokenSource(), { timeoutMs: 3000, backoff: { baseMs: 60000, maxMs: 60000 } });
    const started = v.start();
    await vi.advanceTimersByTimeAsync(3500);
    expect(await started).toBe(false);
    expect(seen).not.toContain("live");
    expect(store.state.video.state).toBe("reconnecting");
    expect(store.state.video.error).toMatch(/no video arrived/);
    v.stop();
  });
});
