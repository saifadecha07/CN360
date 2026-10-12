import { describe, it, expect } from "vitest";
import { initialState, type AppState } from "../src/app/store";
import { buildChecklist, liveReady, progress } from "../src/services/readiness";
import { vrUnavailableReason, type Capabilities } from "../src/services/capabilities";

const caps = (o: Partial<Capabilities> = {}): Capabilities => ({
  webgl: true, secureContext: true, webxr: false, immersiveVr: false, webrtc: true, websocket: true,
  gamepad: true, fullscreen: true, reducedMotion: false, likelyPico: false, ...o,
});

function readyState(now: number): AppState {
  const s = initialState();
  s.link = { ...s.link, state: "connected", source: "hardware" };
  s.telemetry = { ...s.telemetry, lastStatusAt: now - 500, batteryV: 7.9 };
  s.video = { ...s.video, state: "live" };
  s.tests = { ...s.tests, pantilt: { status: "passed", detail: "" } };
  return s;
}

describe("readiness", () => {
  const now = 1_000_000;
  it("blocks live entry on a fresh app", () => {
    const r = liveReady(buildChecklist(initialState(), caps(), now));
    expect(r.ready).toBe(false);
    expect(r.blocking.map((c) => c.id)).toEqual(["link", "telemetry", "video", "pantilt"]);
  });
  it("allows live entry when link, telemetry, video and pan/tilt pass — headset optional", () => {
    const checks = buildChecklist(readyState(now), caps(), now);
    expect(liveReady(checks).ready).toBe(true);
    expect(progress(checks)).toBe(1);
  });
  it("treats stale telemetry as not ready", () => {
    const s = readyState(now);
    s.telemetry.lastStatusAt = now - 5000;
    expect(liveReady(buildChecklist(s, caps(), now)).blocking.map((c) => c.id)).toEqual(["telemetry"]);
  });
  it("requires operator confirmation of pan/tilt, not just an ack", () => {
    const s = readyState(now);
    s.tests.pantilt = { status: "acknowledged", detail: "" };
    expect(liveReady(buildChecklist(s, caps(), now)).ready).toBe(false);
  });
  it("labels a mock robot as simulated in the link check", () => {
    const s = readyState(now);
    s.link.source = "mock";
    expect(buildChecklist(s, caps(), now).find((c) => c.id === "link")!.detail).toMatch(/simulated/);
  });
});

describe("vrUnavailableReason", () => {
  it("explains each failure mode", () => {
    expect(vrUnavailableReason(caps({ webxr: false }))).toMatch(/no WebXR/);
    expect(vrUnavailableReason(caps({ webxr: true, secureContext: false }))).toMatch(/HTTPS/);
    expect(vrUnavailableReason(caps({ webxr: true }))).toMatch(/no VR headset/);
    expect(vrUnavailableReason(caps({ webxr: true, immersiveVr: true }))).toBeNull();
  });
});
