import { describe, it, expect } from "vitest";
import { encodeDrive, encodeHead, encodeLight, parseInbound, normalizeAngle, SeqCounter, clamp } from "../src/services/protocol";

describe("protocol v1 encoding", () => {
  it("encodes DRIVE with clamping and 2 decimals", () => {
    expect(encodeDrive(1, { linear: 0.5, angular: -0.25, speedMode: 1 })).toBe("DRIVE,1,0.50,-0.25,1");
    expect(encodeDrive(2, { linear: 3, angular: -9, speedMode: 2 })).toBe("DRIVE,2,1.00,-1.00,2");
  });
  it("never emits negative zero", () => {
    expect(encodeDrive(3, { linear: -0, angular: -0.001, speedMode: 1 })).toBe("DRIVE,3,0.00,0.00,1");
  });
  it("encodes HEAD, normalising and clamping to servo limits", () => {
    expect(encodeHead(4, { yaw: 30, pitch: -10, roll: 2 })).toBe("HEAD,4,30.0,-10.0,2.0");
    expect(encodeHead(5, { yaw: 350, pitch: 60, roll: 0 })).toBe("HEAD,5,-10.0,45.0,0.0");
    expect(encodeHead(6, { yaw: 120, pitch: -90, roll: 0 })).toBe("HEAD,6,90.0,-45.0,0.0");
  });
  it("encodes LIGHT as integers", () => {
    expect(encodeLight(7, { brightness: 55.6, visionMode: 1 })).toBe("LIGHT,7,56,1");
    expect(encodeLight(8, { brightness: 140, visionMode: 0 })).toBe("LIGHT,8,100,0");
  });
  it("treats NaN as 0", () => {
    expect(clamp(NaN, -1, 1)).toBe(0);
    expect(encodeDrive(9, { linear: NaN, angular: Infinity, speedMode: 1 })).toBe("DRIVE,9,0.00,0.00,1");
  });
  it("normalises angles like Unity HeadTracker.NormalizeAngle", () => {
    expect(normalizeAngle(270)).toBe(-90);
    expect(normalizeAngle(-270)).toBe(90);
    expect(normalizeAngle(180)).toBe(180);
  });
});

describe("protocol v1 parsing", () => {
  it("parses STATUS", () => {
    expect(parseInbound("STATUS,12,7.84,340")).toEqual({ type: "STATUS", seq: 12, batteryV: 7.84, ackSeq: 340 });
  });
  it("parses HELLO and maps unknown sources", () => {
    expect(parseInbound("HELLO,1,mock,veil-mock/0.1")).toMatchObject({ source: "mock", version: "veil-mock/0.1" });
    expect(parseInbound("HELLO,1,hardware")).toMatchObject({ source: "hardware" });
    expect(parseInbound("HELLO,1,whatever,x")).toMatchObject({ source: "unknown" });
  });
  it.each(["", "STATUS", "STATUS,1,7.8", "STATUS,x,7.8,1", "STATUS,1,abc,1", "DRIVE,1,0,0,1", "STATUS,-1,7,1", null, 42])(
    "rejects malformed %s", (raw) => expect(parseInbound(raw)).toBeNull());
});

describe("SeqCounter", () => {
  it("increments monotonically from 1", () => {
    const s = new SeqCounter();
    expect([s.next(), s.next(), s.current]).toEqual([1, 2, 2]);
  });
});
