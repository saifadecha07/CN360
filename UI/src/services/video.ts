/**
 * WHEP (WebRTC-HTTP Egress) client for MediaMTX — receive-only.
 *
 * Works against the Pi's own MediaMTX (/cam/whep, direct) or a MediaMTX VPS (remote,
 * Bearer JWT from /api/stream/token). Reports real states into the store and never
 * fakes a live feed. Once started it keeps trying until stop(): temporary network loss,
 * an unpublished camera or a restarted media server all recover on their own.
 *
 * Per-frame data never enters the store; screens read video.element / getStats() directly.
 */
import type { Store, VideoState } from "../app/store";
import { AuthRequiredError, StreamApiError, parseIceServers, type StreamSource } from "./streamAuth";

export interface VideoOptions {
  /** How long to wait for the WHEP answer and then for the first video track. */
  timeoutMs?: number;
  /** Max time to wait for ICE gathering before sending the offer. */
  gatherMs?: number;
  /** A "disconnected" peer connection gets this long to recover by itself. */
  graceMs?: number;
  backoff?: { baseMs: number; maxMs: number };
}

const DEFAULTS = { timeoutMs: 10000, gatherMs: 2000, graceMs: 4000, backoff: { baseMs: 1000, maxMs: 15000 } };

class StreamOffline extends Error {}

export class VideoStream {
  readonly element: HTMLVideoElement;
  private pc: RTCPeerConnection | null = null;
  private resource: string | null = null;
  private token: string | null = null;
  private wanted = false;
  private gen = 0;
  private attempt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private graceTimer: ReturnType<typeof setTimeout> | null = null;
  private abort: AbortController | null = null;
  private source: Promise<StreamSource> | null = null;
  private opts: typeof DEFAULTS;
  private onOnline = () => { if (this.wanted && this.store.state.video.state !== "live") this.retry(); };

  constructor(private store: Store, private resolveSource: () => Promise<StreamSource>, opts: VideoOptions = {}) {
    this.opts = { ...DEFAULTS, ...opts, backoff: { ...DEFAULTS.backoff, ...opts.backoff } };
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.autoplay = true;
    v.setAttribute("playsinline", "");
    v.crossOrigin = "anonymous";
    this.element = v;
  }

  get live(): boolean { return this.store.state.video.state === "live"; }

  /** Start (or keep) streaming. Resolves with whether the first attempt went live. */
  async start(): Promise<boolean> {
    if (this.wanted && (this.pc || this.retryTimer)) return this.live;
    if (typeof RTCPeerConnection !== "function") {
      this.patch("unavailable", "WebRTC is not supported by this browser");
      return false;
    }
    this.wanted = true;
    this.attempt = 0;
    window.addEventListener("online", this.onOnline);
    return this.connect();
  }

  /** Manual retry: reconnect now and reset the backoff. */
  retry(): void {
    if (!this.wanted) { void this.start(); return; }
    this.attempt = 0;
    this.clearTimers();
    void this.connect();
  }

  stop(): void {
    this.wanted = false;
    this.gen++;
    this.clearTimers();
    window.removeEventListener("online", this.onOnline);
    this.teardown();
    this.store.patch("video", { state: "idle", error: null, attempt: 0, blocked: false });
  }

  /** After sign-in/out: forget the cached source decision and reconnect if wanted. */
  resetSource(): void {
    this.source = null;
    if (this.wanted) this.retry();
  }

  /** Call from a user gesture when autoplay was blocked. */
  async resumePlayback(): Promise<void> {
    try {
      await this.element.play();
      this.store.patch("video", { blocked: false });
    } catch { /* still blocked; leave the prompt up */ }
  }

  /** "remote" on the Vercel deployment (sign-in + VPS), "direct" when served by the Pi or with ?whep=. */
  async sourceKind(): Promise<StreamSource["kind"]> {
    this.source ??= this.resolveSource();
    return (await this.source).kind;
  }

  getStats(): Promise<RTCStatsReport | null> {
    return this.pc ? this.pc.getStats() : Promise.resolve(null);
  }

  // ─── internals ─────────────────────────────────────────────────────────────

  private patch(state: VideoState, error: string | null = null): void {
    this.store.patch("video", { state, error, attempt: this.attempt });
  }

  private async connect(): Promise<boolean> {
    const gen = ++this.gen;
    this.teardown();
    this.patch(this.attempt > 0 ? "reconnecting" : "connecting");
    const ctrl = new AbortController();
    this.abort = ctrl;
    const stale = () => gen !== this.gen;

    try {
      this.source ??= this.resolveSource();
      const source = await this.source;
      const target = await source.target();
      if (stale()) return false;
      this.token = target.token;
      this.store.patch("video", { url: target.whepUrl });

      const iceServers = await this.fetchIceServers(target, ctrl.signal);
      if (stale()) return false;

      const pc = new RTCPeerConnection({ iceServers });
      this.pc = pc;
      pc.addTransceiver("video", { direction: "recvonly" });
      pc.addTransceiver("audio", { direction: "recvonly" });

      const gotTrack = new Promise<void>((resolve) => {
        pc.ontrack = (ev) => {
          if (ev.track.kind !== "video") return;
          ev.track.addEventListener("ended", () => { if (pc === this.pc) this.scheduleReconnect("Camera track ended"); });
          this.element.srcObject = ev.streams[0] ?? new MediaStream([ev.track]);
          this.play();
          resolve();
        };
      });
      pc.onconnectionstatechange = () => this.onConnectionState(pc);

      await pc.setLocalDescription(await pc.createOffer());
      await this.waitForIceGathering(pc);
      if (stale()) return false;

      const res = await this.withTimeout(fetch(target.whepUrl, {
        method: "POST",
        headers: { "Content-Type": "application/sdp", ...this.authHeader() },
        body: pc.localDescription!.sdp,
        signal: ctrl.signal,
      }), ctrl, "Media server did not respond");
      if (stale()) return false;

      if (res.status === 404) throw new StreamOffline("Camera is not publishing");
      if (res.status === 401 || res.status === 403) {
        throw new Error(source.kind === "remote" ? "Media server rejected the access token" : "Media server requires credentials");
      }
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        if (/no one is publishing|no stream is available/i.test(body)) throw new StreamOffline("Camera is not publishing");
        if (/maximum reader count/i.test(body)) throw new Error("Viewer limit reached on the media server — waiting for a free slot");
        throw new Error(`Media server responded ${res.status}`);
      }

      const loc = res.headers.get("Location");
      this.resource = loc ? new URL(loc, target.whepUrl).toString() : null;
      await pc.setRemoteDescription({ type: "answer", sdp: await res.text() });
      // ontrack fires as soon as the answer is applied — before ICE/DTLS connect. LIVE requires real media.
      await this.withTimeout(gotTrack.then(() => this.firstMedia(pc, ctrl.signal)), ctrl,
        "Connected, but no video arrived — media ports (UDP/TCP 8189) or TURN may be blocked on this network");
      if (stale()) return false;

      this.attempt = 0;
      this.patch("live");
      return true;
    } catch (e) {
      if (stale()) return false;
      if (e instanceof AuthRequiredError) {
        // Waiting for the operator; sign-in calls resetSource().
        this.teardown();
        this.patch("unauthorized", e.message);
        return false;
      }
      if (e instanceof StreamOffline) {
        this.scheduleReconnect(e.message, "offline");
        return false;
      }
      const msg = e instanceof StreamApiError ? e.message
        : e instanceof TypeError ? "Media server unreachable — check your network"
        : e instanceof Error ? e.message : "Video failed";
      // 503 = this deployment has no stream config; retrying won't help until an admin fixes it.
      if (e instanceof StreamApiError && (e.status === 503 || e.status === 403)) {
        this.teardown();
        this.patch("error", msg);
        return false;
      }
      this.scheduleReconnect(msg);
      return false;
    }
  }

  private authHeader(): Record<string, string> {
    return this.token ? { Authorization: `Bearer ${this.token}` } : {};
  }

  /** MediaMTX advertises STUN/TURN servers (with time-limited TURN credentials) on OPTIONS. */
  private async fetchIceServers(target: { whepUrl: string }, signal: AbortSignal): Promise<RTCIceServer[]> {
    try {
      const res = await fetch(target.whepUrl, { method: "OPTIONS", headers: this.authHeader(), signal });
      return res.ok ? parseIceServers(res.headers.get("Link")) : [];
    } catch {
      return []; // host candidates may still work; the POST reports real reachability
    }
  }

  /** Resolves once video data has actually arrived: a decoded frame, or received RTP packets (even if autoplay is blocked). */
  private firstMedia(pc: RTCPeerConnection, signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      const done = () => { clearInterval(poll); this.element.removeEventListener("loadeddata", done); resolve(); };
      const check = async () => {
        if (signal.aborted || pc !== this.pc) return done();
        if (this.element.readyState >= 2) return done();
        const stats = await pc.getStats().catch(() => null);
        stats?.forEach((r: { type?: string; kind?: string; packetsReceived?: number }) => {
          if (r.type === "inbound-rtp" && r.kind === "video" && (r.packetsReceived ?? 0) > 0) done();
        });
      };
      this.element.addEventListener("loadeddata", done);
      const poll = setInterval(() => void check(), 200);
      void check();
    });
  }

  private waitForIceGathering(pc: RTCPeerConnection): Promise<void> {
    if (pc.iceGatheringState === "complete") return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => { clearTimeout(t); pc.removeEventListener("icegatheringstatechange", check); resolve(); };
      const check = () => { if (pc.iceGatheringState === "complete") done(); };
      const t = setTimeout(done, this.opts.gatherMs);
      pc.addEventListener("icegatheringstatechange", check);
    });
  }

  private withTimeout<T>(p: Promise<T>, ctrl: AbortController, message: string): Promise<T> {
    let t: ReturnType<typeof setTimeout>;
    return Promise.race([
      p,
      new Promise<never>((_, reject) => { t = setTimeout(() => { ctrl.abort(); reject(new Error(message)); }, this.opts.timeoutMs); }),
    ]).finally(() => clearTimeout(t));
  }

  private onConnectionState(pc: RTCPeerConnection): void {
    if (pc !== this.pc) return;
    switch (pc.connectionState) {
      case "connected":
        if (this.graceTimer) { clearTimeout(this.graceTimer); this.graceTimer = null; }
        if (this.store.state.video.state === "reconnecting" && this.element.srcObject) this.patch("live");
        break;
      case "disconnected":
        // Often a brief Wi-Fi hiccup; ICE may recover without renegotiating.
        if (!this.graceTimer) {
          this.patch("reconnecting", "Network interrupted");
          this.graceTimer = setTimeout(() => {
            this.graceTimer = null;
            if (pc === this.pc && pc.connectionState !== "connected") this.scheduleReconnect("Connection lost");
          }, this.opts.graceMs);
        }
        break;
      case "failed":
      case "closed":
        this.scheduleReconnect(pc.connectionState === "failed" ? "Connection failed — media ports may be blocked" : "Stream closed");
        break;
    }
  }

  private scheduleReconnect(reason: string, state: VideoState = "reconnecting"): void {
    this.teardown();
    if (!this.wanted) return;
    this.gen++;
    this.attempt++;
    const { baseMs, maxMs } = this.opts.backoff;
    const delay = Math.min(maxMs, baseMs * 2 ** Math.min(this.attempt - 1, 10)) * (0.8 + Math.random() * 0.4);
    this.patch(state, reason);
    this.clearTimers();
    this.retryTimer = setTimeout(() => { this.retryTimer = null; void this.connect(); }, delay);
  }

  private play(): void {
    this.element.play().then(
      () => { if (this.store.state.video.blocked) this.store.patch("video", { blocked: false }); },
      (e: unknown) => {
        // Muted autoplay is normally allowed; some browsers still block it (e.g. low-power mode).
        if (e instanceof DOMException && e.name === "NotAllowedError") this.store.patch("video", { blocked: true });
      },
    );
  }

  private clearTimers(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.graceTimer) clearTimeout(this.graceTimer);
    this.retryTimer = this.graceTimer = null;
  }

  private teardown(): void {
    this.abort?.abort();
    this.abort = null;
    if (this.graceTimer) { clearTimeout(this.graceTimer); this.graceTimer = null; }
    if (this.resource) {
      // Frees the server-side session immediately instead of waiting for its ICE timeout.
      fetch(this.resource, { method: "DELETE", headers: this.authHeader(), keepalive: true }).catch(() => {});
    }
    this.resource = null;
    if (this.pc) {
      this.pc.ontrack = null;
      this.pc.onconnectionstatechange = null;
      this.pc.close();
      this.pc = null;
    }
    this.element.srcObject = null;
  }
}
