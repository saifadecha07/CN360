/**
 * WebSocket link to the Raspberry Pi (/ws).
 * - Auto-reconnect with exponential backoff (1s → 10s), only while started.
 * - Never queues commands while disconnected: a stale DRIVE must not be replayed.
 * - Feeds STATUS / HELLO into the store.
 */
import { parseInbound, SeqCounter } from "./protocol";
import type { Store } from "../app/store";

type WSCtor = new (url: string) => WebSocket;

export class RobotLink {
  readonly seq = new SeqCounter();
  private ws: WebSocket | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;
  private running = false;

  constructor(
    private store: Store,
    private url: string,
    private WS: WSCtor = WebSocket,
  ) {}

  get connected(): boolean { return this.ws?.readyState === 1; }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.attempt = 0;
    this.open();
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const ws = this.ws;
    this.ws = null;
    if (ws) { ws.onclose = null; ws.onerror = null; ws.onmessage = null; ws.close(); }
    this.store.patch("link", { state: "disconnected", error: null, attempt: 0, source: "unverified" });
  }

  /** Reconnect now (user-initiated retry), resetting backoff. */
  retry(): void {
    this.stop();
    this.start();
  }

  /** Send a pre-encoded protocol line. Returns false (and drops it) if not connected. */
  send(line: string): boolean {
    if (!this.connected) return false;
    this.ws!.send(line);
    return true;
  }

  private open(): void {
    this.attempt += 1;
    this.store.patch("link", { state: "connecting", url: this.url, attempt: this.attempt, error: null });
    let ws: WebSocket;
    try {
      ws = new this.WS(this.url);
    } catch (e) {
      this.fail(e instanceof Error ? e.message : "Invalid WebSocket URL");
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.attempt = 0;
      this.store.patch("link", { state: "connected", error: null, attempt: 0 });
    };
    ws.onmessage = (ev) => {
      const msg = parseInbound(ev.data);
      if (!msg) return;
      if (msg.type === "STATUS") {
        this.store.patch("telemetry", { batteryV: msg.batteryV, ackSeq: msg.ackSeq, lastStatusAt: Date.now() });
      } else {
        this.store.patch("link", { source: msg.source === "unknown" ? "unverified" : msg.source, serverVersion: msg.version });
      }
    };
    ws.onerror = () => { /* onclose follows with the useful information */ };
    ws.onclose = (ev) => {
      this.ws = null;
      const reason = ev.code === 1006 || !ev.reason ? "Robot server unreachable" : ev.reason;
      this.fail(reason);
    };
  }

  private fail(reason: string): void {
    this.store.patch("link", { state: "error", error: reason, source: "unverified" });
    this.store.patch("telemetry", { lastStatusAt: null });
    if (!this.running) return;
    const delay = Math.min(10_000, 1000 * 2 ** Math.min(this.attempt - 1, 4));
    this.timer = setTimeout(() => this.running && this.open(), delay);
  }
}
