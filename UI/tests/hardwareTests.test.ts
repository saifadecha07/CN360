import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { Store } from "../src/app/store";
import { RobotLink } from "../src/services/transport";
import { HardwareTests } from "../src/services/hardwareTests";
import { FakeWebSocket } from "./fakes";

describe("HardwareTests", () => {
  let store: Store, link: RobotLink, t: HardwareTests, ws: FakeWebSocket;
  beforeEach(() => {
    vi.useFakeTimers();
    FakeWebSocket.instances = [];
    store = new Store();
    link = new RobotLink(store, "ws://x/ws", FakeWebSocket as unknown as new (u: string) => WebSocket);
    t = new HardwareTests(store, link);
    link.start();
    ws = FakeWebSocket.last();
  });
  afterEach(() => { link.stop(); vi.useRealTimers(); });

  it("is unavailable while disconnected", async () => {
    await t.panTilt();
    expect(store.state.tests.pantilt.status).toBe("unavailable");
    expect(ws.sent).toEqual([]);
  });

  it("pan/tilt sweep becomes 'acknowledged' (not 'passed') when the robot acks", async () => {
    ws.open();
    const p = t.panTilt();
    await vi.advanceTimersByTimeAsync(60 * 50);
    const last = Number(ws.sent.at(-1)!.split(",")[1]);
    expect(ws.sent.every((l) => l.startsWith("HEAD,"))).toBe(true);
    ws.receive(`STATUS,1,7.9,${last}`);
    await p;
    expect(store.state.tests.pantilt.status).toBe("acknowledged");
    t.confirm("pantilt", true);
    expect(store.state.tests.pantilt.status).toBe("passed");
  });

  it("fails when no acknowledgement arrives", async () => {
    ws.open();
    const p = t.lights();
    await vi.advanceTimersByTimeAsync(5000);
    await p;
    expect(store.state.tests.lights.status).toBe("failed");
  });

  it("motor pulse ends with explicit stop commands", async () => {
    ws.open();
    const p = t.motors();
    await vi.advanceTimersByTimeAsync(5000);
    await p;
    expect(ws.sent.at(-1)).toMatch(/^DRIVE,\d+,0\.00,0\.00,1$/);
    expect(ws.sent.filter((l) => l.includes(",0.25,")).length).toBe(8);
  });
});
