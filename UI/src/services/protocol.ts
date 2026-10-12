/**
 * CN360 Command Protocol v1 (plan.md, Phase 1).
 * One ASCII message per WebSocket frame; the Pi forwards the same line to the
 * ESP32 over serial. Values are clamped here AND on the robot side.
 *
 *   DRIVE,<seq>,<linear -1..1>,<angular -1..1>,<speed_mode 1|2>
 *   HEAD,<seq>,<yaw deg>,<pitch deg>,<roll deg>
 *   LIGHT,<seq>,<brightness 0..100>,<vision_mode 0|1>
 *   STATUS,<seq>,<battery_v>,<ack_seq>             (Pi → browser)
 *
 * Proposed v1.1 addition (pending team approval in Docs/protocol.md):
 *   HELLO,<seq>,<source mock|hardware>,<server_version>   (Pi → browser, on connect)
 * Without HELLO the UI reports the robot source as "unverified".
 */

export const LIMITS = {
  yaw: { min: -90, max: 90 },
  pitch: { min: -45, max: 45 },
  roll: { min: -45, max: 45 },
  brightness: { min: 0, max: 100 },
} as const;

export const SEND_RATE_HZ = 20;
export const FAILSAFE_MS = 300;

export type SpeedMode = 1 | 2;
export type VisionMode = 0 | 1;

export interface DriveCommand { linear: number; angular: number; speedMode: SpeedMode }
export interface HeadCommand { yaw: number; pitch: number; roll: number }
export interface LightCommand { brightness: number; visionMode: VisionMode }

export interface StatusMessage { type: "STATUS"; seq: number; batteryV: number; ackSeq: number }
export interface HelloMessage { type: "HELLO"; seq: number; source: "mock" | "hardware" | "unknown"; version: string }
export type InboundMessage = StatusMessage | HelloMessage;

export const clamp = (v: number, min: number, max: number) =>
  Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : 0;

/** Port of NormalizeAngle() from the Unity HeadTracker: map 0..360 → -180..180. */
export function normalizeAngle(deg: number): number {
  let a = deg % 360;
  if (a > 180) a -= 360;
  if (a <= -180) a += 360;
  return a;
}

// toFixed always uses "." regardless of locale (a bug the Unity prototype had).
const f = (v: number, d: number) => (Object.is(v, -0) ? 0 : v).toFixed(d).replace(/^-0(\.0+)?$/, "0$1");

export function encodeDrive(seq: number, c: DriveCommand): string {
  return `DRIVE,${seq},${f(clamp(c.linear, -1, 1), 2)},${f(clamp(c.angular, -1, 1), 2)},${c.speedMode === 2 ? 2 : 1}`;
}

export function encodeHead(seq: number, c: HeadCommand): string {
  const yaw = clamp(normalizeAngle(c.yaw), LIMITS.yaw.min, LIMITS.yaw.max);
  const pitch = clamp(normalizeAngle(c.pitch), LIMITS.pitch.min, LIMITS.pitch.max);
  const roll = clamp(normalizeAngle(c.roll), LIMITS.roll.min, LIMITS.roll.max);
  return `HEAD,${seq},${f(yaw, 1)},${f(pitch, 1)},${f(roll, 1)}`;
}

export function encodeLight(seq: number, c: LightCommand): string {
  const b = Math.round(clamp(c.brightness, LIMITS.brightness.min, LIMITS.brightness.max));
  return `LIGHT,${seq},${b},${c.visionMode === 1 ? 1 : 0}`;
}

/** Parse a message from the Pi. Returns null for anything malformed — never throws. */
export function parseInbound(raw: unknown): InboundMessage | null {
  if (typeof raw !== "string") return null;
  const parts = raw.trim().split(",");
  const seq = Number(parts[1]);
  if (!Number.isInteger(seq) || seq < 0) return null;

  if (parts[0] === "STATUS" && parts.length === 4) {
    const batteryV = Number(parts[2]);
    const ackSeq = Number(parts[3]);
    if (!Number.isFinite(batteryV) || !Number.isInteger(ackSeq)) return null;
    return { type: "STATUS", seq, batteryV, ackSeq };
  }
  if (parts[0] === "HELLO" && parts.length >= 3) {
    const src = parts[2];
    const source = src === "mock" || src === "hardware" ? src : "unknown";
    return { type: "HELLO", seq, source, version: parts[3] ?? "" };
  }
  return null;
}

/** Monotonic sequence counter shared by all outbound commands. */
export class SeqCounter {
  private n = 0;
  next(): number {
    this.n = (this.n + 1) % 1_000_000_000;
    return this.n;
  }
  get current(): number { return this.n; }
}
