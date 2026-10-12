/**
 * 04 — 360° Preview & Live VR.
 *   ?mode=preview  simulated crawlspace (or a local 360° image). Never sends commands.
 *   ?mode=live     robot camera via WebRTC; view direction drives pan/tilt (HEAD),
 *                  WASD / left thumbstick drives only while armed / grip held.
 * Desktop works without a headset; "Enter VR" appears only when WebXR immersive-vr is supported.
 */
import { h, setText, frameThrottle, fmtAge } from "../ui/dom";
import { store } from "../app/store";
import { linkStatus, videoStatus } from "../app/status";
import { navigate, ROUTES, type Screen } from "../app/router";
import { video, commands, ensureVideo } from "../app/session";
import { capabilities, vrUnavailableReason } from "../services/capabilities";
import { bindKeyboard } from "../services/keyboard";
import { LIMITS, clamp } from "../services/protocol";
import { ImmersiveView } from "../three/immersiveView";
import { topbar } from "./shared";

export function immersiveScreen(): Screen {
  let view: ImmersiveView | null = null;
  const cleanup: Array<() => void> = [];

  return {
    async mount(root, params) {
      const live = params.get("mode") === "live";
      root.classList.add("imm");
      store.patch("control", { headLink: false });
      let recordedName = "";
      let xrArmed = false;

      const stageHost = h("div", { class: "stage", role: "img", "aria-label": live ? "Robot camera view" : "Simulated 360° environment. Drag or use arrow keys to look around." });
      const badge = h("span", { class: "source-badge" });
      const notice = h("p", { class: "notice" });
      const hint = h("div", { class: "imm__hint" }, "Drag to look · Scroll to zoom");
      const xrBtn = h("button", { class: "btn btn--primary btn--lg", disabled: true }, "ENTER VR");
      const fsBtn = h("button", { class: "btn btn--lg", onclick: () => toggleFullscreen(root) }, "Fullscreen");
      const recenterBtn = h("button", { class: "btn btn--lg", onclick: () => view?.recenter(), title: "Recenter (R)" }, "Recenter");

      root.append(
        topbar(live ? "04 · Live" : "04 · 360° Preview"),
        stageHost,
        h("div", { class: "imm__reticle", "aria-hidden": "true" }),
        hint,
        h("div", { class: "imm__hud imm__top" }, h("h1", { class: "sr-only" }, live ? "Live robot view" : "360° preview"), badge, notice),
        h("nav", { class: "imm__hud imm__bottom", "aria-label": "View" },
          h("button", { class: "btn btn--lg", onclick: () => navigate(ROUTES.lobby) }, "← Setup Lobby"),
          recenterBtn, fsBtn, xrBtn),
      );

      const v = new ImmersiveView(stageHost, {
        onHead(head) {
          if (!live) return;
          const c = store.state.control;
          const yaw = clamp(head.yaw, LIMITS.yaw.min, LIMITS.yaw.max);
          const pitch = clamp(head.pitch, LIMITS.pitch.min, LIMITS.pitch.max);
          const roll = clamp(head.roll, LIMITS.roll.min, LIMITS.roll.max);
          if (c.headLink) {
            v.setCommandedHead(yaw, pitch);
            if (Math.abs(c.head.yaw - yaw) > 0.1 || Math.abs(c.head.pitch - pitch) > 0.1 || Math.abs(c.head.roll - roll) > 0.5) {
              store.patch("control", { head: { yaw, pitch, roll } });
            }
          }
        },
        onXRChange(presenting) {
          setText(xrBtn, presenting ? "EXIT VR" : "ENTER VR");
          if (!presenting && xrArmed) { xrArmed = false; commands.disarm(); }
        },
        onXRInput({ drive, toggleLight }) {
          if (!live) return;
          if (toggleLight) store.patch("control", { brightness: store.state.control.brightness > 0 ? 0 : 60 });
          if (drive) {
            xrArmed = true;
            store.patch("control", { driveArmed: true, drive });
          } else if (xrArmed) {
            xrArmed = false;
            commands.disarm();
          }
        },
        hudLines() {
          const s = store.state;
          const fresh = s.telemetry.lastStatusAt ? Date.now() - s.telemetry.lastStatusAt : null;
          return [
            badge.textContent ?? "",
            `Link ${linkStatus(s).text} · Battery ${s.telemetry.batteryV?.toFixed(2) ?? "—"} V · ${fmtAge(fresh)}`,
            live ? `Head ${s.control.head.yaw.toFixed(0)}° / ${s.control.head.pitch.toFixed(0)}° · ${s.control.driveArmed ? "DRIVING" : "Hold left grip to drive"}` : "Preview — your view does not move the robot",
            "Y exit · B recenter · A light",
          ];
        },
      });
      view = v;
      cleanup.push(() => v.dispose());

      // First interaction hides the hint.
      const hideHint = () => hint.classList.add("is-gone");
      v.canvas.addEventListener("pointerdown", hideHint, { once: true });
      cleanup.push(() => v.canvas.removeEventListener("pointerdown", hideHint));

      // --- Side panel ---
      const side = h("aside", { class: "imm__hud imm__side panel" });
      root.append(side);

      const brightness = h("input", { type: "range", min: 0, max: 100, step: 5, "aria-label": "Light brightness" }) as HTMLInputElement;
      // Preview keeps its own headlight value so nothing reaches the robot.
      let simLight = 40;
      brightness.addEventListener("input", () => {
        if (live) store.patch("control", { brightness: Number(brightness.value) });
        else { simLight = Number(brightness.value); render(); }
      });
      const brightVal = h("span", { class: "mono" });

      let headBtn: HTMLButtonElement | null = null;
      let driveBtn: HTMLButtonElement | null = null;
      const strip: Record<string, HTMLElement> = {};

      if (live) {
        headBtn = h("button", { class: "btn btn--sm", "aria-pressed": "false", onclick: () => store.patch("control", { headLink: !store.state.control.headLink }) }, "Camera follows view");
        driveBtn = h("button", { class: "btn btn--sm", "aria-pressed": "false", onclick: () => {
          if (store.state.control.driveArmed) commands.disarm();
          else store.patch("control", { driveArmed: true });
        } }, "Arm driving");
        const tel = h("dl", { class: "kv", style: "margin-top:var(--s4)" });
        for (const [k, l] of [["link", "Link"], ["video", "Video"], ["bat", "Battery"], ["age", "Last status"]]) {
          strip[k] = h("dd", {}, "—");
          tel.append(h("dt", {}, l), strip[k]);
        }
        side.append(
          h("span", { class: "label" }, "Control"),
          h("div", { class: "actions", style: "display:flex;gap:8px;flex-wrap:wrap" }, headBtn, driveBtn),
          h("p", { class: "note small muted" }, "Desktop: ", h("kbd", {}, "W A S D"), " drive while armed, ", h("kbd", {}, "Shift"), " high torque, ", h("kbd", {}, "R"), " recenter. Headset: hold left grip and use the thumbstick."),
          h("label", { class: "field" }, h("span", { style: "display:flex;justify-content:space-between" }, "Lights", brightVal), brightness),
          tel,
        );
        cleanup.push(bindKeyboard(store, { r: () => v.recenter() }));
        ensureVideo();
      } else {
        const file = h("input", { type: "file", accept: "image/*", class: "sr-only", id: "pano-file" }) as HTMLInputElement;
        const backToSim = h("button", { class: "btn btn--sm btn--quiet", hidden: true, onclick: () => { recordedName = ""; v.setSource("simulated"); backToSim.hidden = true; render(); } }, "Back to simulated");
        file.addEventListener("change", async () => {
          const f = file.files?.[0];
          if (!f) return;
          try {
            await v.loadEquirect(f);
            recordedName = f.name;
            backToSim.hidden = false;
          } catch {
            setText(notice, "That image could not be loaded. Use an equirectangular (2:1) JPEG or PNG.");
            notice.classList.add("err");
          }
          file.value = "";
          render();
        });
        side.append(
          h("span", { class: "label" }, "Preview"),
          h("p", { class: "small muted", style: "margin-top:0" }, "A generated crawlspace at robot-camera height. Nothing here comes from the robot, and looking around does not move it."),
          h("label", { class: "field" }, h("span", { style: "display:flex;justify-content:space-between" }, "Simulated headlight", brightVal), brightness),
          h("hr", { style: "border:0;border-top:1px solid var(--veil-line);margin:var(--s4) 0" }),
          h("label", { class: "btn btn--sm", for: "pano-file", style: "cursor:pointer" }, "Load 360° image…"), file, backToSim,
          h("p", { class: "note small muted" }, "Equirectangular 2:1 image from a 360° camera. It stays on this device."),
        );
        const onKey = (e: KeyboardEvent) => { if (e.key === "r" || e.key === "R") v.recenter(); };
        window.addEventListener("keydown", onKey);
        cleanup.push(() => window.removeEventListener("keydown", onKey));
      }

      // --- XR availability ---
      const caps = await capabilities();
      const vrReason = vrUnavailableReason(caps);
      xrBtn.disabled = !!vrReason;
      xrBtn.title = vrReason ?? "Enter immersive VR";
      xrBtn.addEventListener("click", async () => {
        if (v.presenting) { v.exitXR(); return; }
        try {
          await v.enterXR();
        } catch (e) {
          setText(notice, `Could not start VR: ${e instanceof Error ? e.message : String(e)}`);
          notice.classList.add("err");
        }
      });
      if (!caps.fullscreen) fsBtn.hidden = true;

      // --- Render loop for HTML HUD ---
      let lastVideo = "";
      const render = frameThrottle(() => {
        const s = store.state;
        // Source badge — the single most important honesty signal on this screen.
        if (live) {
          const vs = s.video.state;
          badge.className = `source-badge ${vs === "live" ? "is-live" : ""}`;
          setText(badge, vs === "live" ? "LIVE · Robot camera" : vs === "connecting" ? "CONNECTING · Robot camera" : "NO SIGNAL · Robot camera");
          if (!notice.classList.contains("err")) {
            setText(notice, vs === "live"
              ? (vrReason ? `Desktop live view. ${vrReason}` : "Head tracking steers the camera once “Camera follows view” is on.")
              : `${(s.video.error ?? "Waiting for the camera stream").replace(/\.?$/, ".")} Return to the Setup Lobby to diagnose.`);
          }
          if (vs !== lastVideo) {
            lastVideo = vs;
            v.setSource("live", vs === "live" ? video.element : undefined);
          }
          headBtn!.setAttribute("aria-pressed", String(s.control.headLink));
          headBtn!.disabled = s.link.state !== "connected";
          driveBtn!.setAttribute("aria-pressed", String(s.control.driveArmed));
          setText(driveBtn!, s.control.driveArmed ? "Driving armed — click to stop" : "Arm driving");
          driveBtn!.disabled = s.link.state !== "connected";
          setText(strip.link, linkStatus(s).text);
          setText(strip.video, videoStatus(s).text);
          setText(strip.bat, s.telemetry.batteryV !== null && s.telemetry.lastStatusAt ? `${s.telemetry.batteryV.toFixed(2)} V` : "—");
          setText(strip.age, s.telemetry.lastStatusAt ? fmtAge(Date.now() - s.telemetry.lastStatusAt) : "—");
        } else {
          badge.className = `source-badge ${recordedName ? "is-recorded" : "is-sim"}`;
          setText(badge, recordedName ? `PRERECORDED · ${recordedName}` : "SIMULATED · Generated environment");
          if (!notice.classList.contains("err")) {
            setText(notice, vrReason ? `${vrReason} The full immersive experience needs a VR headset.` : "Headset detected — press Enter VR for the immersive view.");
          }
          v.setHeadlight(simLight / 100, false);
        }
        const level = live ? s.control.brightness : simLight;
        if (document.activeElement !== brightness) brightness.value = String(level);
        setText(brightVal, `${level}%`);
      });
      render();
      cleanup.push(store.subscribe(render));
      const tick = window.setInterval(render, 500);
      cleanup.push(() => clearInterval(tick));
    },
    unmount() {
      store.patch("control", { headLink: false });
      commands.disarm();
      cleanup.forEach((f) => f());
      cleanup.length = 0;
      view = null;
    },
  };
}

function toggleFullscreen(el: HTMLElement): void {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void el.requestFullscreen?.().catch(() => {});
}
