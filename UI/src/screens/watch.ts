/**
 * 05 — Live camera viewer. The camera alone, full-bleed, for operators and observers
 * who don't need the 3D tooling. Signs in when the stream is remote (Vercel → VPS).
 *
 * Connection state comes from the store (a handful of transitions); playback
 * diagnostics are polled from getStats() every 2 s straight into the DOM.
 */
import { h, pill, setText, frameThrottle } from "../ui/dom";
import { store } from "../app/store";
import { videoStatus } from "../app/status";
import { video, ensureVideo } from "../app/session";
import { topbar } from "./shared";
import type { Screen } from "../app/router";
import { currentAccount, signIn, signOut, StreamApiError } from "../services/streamAuth";

const MESSAGES: Partial<Record<string, string>> = {
  offline: "The camera is not publishing right now. VEIL keeps checking and will start playing as soon as it is back.",
  unavailable: "This browser cannot play WebRTC video. Use a current Chrome, Edge, Firefox or Safari.",
};

export function watchScreen(): Screen {
  let unsub = () => {};
  let statsTimer = 0;

  return {
    async mount(root) {
      root.classList.add("watch");
      const statusPill = pill("", "idle");
      const account = h("span", { class: "small muted", hidden: true });
      const signOutBtn = h("button", { class: "btn btn--sm btn--quiet", hidden: true }, "Sign out");

      const spinner = h("div", { class: "spinner", role: "presentation", "aria-hidden": "true" });
      const msgTitle = h("p", { class: "watch__msg-title" });
      const msgText = h("p", { class: "small muted watch__msg-text" });
      const retryBtn = h("button", { class: "btn btn--sm" }, "Retry now");
      const message = h("div", { class: "watch__msg", role: "status", "aria-live": "polite" }, spinner, msgTitle, msgText, retryBtn);
      const playBtn = h("button", { class: "btn btn--primary btn--lg watch__play", hidden: true }, "Tap to play");

      // Sign-in (remote mode only). Credentials go straight to /api/stream/session and are never kept in JS state.
      const userIn = h("input", { type: "text", id: "w-user", name: "username", autocomplete: "username", required: true, maxlength: 64 }) as HTMLInputElement;
      const passIn = h("input", { type: "password", id: "w-pass", name: "password", autocomplete: "current-password", required: true }) as HTMLInputElement;
      const formErr = h("p", { class: "small tone-err", role: "alert" });
      const submit = h("button", { class: "btn btn--primary", type: "submit" }, "Sign in");
      const form = h("form", { class: "panel watch__signin", hidden: true, "aria-labelledby": "w-title" },
        h("h2", { class: "title", id: "w-title" }, "Sign in to watch"),
        h("p", { class: "small muted" }, "This camera is private. Use the account your team lead created for you."),
        h("label", { class: "field", for: "w-user" }, "User name", userIn),
        h("label", { class: "field", for: "w-pass" }, "Password", passIn),
        formErr,
        h("div", { class: "watch__actions" }, submit),
      ) as HTMLFormElement;

      // Honesty rule: LIVE only once a WebRTC video track has actually arrived.
      const badge = h("span", { class: "source-badge watch__badge" }, "NO SIGNAL · Robot camera");
      const stage = h("div", { class: "watch__stage" }, badge, message, playBtn);
      const stats: Record<string, HTMLElement> = {};
      const kv = h("dl", { class: "kv" });
      for (const [k, label] of [["mode", "Source"], ["res", "Resolution"], ["fps", "Frame rate"], ["rate", "Bitrate"],
        ["delay", "Jitter buffer"], ["rtt", "Round trip"], ["lost", "Packets lost"], ["route", "Route"]] as const) {
        stats[k] = h("dd", {}, "—");
        kv.append(h("dt", {}, label), stats[k]);
      }
      const details = h("details", { class: "panel watch__diag" }, h("summary", { class: "label" }, "Diagnostics"), kv,
        h("p", { class: "small muted" }, "Glass-to-glass latency also includes camera exposure and encoding on the Pi; the figures here cover the network and the browser only."));

      root.append(
        topbar("Live camera", account, signOutBtn),
        h("main", { class: "watch__main" },
          h("div", { class: "watch__head" }, h("h1", { class: "title" }, "Robot camera"), statusPill.el),
          stage, form, details),
      );

      const v = video.element;
      v.setAttribute("aria-label", "Live robot camera");
      stage.prepend(v);

      // ── Behaviour ──────────────────────────────────────────────────────
      const showAccount = (user: string | null) => {
        account.hidden = signOutBtn.hidden = !user;
        setText(account, user ? `Signed in as ${user}` : "");
      };

      retryBtn.addEventListener("click", () => video.retry());
      playBtn.addEventListener("click", () => void video.resumePlayback());
      signOutBtn.addEventListener("click", async () => {
        await signOut();
        showAccount(null);
        video.resetSource();
      });
      form.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        submit.disabled = true;
        setText(formErr, "");
        try {
          const acct = await signIn(userIn.value.trim(), passIn.value);
          passIn.value = "";
          showAccount(acct.user);
          video.resetSource();
        } catch (e) {
          setText(formErr, e instanceof StreamApiError ? e.message : "Could not reach the sign-in service. Check your connection.");
        } finally {
          submit.disabled = false;
        }
      });

      const render = frameThrottle(() => {
        const s = store.state.video;
        const vs = videoStatus(store.state);
        statusPill.set(vs.text, vs.tone);
        const busy = s.state === "connecting" || s.state === "reconnecting";
        stage.classList.toggle("is-live", s.state === "live");
        badge.className = `source-badge watch__badge${s.state === "live" ? " is-live" : ""}`;
        setText(badge, s.state === "live" ? "LIVE · Robot camera" : busy ? "CONNECTING · Robot camera" : "NO SIGNAL · Robot camera");
        spinner.hidden = !busy;
        message.hidden = s.state === "live" || s.state === "unauthorized";
        setText(msgTitle, busy ? (s.state === "reconnecting" ? "Reconnecting…" : "Connecting to the camera…") : vs.text);
        setText(msgText, MESSAGES[s.state] ?? s.error ?? "");
        retryBtn.hidden = busy || s.state === "unavailable" || s.state === "idle";
        playBtn.hidden = !(s.state === "live" && s.blocked);
        const wasHidden = form.hidden;
        form.hidden = s.state !== "unauthorized";
        stage.hidden = !form.hidden; // nothing to show until signed in; the form takes the stage's place
        if (wasHidden && !form.hidden) userIn.focus();
      });
      unsub = store.subscribe((s, p) => { if (s.video !== p.video) render(); });
      render();

      let prevBytes = 0, prevAt = 0;
      const pollStats = async () => {
        if (store.state.video.state !== "live") return;
        const report = await video.getStats();
        if (!report) return;
        let inbound: Record<string, number> | undefined, pair: Record<string, unknown> | undefined;
        const byId = new Map<string, Record<string, unknown>>();
        report.forEach((r: Record<string, unknown>) => {
          byId.set(r.id as string, r);
          if (r.type === "inbound-rtp" && r.kind === "video") inbound = r as Record<string, number>;
          if (r.type === "candidate-pair" && r.nominated && r.state === "succeeded") pair = r;
        });
        setText(stats.res, v.videoWidth ? `${v.videoWidth} × ${v.videoHeight}` : "—");
        if (inbound) {
          setText(stats.fps, inbound.framesPerSecond ? `${Math.round(inbound.framesPerSecond)} fps` : "—");
          const now = performance.now();
          if (prevAt && inbound.bytesReceived >= prevBytes) {
            setText(stats.rate, `${((inbound.bytesReceived - prevBytes) * 8 / ((now - prevAt) / 1000) / 1e6).toFixed(2)} Mbit/s`);
          }
          prevBytes = inbound.bytesReceived; prevAt = now;
          if (inbound.jitterBufferEmittedCount) {
            setText(stats.delay, `${Math.round(inbound.jitterBufferDelay / inbound.jitterBufferEmittedCount * 1000)} ms`);
          }
          setText(stats.lost, String(inbound.packetsLost ?? 0));
        }
        if (pair) {
          setText(stats.rtt, typeof pair.currentRoundTripTime === "number" ? `${Math.round(pair.currentRoundTripTime * 1000)} ms` : "—");
          const local = byId.get(pair.localCandidateId as string);
          const type = local?.candidateType === "relay" ? "TURN relay" : local?.candidateType === "srflx" || local?.candidateType === "prflx" ? "Direct (NAT)" : "Direct";
          setText(stats.route, `${type} · ${String(local?.protocol ?? "udp").toUpperCase()}`);
        }
      };
      statsTimer = window.setInterval(() => void pollStats(), 2000);

      ensureVideo();
      const kind = await video.sourceKind();
      setText(stats.mode, kind === "remote" ? "Remote (media server)" : "Direct (robot)");
      if (kind === "remote") {
        try { showAccount((await currentAccount())?.user ?? null); } catch { /* status shows the real error */ }
      }
    },
    unmount() {
      unsub();
      clearInterval(statsTimer);
      // Release the WebRTC session and the server-side reader; other screens restart it on demand.
      video.stop();
      video.element.remove();
    },
  };
}
