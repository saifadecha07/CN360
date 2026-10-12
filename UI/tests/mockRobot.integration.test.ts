/** End-to-end protocol check: real RobotLink ↔ tools/mock-robot.mjs over a real WebSocket. */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { WebSocket as NodeWS } from "ws";
import { Store } from "../src/app/store";
import { RobotLink } from "../src/services/transport";
import { HardwareTests } from "../src/services/hardwareTests";

const PORT = 18765;
let proc: ChildProcess;

const until = async (cond: () => boolean, ms = 4000) => {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error("timeout");
    await new Promise((r) => setTimeout(r, 25));
  }
};

beforeAll(async () => {
  proc = spawn(process.execPath, ["tools/mock-robot.mjs", "--port", String(PORT), "--quiet"], { stdio: ["ignore", "pipe", "inherit"] });
  await new Promise<void>((res) => proc.stdout!.once("data", () => res()));
});
afterAll(() => { proc.kill(); });

describe("mock robot integration", () => {
  it("identifies as simulated, acks commands, and rejects a second operator", async () => {
    const store = new Store();
    const link = new RobotLink(store, `ws://localhost:${PORT}/ws`, NodeWS as unknown as new (u: string) => WebSocket);
    link.start();
    await until(() => store.state.link.state === "connected");
    await until(() => store.state.link.source === "mock");

    const tests = new HardwareTests(store, link);
    await tests.lights();
    expect(store.state.tests.lights.status).toBe("acknowledged");
    expect(store.state.telemetry.batteryV).toBeGreaterThan(6);

    const store2 = new Store();
    const link2 = new RobotLink(store2, `ws://localhost:${PORT}/ws`, NodeWS as unknown as new (u: string) => WebSocket);
    link2.start();
    await until(() => store2.state.link.error === "Another operator is already connected");
    link2.stop();
    link.stop();
  }, 15_000);
});
