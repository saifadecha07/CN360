/** Test doubles. */
export class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: { code: number; reason: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: string) { FakeWebSocket.instances.push(this); }
  send(d: string) { this.sent.push(d); }
  close() { this.readyState = 3; }
  // helpers
  open() { this.readyState = 1; this.onopen?.(); }
  receive(data: string) { this.onmessage?.({ data }); }
  drop(code = 1006, reason = "") { this.readyState = 3; this.onclose?.({ code, reason }); }
  static last() { return FakeWebSocket.instances[FakeWebSocket.instances.length - 1]; }
}

/** Minimal RTCPeerConnection stand-in: records config, emits a video track after the answer. */
export class FakePC extends EventTarget {
  static last: FakePC | null = null;
  static all: FakePC[] = [];
  connectionState: RTCPeerConnectionState = "new";
  iceGatheringState: RTCIceGatheringState = "complete";
  localDescription: { sdp: string } | null = null;
  ontrack: ((ev: unknown) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  closed = false;
  constructor(public config: RTCConfiguration) { super(); FakePC.last = this; FakePC.all.push(this); }
  addTransceiver() {}
  async createOffer() { return { type: "offer", sdp: "v=0 offer" }; }
  async setLocalDescription(d: { sdp: string }) { this.localDescription = d; }
  async setRemoteDescription() {
    this.answered = true;
    queueMicrotask(() => {
      const track = Object.assign(new EventTarget(), { kind: "video" });
      this.ontrack?.({ track, streams: [{ id: "s" }] });
    });
  }
  /** Media "arrives" once the answer is applied, like a healthy connection. Set false to simulate blocked media. */
  mediaFlows = true;
  answered = false;
  async getStats() {
    return new Map(this.answered && this.mediaFlows ? [["in", { type: "inbound-rtp", kind: "video", packetsReceived: 42 }]] : []);
  }
  close() { this.closed = true; }
  setState(s: RTCPeerConnectionState) { this.connectionState = s; this.onconnectionstatechange?.(); }
}
