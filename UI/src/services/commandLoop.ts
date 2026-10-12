/**
 * 20 Hz command loop (plan.md Phase 2).
 * - HEAD is sent every tick only while the head link is enabled.
 * - DRIVE is sent every tick only while driving is armed. When disarmed we stop
 *   sending, so the Pi/ESP32 300 ms failsafe halts the motors; we also send one
 *   explicit zero DRIVE on disarm.
 * - LIGHT is sent on change and then refreshed once per second. Nothing is sent
 *   until the operator first changes lighting, so connecting never overrides
 *   the robot's own light state.
 */
import { encodeDrive, encodeHead, encodeLight, SEND_RATE_HZ } from "./protocol";
import type { Store } from "../app/store";
import type { RobotLink } from "./transport";

export class CommandLoop {
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastLight: string;
  private lastLightAt = 0;
  private lightSent = false;
  private wasArmed = false;

  constructor(private store: Store, private link: RobotLink) {
    this.lastLight = lightKey(store.state.control); // baseline: operator hasn't touched lights
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), 1000 / SEND_RATE_HZ);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.disarm();
  }

  disarm(): void {
    if (this.store.state.control.driveArmed || this.wasArmed) {
      this.store.patch("control", { driveArmed: false, drive: { linear: 0, angular: 0 } });
      this.emit(encodeDrive(this.link.seq.next(), { linear: 0, angular: 0, speedMode: 1 }));
      this.wasArmed = false;
    }
  }

  /** Exposed for tests. */
  tick(now = Date.now()): void {
    if (!this.link.connected) return;
    const c = this.store.state.control;

    if (c.headLink) this.emit(encodeHead(this.link.seq.next(), c.head));

    if (c.driveArmed) {
      this.wasArmed = true;
      this.emit(encodeDrive(this.link.seq.next(), { ...c.drive, speedMode: c.speedMode }));
    } else if (this.wasArmed) {
      this.disarm();
    }

    const key = lightKey(c);
    if (key !== this.lastLight || (this.lightSent && now - this.lastLightAt >= 1000)) {
      this.emit(encodeLight(this.link.seq.next(), { brightness: c.brightness, visionMode: c.visionMode }));
      this.lastLight = key;
      this.lastLightAt = now;
      this.lightSent = true;
    }
  }

  private emit(line: string): void {
    if (this.link.send(line)) this.store.patch("telemetry", { sentSeq: this.link.seq.current });
  }
}

const lightKey = (c: { brightness: number; visionMode: number }) => `${Math.round(c.brightness)}|${c.visionMode}`;
