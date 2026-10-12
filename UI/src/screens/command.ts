/** 02 — Command Center. System overview around the robot (or its live camera). */
import { h, pill, setText, frameThrottle, fmtAge, type Tone } from "../ui/dom";
import { store, type AppState } from "../app/store";
import { linkStatus, videoStatus, telemetryStatus, testStatus } from "../app/status";
import { navigate, ROUTES, type Screen } from "../app/router";
import { link, video, ensureVideo, endpoints } from "../app/session";
import { capabilities, vrUnavailableReason, type Capabilities } from "../services/capabilities";
import { buildChecklist, progress } from "../services/readiness";
import { RobotStage } from "../three/robotStage";
import { topbar } from "./shared";

export function commandScreen(): Screen {
  let stage: RobotStage | null = null;
  let unsub = () => {};
  let tick = 0;

  return {
    mount(root) {
      let caps: Capabilities | null = null;
      root.classList.add("cc");

      const stageHost = h("div", { class: "stage" });
      const stageWrap = h("div", { class: "cc__stage" }, stageHost);
      const caption = h("p", { class: "label" });
      const viewToggle = h("button", { class: "btn btn--sm btn--quiet", hidden: true }, "Show model");
      let showVideo = true; // prefer the real camera when it is live

      // --- Systems ---
      type Row = { p: ReturnType<typeof pill>; d: HTMLElement };
      const rows: Record<string, Row> = {};
      const systems = h("ul", { class: "systems" });
      for (const [id, name] of [
        ["core", "Robot Core"], ["camera", "Camera"], ["pantilt", "Pan / Tilt"], ["motors", "Drive motors"],
        ["sensors", "Sensors"], ["video", "Video stream"], ["vr", "VR"],
      ]) {
        const p = pill("—", "idle");
        const d = h("span", { class: "sys-detail" });
        rows[id] = { p, d };
        systems.append(h("li", {}, h("span", { class: "sys-name" }, name), p.el, d));
      }

      // --- Telemetry ---
      const tv: Record<string, HTMLElement> = {};
      const kv = h("dl", { class: "kv" });
      for (const [id, label] of [
        ["source", "Source"], ["battery", "Battery"], ["age", "Last status"], ["sent", "Commands sent"], ["ack", "Robot ack"], ["lag", "Ack lag"],
      ]) {
        tv[id] = h("dd", {}, "—");
        kv.append(h("dt", {}, label), tv[id]);
      }
      const meterFill = h("i", { style: "width:0%" });
      const readyText = h("span", { class: "small" });
      const endpoint = h("p", { class: "small muted mono", style: "word-break:break-all;margin:var(--s3) 0" }, endpoints.wsUrl);
      const retry = h("button", { class: "btn btn--sm", onclick: () => link.retry() }, "Reconnect");
      const retryVideo = h("button", { class: "btn btn--sm", onclick: () => { video.stop(); void video.start(); } }, "Retry video");

      root.append(
        topbar("02 · Command Center"),
        stageWrap,
        h("div", { class: "cc__caption" }, caption, viewToggle),
        h("aside", { class: "cc__left" },
          h("section", { class: "panel", "aria-labelledby": "sys-h" },
            h("h1", { class: "label", id: "sys-h", style: "margin:0 0 var(--s3)" }, "Systems"), systems)),
        h("aside", { class: "cc__right" },
          h("section", { class: "panel", "aria-label": "Telemetry" }, h("span", { class: "label" }, "Telemetry"), kv),
          h("section", { class: "panel", "aria-label": "Readiness" },
            h("span", { class: "label" }, "Session readiness"),
            readyText, h("div", { class: "meter", role: "presentation" }, meterFill),
            endpoint, h("div", { style: "display:flex;gap:8px;flex-wrap:wrap" }, retry, retryVideo)),
        ),
        h("div", { class: "cc__bottom" },
          h("button", { class: "btn btn--primary btn--lg", onclick: () => navigate(ROUTES.lobby) }, "OPEN SETUP LOBBY"),
          h("button", { class: "btn btn--lg", onclick: () => navigate(`${ROUTES.immersive}?mode=preview`) }, "360° Preview"),
        ),
      );

      stage = new RobotStage(stageHost, { interactive: false, autoRotate: !matchMedia("(prefers-reduced-motion: reduce)").matches });

      const setStageMode = (s: AppState) => {
        const live = s.video.state === "live";
        viewToggle.hidden = !live;
        const wantVideo = live && showVideo;
        if (wantVideo && !stageWrap.contains(video.element)) {
          video.element.setAttribute("aria-label", "Live robot camera");
          stageWrap.append(video.element);
          stageHost.hidden = true;
        } else if (!wantVideo && stageWrap.contains(video.element)) {
          video.element.remove();
          stageHost.hidden = false;
        }
        setText(caption, wantVideo ? "Live camera · WebRTC" : "Schematic model · not a camera view");
        setText(viewToggle, showVideo ? "Show model" : "Show live camera");
      };
      viewToggle.addEventListener("click", () => { showVideo = !showVideo; setStageMode(store.state); });

      const set = (id: string, t: { text: string; tone: Tone }, detail: string) => {
        rows[id].p.set(t.text, t.tone);
        setText(rows[id].d, detail);
      };

      const render = frameThrottle(() => {
        const s = store.state;
        const now = Date.now();
        const ls = linkStatus(s);
        set("core", ls, s.link.state === "connected"
          ? `Raspberry Pi${s.link.serverVersion ? ` · ${s.link.serverVersion}` : ""}`
          : s.link.error ?? (s.link.state === "connecting" ? "Opening WebSocket" : "Not connected"));
        set("camera", s.video.state === "live" ? { text: "Streaming", tone: "ok" } : { text: "Unknown", tone: "idle" },
          s.video.state === "live" ? "Detected through the video stream" : "Only detectable once a stream arrives");
        set("pantilt", testStatus(s.tests.pantilt), s.tests.pantilt.detail);
        set("motors", testStatus(s.tests.motors), s.tests.motors.detail);
        const ts = telemetryStatus(s);
        set("sensors", ts, s.telemetry.batteryV !== null && ts.tone !== "idle"
          ? `Battery ${s.telemetry.batteryV.toFixed(2)} V · other sensors not in protocol v1`
          : "Battery voltage via STATUS · other sensors not in protocol v1");
        const vs = videoStatus(s);
        const res = video.element.videoWidth ? ` · ${video.element.videoWidth}×${video.element.videoHeight}` : "";
        set("video", vs, s.video.state === "live" ? `WebRTC / WHEP${res}` : s.video.error ?? "Not started");
        if (caps) {
          set("vr", caps.immersiveVr ? { text: "Ready", tone: "ok" } : { text: "Desktop", tone: "idle" },
            vrUnavailableReason(caps) ?? (caps.likelyPico ? "PICO browser · WebXR immersive-vr" : "WebXR immersive-vr"));
        }

        setText(tv.source, s.link.state !== "connected" ? "—" : s.link.source === "mock" ? "SIMULATED" : s.link.source === "hardware" ? "Hardware" : "Unverified");
        setText(tv.battery, s.telemetry.batteryV !== null && s.telemetry.lastStatusAt ? `${s.telemetry.batteryV.toFixed(2)} V` : "—");
        setText(tv.age, s.telemetry.lastStatusAt ? fmtAge(now - s.telemetry.lastStatusAt) : "—");
        setText(tv.sent, s.telemetry.sentSeq ? String(s.telemetry.sentSeq) : "—");
        setText(tv.ack, s.telemetry.ackSeq !== null ? String(s.telemetry.ackSeq) : "—");
        setText(tv.lag, s.telemetry.ackSeq !== null && s.telemetry.sentSeq ? `${Math.max(0, s.telemetry.sentSeq - s.telemetry.ackSeq)} cmds` : "—");

        const checks = buildChecklist(s, caps, now);
        const pct = Math.round(progress(checks) * 100);
        meterFill.style.width = `${pct}%`;
        setText(readyText, `${pct}% of live-session checks passed`);
        retry.disabled = s.link.state === "connecting" && s.link.attempt <= 1;
        retryVideo.disabled = s.video.state === "connecting";
        setStageMode(s);
      });

      void capabilities().then((c) => { caps = c; render(); });
      ensureVideo();
      render();
      unsub = store.subscribe(render);
      tick = window.setInterval(render, 500); // ages tick even without new messages
    },
    unmount() {
      unsub();
      clearInterval(tick);
      video.element.remove();
      stage?.dispose();
      stage = null;
    },
  };
}
