import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { shapeAxis, stickToDrive, quatToHead } from "../src/services/locomotion";

describe("stick shaping", () => {
  it("applies a 0.15 deadzone", () => {
    expect(shapeAxis(0.1)).toBe(0);
    expect(shapeAxis(-0.15)).toBe(0);
  });
  it("reaches full scale and keeps sign", () => {
    expect(shapeAxis(1)).toBe(1);
    expect(shapeAxis(-1)).toBe(-1);
    expect(shapeAxis(0.6)).toBeGreaterThan(0);
    expect(shapeAxis(0.6)).toBeLessThan(0.6); // expo softens mid-range
  });
  it("maps thumbstick forward (y = -1) to positive linear", () => {
    expect(stickToDrive(0, -1)).toEqual({ linear: 1, angular: 0 });
    expect(stickToDrive(1, 0).angular).toBe(1);
  });
});

describe("head pose → protocol degrees (yaw + right, pitch + down)", () => {
  const q = (x: number, y: number, z: number) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, "YXZ"));
  const D = Math.PI / 180;
  it("turning right gives positive yaw", () => {
    const h = quatToHead(q(0, -30 * D, 0));
    expect(h.yaw).toBeCloseTo(30, 4);
    expect(h.pitch).toBeCloseTo(0, 4);
  });
  it("looking down gives positive pitch", () => {
    expect(quatToHead(q(-20 * D, 0, 0)).pitch).toBeCloseTo(20, 4);
  });
  it("matches three.js YXZ decomposition for combined rotations", () => {
    const e = new THREE.Euler(0.3, -1.1, 0.2, "YXZ");
    const h = quatToHead(new THREE.Quaternion().setFromEuler(e));
    expect(h.yaw).toBeCloseTo(1.1 / D, 3);
    expect(h.pitch).toBeCloseTo(-0.3 / D, 3);
    expect(h.roll).toBeCloseTo(-0.2 / D, 3);
  });
});
