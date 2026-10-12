/**
 * App-wide connection objects. Created once; screens borrow them.
 * The robot link starts at boot so the landing page can show real availability.
 * Video is started on demand (Command Center / Lobby) because it costs bandwidth.
 */
import { store } from "./store";
import { resolveEndpoints } from "../services/config";
import { RobotLink } from "../services/transport";
import { VideoStream } from "../services/video";
import { CommandLoop } from "../services/commandLoop";
import { HardwareTests } from "../services/hardwareTests";

export const endpoints = resolveEndpoints();
export const link = new RobotLink(store, endpoints.wsUrl);
export const video = new VideoStream(store, endpoints.whepUrl);
export const commands = new CommandLoop(store, link);
export const tests = new HardwareTests(store, link);

let started = false;
export function startSession(): void {
  if (started) return;
  started = true;
  link.start();
  commands.start();

  // Mirror link/video state into the corresponding diagnostic tests.
  store.subscribe((s, prev) => {
    if (s.link.state !== prev.link.state) {
      store.setTest("link", s.link.state === "connected"
        ? { status: "passed", detail: "WebSocket open" }
        : { status: s.link.state === "error" ? "failed" : "idle", detail: s.link.error ?? s.link.state });
      if (s.link.state !== "connected") commands.disarm();
    }
  });

  // Safety: stop driving when the tab is hidden or closed.
  document.addEventListener("visibilitychange", () => { if (document.hidden) commands.disarm(); });
  window.addEventListener("pagehide", () => commands.stop());
}

export function ensureVideo(): void {
  const st = store.state.video.state;
  if (st === "idle" || st === "error") void video.start();
}
