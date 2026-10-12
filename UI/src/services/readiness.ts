/** System readiness checklist for the Setup Lobby. Pure function of state. */
import type { AppState } from "../app/store";
import { vrUnavailableReason, type Capabilities } from "./capabilities";

export const TELEMETRY_STALE_MS = 3000;

export type CheckState = "pass" | "pending" | "fail" | "info";
export interface Check { id: string; label: string; state: CheckState; detail: string; requiredForLive: boolean }

export function telemetryFresh(s: AppState, now = Date.now()): boolean {
  return s.telemetry.lastStatusAt !== null && now - s.telemetry.lastStatusAt < TELEMETRY_STALE_MS;
}

export function buildChecklist(s: AppState, caps: Capabilities | null, now = Date.now()): Check[] {
  const link = s.link.state;
  const t = s.tests;
  const testState = (id: keyof AppState["tests"]): CheckState =>
    t[id].status === "passed" ? "pass"
    : t[id].status === "failed" ? "fail"
    : t[id].status === "unavailable" ? "fail"
    : "pending";

  return [
    {
      id: "render", label: "3D rendering", requiredForLive: true,
      state: caps === null ? "pending" : caps.webgl ? "pass" : "fail",
      detail: caps === null ? "Detecting…" : caps.webgl ? "WebGL available" : "WebGL is unavailable in this browser",
    },
    {
      id: "link", label: "Robot link", requiredForLive: true,
      state: link === "connected" ? "pass" : link === "error" ? "fail" : "pending",
      detail: link === "connected"
        ? `Connected${s.link.source === "mock" ? " · simulated robot" : s.link.source === "hardware" ? " · hardware" : " · source unverified"}`
        : link === "connecting" ? `Connecting (attempt ${s.link.attempt})` : s.link.error ?? "Not connected",
    },
    {
      id: "telemetry", label: "Telemetry", requiredForLive: true,
      state: telemetryFresh(s, now) ? "pass" : link === "connected" ? "pending" : "fail",
      detail: telemetryFresh(s, now) ? `STATUS received · ${s.telemetry.batteryV?.toFixed(2)} V` : "No recent STATUS from robot",
    },
    {
      id: "video", label: "Camera stream", requiredForLive: true,
      state: s.video.state === "live" ? "pass" : s.video.state === "connecting" || s.video.state === "idle" ? "pending" : "fail",
      detail: s.video.state === "live" ? "WebRTC video receiving" : s.video.error ?? (s.video.state === "connecting" ? "Negotiating WebRTC…" : "Not started"),
    },
    { id: "pantilt", label: "Pan / tilt", requiredForLive: true, state: testState("pantilt"), detail: t.pantilt.detail },
    { id: "motors", label: "Drive motors", requiredForLive: false, state: testState("motors"), detail: t.motors.detail },
    { id: "lights", label: "Lighting", requiredForLive: false, state: testState("lights"), detail: t.lights.detail },
    {
      id: "vr", label: "VR headset", requiredForLive: false,
      state: caps?.immersiveVr ? "pass" : "info",
      detail: caps === null ? "Detecting…" : caps.immersiveVr ? "Immersive VR available" : `Desktop mode (mouse 360°). ${vrUnavailableReason(caps)}`,
    },
  ];
}

export function liveReady(checks: Check[]): { ready: boolean; blocking: Check[] } {
  const blocking = checks.filter((c) => c.requiredForLive && c.state !== "pass");
  return { ready: blocking.length === 0, blocking };
}

export function progress(checks: Check[]): number {
  const req = checks.filter((c) => c.requiredForLive);
  return req.filter((c) => c.state === "pass").length / req.length;
}
