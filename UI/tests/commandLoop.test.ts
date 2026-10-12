import { describe, it, expect, beforeEach } from "vitest";
import { Store } from "../src/app/store";
import { RobotLink } from "../src/services/transport";
import { CommandLoop } from "../src/services/commandLoop";
import { FakeWebSocket } from "./fakes";

describe("CommandLoop", () => {
  let store: Store, link: RobotLink, loop: CommandLoop, ws: FakeWebSocket;
  beforeEach(() => {
    FakeWebSocket.instances = [];
    store = new Store();
    link = new RobotLink(store, "ws://x/ws", FakeWebSocket as unknown as new (u: string) => WebSocket);
    loop = new CommandLoop(store, link);
    link.start();
    ws = FakeWebSocket.last();
  });
  const types = () => ws.sent.map((l) => l.split(",")[0]);

  it("sends nothing while disconnected", () => {
    store.patch("control", { headLink: true, driveArmed: true });
    loop.tick(0);
    expect(ws.sent).toEqual([]);
  });

  it("sends nothing by default when connected (no head link, not armed, lights untouched)", () => {
    ws.open();
    loop.tick(0); loop.tick(2000);
    expect(ws.sent).toEqual([]);
  });

  it("sends HEAD only while head link is on", () => {
    ws.open();
    store.patch("control", { headLink: true, head: { yaw: 10, pitch: 5, roll: 0 } });
    loop.tick(0);
    expect(ws.sent[0]).toMatch(/^HEAD,1,10\.0,5\.0,0\.0$/);
  });

  it("sends DRIVE every tick while armed and a zero DRIVE on disarm", () => {
    ws.open();
    store.patch("control", { driveArmed: true, drive: { linear: 0.4, angular: 0 } });
    loop.tick(0); loop.tick(50);
    expect(types()).toEqual(["DRIVE", "DRIVE"]);
    store.patch("control", { driveArmed: false });
    loop.tick(100);
    expect(ws.sent.at(-1)).toMatch(/^DRIVE,\d+,0\.00,0\.00,1$/);
    loop.tick(150);
    expect(ws.sent).toHaveLength(3); // nothing further — robot failsafe holds it stopped
  });

  it("sends LIGHT on change, then refreshes every second", () => {
    ws.open();
    store.patch("control", { brightness: 60 });
    loop.tick(0);
    expect(ws.sent).toEqual(["LIGHT,1,60,0"]);
    loop.tick(500);
    expect(ws.sent).toHaveLength(1);
    loop.tick(1000);
    expect(ws.sent.at(-1)).toBe("LIGHT,2,60,0");
  });

  it("uses one monotonically increasing seq across message types", () => {
    ws.open();
    store.patch("control", { headLink: true, driveArmed: true, brightness: 10 });
    loop.tick(0);
    expect(ws.sent.map((l) => Number(l.split(",")[1]))).toEqual([1, 2, 3]);
    expect(store.state.telemetry.sentSeq).toBe(3);
  });
});
