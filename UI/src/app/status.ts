/** Maps raw state to operator-facing labels and tones. Shared by every screen. */
import type { AppState } from "./store";
import type { Tone } from "../ui/dom";
import { telemetryFresh } from "../services/readiness";

export function linkStatus(s: AppState): { text: string; tone: Tone } {
  switch (s.link.state) {
    case "connected":
      return s.link.source === "mock"
        ? { text: "Simulated robot", tone: "sim" }
        : { text: s.link.source === "hardware" ? "Robot online" : "Connected · unverified", tone: "ok" };
    case "connecting": return { text: s.link.attempt > 1 ? `Reconnecting · ${s.link.attempt}` : "Connecting", tone: "warn" };
    case "error": return { text: "Robot offline", tone: "err" };
    default: return { text: "Disconnected", tone: "idle" };
  }
}

export function videoStatus(s: AppState): { text: string; tone: Tone } {
  switch (s.video.state) {
    case "live": return { text: "Live", tone: "ok" };
    case "connecting": return { text: "Negotiating", tone: "warn" };
    case "unavailable": return { text: "Unavailable", tone: "err" };
    case "error": return { text: "No stream", tone: "err" };
    default: return { text: "Idle", tone: "idle" };
  }
}

export function telemetryStatus(s: AppState): { text: string; tone: Tone } {
  if (telemetryFresh(s)) return s.link.source === "mock" ? { text: "Simulated", tone: "sim" } : { text: "Receiving", tone: "ok" };
  return s.link.state === "connected" ? { text: "Waiting", tone: "warn" } : { text: "No data", tone: "idle" };
}

export function testStatus(st: AppState["tests"][keyof AppState["tests"]]): { text: string; tone: Tone } {
  switch (st.status) {
    case "passed": return { text: "Verified", tone: "ok" };
    case "acknowledged": return { text: "Awaiting confirmation", tone: "warn" };
    case "running": return { text: "Running", tone: "warn" };
    case "failed": return { text: "Failed", tone: "err" };
    case "unavailable": return { text: "Unavailable", tone: "err" };
    default: return { text: "Untested", tone: "idle" };
  }
}
