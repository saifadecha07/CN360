import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { Store } from "../src/app/store";
import { RobotLink } from "../src/services/transport";
import { FakeWebSocket } from "./fakes";

describe("RobotLink", () => {
  let store: Store;
  let link: RobotLink;
  beforeEach(() => {
    vi.useFakeTimers();
    FakeWebSocket.instances = [];
    store = new Store();
    link = new RobotLink(store, "ws://robot/ws", FakeWebSocket as unknown as new (u: string) => WebSocket);
  });
  afterEach(() => { link.stop(); vi.useRealTimers(); });

  it("goes connecting → connected", () => {
    link.start();
    expect(store.state.link.state).toBe("connecting");
    FakeWebSocket.last().open();
    expect(store.state.link.state).toBe("connected");
    expect(store.state.link.source).toBe("unverified");
  });

  it("records HELLO source and STATUS telemetry", () => {
    link.start();
    const ws = FakeWebSocket.last();
    ws.open();
    ws.receive("HELLO,1,mock,veil-mock/0.1");
    ws.receive("STATUS,2,7.91,15");
    expect(store.state.link.source).toBe("mock");
    expect(store.state.telemetry).toMatchObject({ batteryV: 7.91, ackSeq: 15 });
    expect(store.state.telemetry.lastStatusAt).not.toBeNull();
  });

  it("ignores malformed messages", () => {
    link.start();
    const ws = FakeWebSocket.last();
    ws.open();
    ws.receive("garbage");
    expect(store.state.telemetry.batteryV).toBeNull();
  });

  it("drops commands while disconnected instead of queueing", () => {
    link.start();
    expect(link.send("DRIVE,1,0.50,0.00,1")).toBe(false);
    FakeWebSocket.last().open();
    expect(link.send("DRIVE,2,0.50,0.00,1")).toBe(true);
    expect(FakeWebSocket.last().sent).toEqual(["DRIVE,2,0.50,0.00,1"]);
  });

  it("reports errors and reconnects with backoff", () => {
    link.start();
    FakeWebSocket.last().drop();
    expect(store.state.link).toMatchObject({ state: "error", error: "Robot server unreachable" });
    expect(FakeWebSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(1000);
    expect(FakeWebSocket.instances).toHaveLength(2);
    FakeWebSocket.last().drop();
    vi.advanceTimersByTime(1999);
    expect(FakeWebSocket.instances).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(FakeWebSocket.instances).toHaveLength(3);
  });

  it("surfaces the server's close reason (e.g. second operator rejected)", () => {
    link.start();
    FakeWebSocket.last().drop(1013, "Another operator is already connected");
    expect(store.state.link.error).toBe("Another operator is already connected");
  });

  it("stop() halts reconnection and clears source", () => {
    link.start();
    FakeWebSocket.last().drop();
    link.stop();
    vi.advanceTimersByTime(20_000);
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(store.state.link.state).toBe("disconnected");
  });
});
