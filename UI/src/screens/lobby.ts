/** 03 — 3D Setup Lobby. Inspect the robot, run diagnostics, and gate entry to the live session. */
import { h, pill, setText, frameThrottle, fmtAge } from "../ui/dom";
import { store, type AppState, type TestId } from "../app/store";
import { testStatus, videoStatus, linkStatus } from "../app/status";
import { navigate, ROUTES, type Screen } from "../app/router";
import { link, video, tests, ensureVideo, endpoints } from "../app/session";
import { capabilities, type Capabilities } from "../services/capabilities";
import { buildChecklist, liveReady, progress, telemetryFresh } from "../services/readiness";
import { LIMITS } from "../services/protocol";
import { RobotStage } from "../three/robotStage";
import { PARTS, partById, type PartId } from "../three/parts";
import { topbar } from "./shared";

interface Inspector { el: HTMLElement; update(s: AppState): void }

export function lobbyScreen(): Screen {
  let stage: RobotStage | null = null;
  const cleanup: Array<() => void> = [];

  return {
    mount(root) {
      root.classList.add("lobby");
      let caps: Capabilities | null = null;
      let selected: PartId | null = null;
      let inspector: Inspector | null = null;

      const stageHost = h("div", { class: "stage", role: "img", "aria-label": "3D model of the CN360 robot. Drag to orbit, scroll to zoom." });
      const hotspotLayer = h("div", { class: "hotspots hideable" });
      const hotspots = new Map<PartId, HTMLButtonElement>();
      for (const p of PARTS) {
        const b = h("button", { class: "hotspot", "aria-pressed": "false", onclick: () => select(selected === p.id ? null : p.id) }, p.name);
        hotspots.set(p.id, b);
        hotspotLayer.append(b);
      }

      // --- Readiness ---
      const checklist = h("ul", { class: "checklist" });
      const meterFill = h("i", { style: "width:0%" });
      const progressText = h("span", { class: "small" });
      const readiness = h("section", { class: "panel hideable", "aria-labelledby": "rd-h" },
        h("h1", { class: "label", id: "rd-h", style: "margin:0 0 var(--s2)" }, "System readiness"),
        progressText, h("div", { class: "meter", style: "margin-bottom:var(--s3)" }, meterFill),
        checklist);

      const inspectorPanel = h("section", { class: "panel inspector hideable", "aria-live": "polite", "aria-label": "Component inspector" });

      const enterLive = h("button", { class: "btn btn--primary btn--lg", onclick: () => navigate(`${ROUTES.immersive}?mode=live`) }, "ENTER LIVE VR");
      const blocking = h("p", { class: "lobby__blocking small muted hideable", role: "status" });

      const panelsBtn = h("button", { class: "btn btn--sm", "aria-pressed": "false", title: "Hide panels (H)" }, "Hide panels");
      const togglePanels = () => {
        const hidden = root.classList.toggle("panels-hidden");
        panelsBtn.setAttribute("aria-pressed", String(hidden));
        setText(panelsBtn, hidden ? "Show panels" : "Hide panels");
      };
      panelsBtn.addEventListener("click", togglePanels);
      const resetBtn = h("button", { class: "btn btn--sm btn--quiet", onclick: () => { select(null); stage?.resetView(); } }, "Reset view");

      root.append(
        topbar("03 · Setup Lobby", resetBtn, panelsBtn),
        stageHost,
        hotspotLayer,
        h("div", { class: "lobby__left" }, readiness),
        h("aside", { class: "lobby__right" }, inspectorPanel),
        blocking,
        h("nav", { class: "lobby__bottom", "aria-label": "Session" },
          h("button", { class: "btn btn--lg", onclick: () => navigate(ROUTES.command) }, "← Command Center"),
          h("button", { class: "btn btn--lg", onclick: () => navigate(`${ROUTES.immersive}?mode=preview`) }, "360° Preview"),
          enterLive),
      );

      stage = new RobotStage(stageHost, {
        interactive: true,
        autoRotate: !matchMedia("(prefers-reduced-motion: reduce)").matches,
        onSelect: (id) => select(id),
        onAnchors: (pos) => {
          // Place labels at their anchors, then nudge apart any that collide.
          const items = [...hotspots].map(([id, b]) => ({ id, b, x: pos[id].x, y: pos[id].y, w: b.offsetWidth || 110, behind: pos[id].behind }));
          items.sort((a, b) => Number(a.behind) - Number(b.behind) || a.y - b.y);
          const placed: typeof items = [];
          for (const it of items) {
            for (let guard = 0; guard < 8; guard++) {
              const hit = placed.find((o) => Math.abs(o.y - it.y) < 28 && it.x < o.x + o.w + 6 && o.x < it.x + it.w + 6);
              if (!hit) break;
              it.y = hit.y + (it.y >= hit.y ? 30 : -30);
            }
            placed.push(it);
            it.b.style.transform = `translate(${Math.round(it.x)}px, ${Math.round(it.y)}px) translate(-6px, -50%)`;
            it.b.classList.toggle("is-behind", it.behind && selected !== it.id);
          }
        },
      });

      function select(id: PartId | null) {
        selected = id;
        stage?.robot.setHighlight(id);
        stage?.focus(id);
        for (const [pid, b] of hotspots) b.setAttribute("aria-pressed", String(pid === id));
        inspector = id ? buildInspector(id) : overview(select);
        inspectorPanel.replaceChildren(inspector.el);
        inspector.update(store.state);
      }
      select(null);

      let lastKey = "";
      const render = frameThrottle(() => {
        const s = store.state;
        const checks = buildChecklist(s, caps);
        const key = checks.map((c) => c.state + c.detail).join("|");
        if (key !== lastKey) checklist.replaceChildren(...checks.map((c) =>
          h("li", { class: `ck-${c.state}` },
            h("span", { class: "ck-icon", "aria-hidden": "true" }),
            h("span", {}, c.label, c.requiredForLive ? h("span", { class: "ck-req" }, "REQUIRED") : null,
              h("span", { class: "sr-only" }, ` — ${c.state}`)),
            h("span", { class: "ck-detail" }, c.detail))));
        lastKey = key;
        const pct = Math.round(progress(checks) * 100);
        meterFill.style.width = `${pct}%`;
        setText(progressText, `${pct}% · required checks for a live session`);
        const { ready, blocking: b } = liveReady(checks);
        enterLive.disabled = !ready;
        setText(blocking, ready
          ? (caps?.immersiveVr ? "All required checks passed." : "All required checks passed · no headset detected, live view opens in desktop mode.")
          : `Live session needs: ${b.map((c) => c.label).join(", ")}`);
        inspector?.update(s);
        stage?.robot.setLight(s.control.brightness / 100);
      });

      void capabilities().then((c) => { caps = c; render(); });
      ensureVideo();
      render();
      cleanup.push(store.subscribe(render));
      const tick = window.setInterval(render, 1000);
      cleanup.push(() => clearInterval(tick));

      const onKey = (e: KeyboardEvent) => {
        if (e.target instanceof HTMLInputElement) return;
        if (e.key === "h" || e.key === "H") togglePanels();
        else if (e.key === "Escape") select(null);
      };
      window.addEventListener("keydown", onKey);
      cleanup.push(() => window.removeEventListener("keydown", onKey));
    },
    unmount() {
      cleanup.forEach((f) => f());
      cleanup.length = 0;
      stage?.dispose();
      stage = null;
    },
  };
}

// ---------------------------------------------------------------------------
// Inspectors

function overview(select: (id: PartId) => void): Inspector {
  const el = h("div", {},
    h("span", { class: "label" }, "Inspector"),
    h("h2", { class: "title" }, "Select a component"),
    h("p", {}, "Click the model or a label to inspect a component and run its checks. Drag to orbit, scroll to zoom, H hides panels."),
    h("div", { class: "parts" }, ...PARTS.map((p) => h("button", { class: "btn btn--sm", onclick: () => select(p.id) }, p.name))),
  );
  return { el, update() {} };
}

/** Pass/fail confirmation for actuator tests (the robot cannot report physical movement in protocol v1). */
function testBlock(id: TestId, run: () => Promise<void>, label: string, guard?: () => string | null) {
  const status = pill("", "idle");
  const detail = h("p", { class: "note" });
  const runBtn = h("button", { class: "btn btn--sm", onclick: () => { void run(); } }, label);
  const yes = h("button", { class: "btn btn--sm", onclick: () => tests.confirm(id, true) }, "Yes, it moved");
  const no = h("button", { class: "btn btn--sm btn--quiet", onclick: () => tests.confirm(id, false) }, "No");
  const confirm = h("div", { class: "actions", hidden: true }, yes, no);
  const el = h("div", {}, h("div", { class: "actions" }, runBtn, status.el), detail, confirm);
  return {
    el,
    update(s: AppState) {
      const t = s.tests[id];
      const st = testStatus(t);
      status.set(st.text, st.tone);
      setText(detail, t.detail);
      confirm.hidden = t.status !== "acknowledged";
      const blockReason = s.link.state !== "connected" ? "Connect to the robot first" : guard?.() ?? null;
      runBtn.disabled = t.status === "running" || !!blockReason;
      runBtn.title = blockReason ?? "";
      if (blockReason && t.status === "idle") setText(detail, blockReason);
    },
  };
}

function header(id: PartId): HTMLElement[] {
  const p = partById(id);
  return [
    h("span", { class: "label" }, "Component"),
    h("h2", { class: "title" }, p.name),
    h("p", { class: "mono small muted", style: "margin:0 0 var(--s3)" }, p.hardware),
    h("p", {}, p.summary),
  ];
}

function buildInspector(id: PartId): Inspector {
  switch (id) {
    case "camera": {
      const st = pill("", "idle");
      const kv = h("dl", { class: "kv" });
      const res = h("dd", {}, "—"), url = h("dd", { style: "word-break:break-all" }, endpoints.whepUrl);
      kv.append(h("dt", {}, "Resolution"), res, h("dt", {}, "Endpoint"), url);
      const start = h("button", { class: "btn btn--sm", onclick: () => { video.stop(); void video.start(); } }, "Connect stream");
      const stop = h("button", { class: "btn btn--sm btn--quiet", onclick: () => video.stop() }, "Stop");
      const el = h("div", {}, ...header(id), st.el, h("hr"), kv,
        h("div", { class: "actions" }, start, stop),
        h("p", { class: "note" }, "Resolution and bitrate are configured in MediaMTX on the Pi. Protocol v1 has no camera settings, so they are not adjustable here."));
      return {
        el, update(s) {
          const v = videoStatus(s);
          st.set(s.video.error && s.video.state !== "live" ? `${v.text} · ${s.video.error}` : v.text, v.tone);
          setText(res, video.element.videoWidth ? `${video.element.videoWidth} × ${video.element.videoHeight}` : "—");
          start.disabled = s.video.state === "connecting";
          stop.disabled = s.video.state === "idle";
        },
      };
    }
    case "pantilt": {
      const t = testBlock("pantilt", () => tests.panTilt(), "Run sweep test");
      const el = h("div", {}, ...header(id),
        h("dl", { class: "kv" },
          h("dt", {}, "Yaw range"), h("dd", {}, `${LIMITS.yaw.min}° … +${LIMITS.yaw.max}°`),
          h("dt", {}, "Pitch range"), h("dd", {}, `${LIMITS.pitch.min}° … +${LIMITS.pitch.max}°`),
          h("dt", {}, "Rate"), h("dd", {}, "20 Hz")),
        h("hr"), t.el,
        h("p", { class: "note" }, "Sweeps left, right, up, down and back to centre. The robot can only confirm it received the commands — please confirm you saw the camera move."));
      return { el, update: t.update };
    }
    case "drive": {
      const clear = h("input", { type: "checkbox", id: "drive-clear" }) as HTMLInputElement;
      const t = testBlock("motors", () => tests.motors(), "Run motor pulse", () => clear.checked ? null : "Confirm the robot is lifted or the area is clear");
      clear.addEventListener("change", () => t.update(store.state));
      const el = h("div", {}, ...header(id),
        h("label", { class: "field", for: "drive-clear", style: "grid-template-columns:auto 1fr;align-items:center" },
          clear, h("span", {}, "The robot is lifted or its path is clear")),
        h("hr"), t.el,
        h("p", { class: "note" }, "Sends forward 0.25 for 0.4 s, then stop. The robot also stops on its own if commands pause for 300 ms."));
      return { el, update: t.update };
    }
    case "lights": {
      const t = testBlock("lights", () => tests.lights(), "Run light test");
      const range = h("input", { type: "range", min: 0, max: 100, step: 5, "aria-label": "LED brightness" }) as HTMLInputElement;
      const val = h("span", { class: "mono" });
      range.addEventListener("input", () => store.patch("control", { brightness: Number(range.value) }));
      const night = h("button", { class: "btn btn--sm", "aria-pressed": "false", onclick: () => store.patch("control", { visionMode: store.state.control.visionMode ? 0 : 1 }) }, "Night (IR) mode");
      const el = h("div", {}, ...header(id),
        h("label", { class: "field" }, h("span", { style: "display:flex;justify-content:space-between" }, "Brightness", val), range),
        h("div", { class: "actions" }, night),
        h("p", { class: "note" }, "Changes are sent as LIGHT commands while the robot is connected. Keys: L on/off · [ ] dim · N night."),
        h("hr"), t.el);
      return {
        el, update(s) {
          t.update(s);
          if (document.activeElement !== range) range.value = String(s.control.brightness);
          setText(val, `${s.control.brightness}%`);
          night.setAttribute("aria-pressed", String(s.control.visionMode === 1));
        },
      };
    }
    case "compute": {
      const st = pill("", "idle");
      const rows: Record<string, HTMLElement> = {};
      const kv = h("dl", { class: "kv" });
      for (const [k, l] of [["url", "Endpoint"], ["state", "State"], ["attempt", "Attempt"], ["source", "Robot source"], ["ver", "Server"], ["error", "Last error"]]) {
        rows[k] = h("dd", { style: "word-break:break-all" }, "—");
        kv.append(h("dt", {}, l), rows[k]);
      }
      const el = h("div", {}, ...header(id), st.el, h("hr"), kv,
        h("div", { class: "actions" }, h("button", { class: "btn btn--sm", onclick: () => link.retry() }, "Reconnect")),
        h("p", { class: "note" }, "Point VEIL at another robot with ?robot=<host:port>. A robot that does not send HELLO is shown as unverified rather than assumed to be hardware."));
      return {
        el, update(s) {
          const l = linkStatus(s);
          st.set(l.text, l.tone);
          setText(rows.url, s.link.url || endpoints.wsUrl);
          setText(rows.state, s.link.state);
          setText(rows.attempt, String(s.link.attempt || "—"));
          setText(rows.source, s.link.state === "connected" ? s.link.source : "—");
          setText(rows.ver, s.link.serverVersion || "—");
          setText(rows.error, s.link.error ?? "—");
        },
      };
    }
    case "mcu":
      return {
        el: h("div", {}, ...header(id), h("hr"),
          h("p", { class: "note" }, "No direct test: the browser never talks to the ESP32. It is verified indirectly when the pan/tilt, motor and light tests are acknowledged and confirmed.")),
        update() {},
      };
    case "power": {
      const st = pill("", "idle");
      const v = h("dd", {}, "—"), age = h("dd", {}, "—");
      const el = h("div", {}, ...header(id), st.el, h("hr"),
        h("dl", { class: "kv" }, h("dt", {}, "Battery"), v, h("dt", {}, "Last STATUS"), age),
        h("p", { class: "note" }, "Shown as raw voltage. Charge-level thresholds for the 2S pack are not defined yet, so no percentage is estimated."));
      return {
        el, update(s) {
          const fresh = telemetryFresh(s);
          st.set(fresh ? (s.link.source === "mock" ? "Simulated value" : "Reporting") : "No data", fresh ? (s.link.source === "mock" ? "sim" : "ok") : "idle");
          setText(v, s.telemetry.batteryV !== null && fresh ? `${s.telemetry.batteryV.toFixed(2)} V` : "—");
          setText(age, s.telemetry.lastStatusAt ? fmtAge(Date.now() - s.telemetry.lastStatusAt) : "—");
        },
      };
    }
  }
}
