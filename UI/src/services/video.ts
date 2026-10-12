/**
 * WHEP (WebRTC-HTTP Egress) client for MediaMTX on the Pi (/cam/whep).
 * Receive-only. Reports real states into the store; never fakes a live feed.
 */
import type { Store } from "../app/store";

export class VideoStream {
  private pc: RTCPeerConnection | null = null;
  private resource: string | null = null;
  readonly element: HTMLVideoElement;

  constructor(private store: Store, private url: string) {
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.autoplay = true;
    v.crossOrigin = "anonymous";
    this.element = v;
  }

  get live(): boolean { return this.store.state.video.state === "live"; }

  async start(timeoutMs = 8000): Promise<boolean> {
    if (this.pc) return this.live;
    if (typeof RTCPeerConnection !== "function") {
      this.store.patch("video", { state: "unavailable", url: this.url, error: "WebRTC is not supported by this browser" });
      return false;
    }
    this.store.patch("video", { state: "connecting", url: this.url, error: null });
    const pc = new RTCPeerConnection();
    this.pc = pc;
    pc.addTransceiver("video", { direction: "recvonly" });
    pc.addTransceiver("audio", { direction: "recvonly" });

    const gotTrack = new Promise<void>((resolve) => {
      pc.ontrack = (ev) => {
        if (ev.track.kind !== "video") return;
        this.element.srcObject = ev.streams[0] ?? new MediaStream([ev.track]);
        this.element.play().catch(() => { /* autoplay muted should succeed */ });
        resolve();
      };
    });
    pc.onconnectionstatechange = () => {
      if (pc !== this.pc) return;
      if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
        this.store.patch("video", { state: "error", error: `WebRTC ${pc.connectionState}` });
      }
    };

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      const res = await fetch(this.url, {
        method: "POST",
        headers: { "Content-Type": "application/sdp" },
        body: pc.localDescription!.sdp,
        signal: ctrl.signal,
      }).finally(() => clearTimeout(t));
      if (res.status === 404) throw new Error("No camera stream published at /cam/whep");
      if (!res.ok) throw new Error(`WHEP server responded ${res.status}`);
      const loc = res.headers.get("Location");
      this.resource = loc ? new URL(loc, this.url).toString() : null;
      await pc.setRemoteDescription({ type: "answer", sdp: await res.text() });
      await Promise.race([
        gotTrack,
        new Promise((_, rej) => setTimeout(() => rej(new Error("Connected, but no video track arrived")), timeoutMs)),
      ]);
      if (pc !== this.pc) return false;
      this.store.patch("video", { state: "live", error: null });
      return true;
    } catch (e) {
      const msg = e instanceof Error ? (e.name === "AbortError" ? "Camera server did not respond" : e.message) : "Video failed";
      this.teardown();
      this.store.patch("video", { state: e instanceof TypeError ? "unavailable" : "error", error: msg });
      return false;
    }
  }

  stop(): void {
    this.teardown();
    this.store.patch("video", { state: "idle", error: null });
  }

  private teardown(): void {
    if (this.resource) fetch(this.resource, { method: "DELETE" }).catch(() => {});
    this.resource = null;
    this.pc?.close();
    this.pc = null;
    this.element.srcObject = null;
  }
}
