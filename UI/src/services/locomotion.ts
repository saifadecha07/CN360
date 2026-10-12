/** Stick shaping (plan.md Phase 2: deadzone ~0.15, expo curve). */
export const DEADZONE = 0.15;
export const EXPO = 1.6;

export function shapeAxis(v: number, dz = DEADZONE, expo = EXPO): number {
  if (!Number.isFinite(v)) return 0;
  const a = Math.abs(v);
  if (a <= dz) return 0;
  const n = Math.min(1, (a - dz) / (1 - dz));
  return Math.sign(v) * n ** expo;
}

/** Thumbstick (x right +, y forward −) → protocol linear/angular. */
export function stickToDrive(x: number, y: number): { linear: number; angular: number } {
  return { linear: shapeAxis(-y), angular: shapeAxis(x) };
}

/** Convert a three.js viewer orientation to protocol degrees.
 *  Protocol follows the Unity prototype: yaw + = turn right, pitch + = look down. */
export function quatToHead(q: { x: number; y: number; z: number; w: number }): { yaw: number; pitch: number; roll: number } {
  const { x, y, z, w } = q;
  // Euler YXZ decomposition (yaw about Y, then pitch about X, then roll about Z).
  const m11 = 1 - 2 * (y * y + z * z), m13 = 2 * (x * z + y * w);
  const m21 = 2 * (x * y + z * w), m22 = 1 - 2 * (x * x + z * z);
  const m23 = 2 * (y * z - x * w), m33 = 1 - 2 * (x * x + y * y);
  const ex = Math.asin(Math.max(-1, Math.min(1, -m23)));
  let ey: number, ez: number;
  if (Math.abs(m23) < 0.9999999) { ey = Math.atan2(m13, m33); ez = Math.atan2(m21, m22); }
  else { ey = Math.atan2(-(2 * (x * z - y * w)), m11); ez = 0; }
  const deg = 180 / Math.PI;
  return { yaw: -ey * deg, pitch: -ex * deg, roll: -ez * deg };
}
