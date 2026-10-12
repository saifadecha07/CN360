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
