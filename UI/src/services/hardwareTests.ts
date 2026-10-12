/**
 * Actuator tests. Protocol v1 has no actuator feedback, so a test can only
 * prove the robot *processed* the command (STATUS ack_seq ≥ our last seq).
 * Physical movement is confirmed by the operator, never assumed.
 */
import { encodeDrive, encodeHead, encodeLight } from "./protocol";
import type { Store, TestId } from "../app/store";
import type { RobotLink } from "./transport";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function waitForAck(store: Store, seq: number, timeoutMs = 2500): Promise<boolean> {
  return new Promise((resolve) => {
    const ok = () => (store.state.telemetry.ackSeq ?? -1) >= seq;
    if (ok()) return resolve(true);
    const t = setTimeout(() => { unsub(); resolve(false); }, timeoutMs);
    const unsub = store.subscribe(() => { if (ok()) { clearTimeout(t); unsub(); resolve(true); } });
  });
}

export class HardwareTests {
  constructor(private store: Store, private link: RobotLink) {}

  private guard(id: TestId): boolean {
    if (this.link.connected) return true;
    this.store.setTest(id, { status: "unavailable", detail: "Connect to the robot first" });
    return false;
  }

  private async send(lines: Array<(seq: number) => string>, gapMs: number): Promise<number> {
    let last = 0;
    for (const make of lines) {
      last = this.link.seq.next();
      this.link.send(make(last));
      await sleep(gapMs);
    }
    return last;
  }

  private async finish(id: TestId, last: number, what: string): Promise<void> {
    const acked = await waitForAck(this.store, last);
    this.store.setTest(id, acked
      ? { status: "acknowledged", detail: `Robot acknowledged. Did the ${what}?` }
      : { status: "failed", detail: "No acknowledgement from robot (STATUS ack_seq)" });
  }

  async panTilt(): Promise<void> {
    if (!this.guard("pantilt")) return;
    this.store.setTest("pantilt", { status: "running", detail: "Sweeping camera: left, right, up, down, centre" });
    const poses: Array<[number, number]> = [[-30, 0], [30, 0], [0, 15], [0, -15], [0, 0]];
    const lines = poses.flatMap(([yaw, pitch]) =>
      Array.from({ length: 12 }, () => (s: number) => encodeHead(s, { yaw, pitch, roll: 0 })));
    const last = await this.send(lines, 50);
    await this.finish("pantilt", last, "camera sweep left, right, up and down");
  }

  async motors(): Promise<void> {
    if (!this.guard("motors")) return;
    this.store.setTest("motors", { status: "running", detail: "Forward pulse 0.25 for 0.4 s, then stop" });
    const fwd = Array.from({ length: 8 }, () => (s: number) => encodeDrive(s, { linear: 0.25, angular: 0, speedMode: 1 }));
    const stop = Array.from({ length: 4 }, () => (s: number) => encodeDrive(s, { linear: 0, angular: 0, speedMode: 1 }));
    const last = await this.send([...fwd, ...stop], 50);
    await this.finish("motors", last, "wheels turn briefly and stop");
  }

  async lights(): Promise<void> {
    if (!this.guard("lights")) return;
    this.store.setTest("lights", { status: "running", detail: "LED 60% for 1.5 s" });
    const { brightness, visionMode } = this.store.state.control;
    await this.send([(s) => encodeLight(s, { brightness: 60, visionMode: 0 })], 1500);
    const last = await this.send([(s) => encodeLight(s, { brightness, visionMode })], 0);
    await this.finish("lights", last, "LED switch on and back");
  }

  confirm(id: TestId, observed: boolean): void {
    this.store.setTest(id, observed
      ? { status: "passed", detail: "Confirmed by operator" }
      : { status: "failed", detail: "Acknowledged but operator saw no movement — check wiring / ESP32" });
  }
}
