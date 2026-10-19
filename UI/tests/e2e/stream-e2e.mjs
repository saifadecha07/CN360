#!/usr/bin/env node
/**
 * End-to-end check of the remote camera path in a real browser:
 *   sign-in → token → WHEP → MediaMTX → WebRTC playback → latency → recovery.
 *
 * Run against the local stack (docs/streaming/testing.md) or a real deployment:
 *   BASE_URL=https://veil.example.com VIEWER_USER=… VIEWER_PASS=… node tests/e2e/stream-e2e.mjs
 *
 * Latency is measured only when the publisher runs CAMERA_TYPE=test on a machine whose
 * clock matches this one (the test pattern carries its capture time in pixels).
 *
 * Optional:
 *   CHROME_PATH            browser to drive (H.264 WebRTC needs Chrome/Edge, not Playwright's Chromium on some OSes)
 *   FORCE_RELAY=1          iceTransportPolicy "relay": proves the TURN path works
 *   RESTART_PUBLISHER_CMD  shell command that restarts the Pi publisher → expects automatic recovery
 *   RESTART_SERVER_CMD     shell command that restarts MediaMTX → expects automatic recovery
 *   SCREENSHOTS=dir        save desktop + phone screenshots
 */
import { chromium } from "playwright";
import { execSync } from "node:child_process";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:8787";
const USER = process.env.VIEWER_USER ?? "alice";
const PASS = process.env.VIEWER_PASS;
const results = [];
const record = (name, ok, detail = "") => { results.push({ name, ok, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`); };

if (!PASS) { console.error("Set VIEWER_PASS"); process.exit(2); }

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ["--autoplay-policy=no-user-gesture-required"] });
const context = await browser.newContext({ viewport: { width: 1366, height: 860 } });
if (process.env.FORCE_RELAY === "1") {
  await context.addInitScript(() => {
    const Native = window.RTCPeerConnection;
    window.RTCPeerConnection = function (cfg) { return new Native({ ...(cfg ?? {}), iceTransportPolicy: "relay" }); };
    window.RTCPeerConnection.prototype = Native.prototype;
  });
}
const page = await context.newPage();
const consoleErrors = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });

// textContent, not innerText: the pill is CSS-uppercased.
const pillText = () => page.locator(".watch__head .pill").textContent();
async function waitForPill(re, timeout) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const t = await pillText().catch(() => "");
    if (re.test(t)) return { text: t, ms: Date.now() - t0 };
    await page.waitForTimeout(100);
  }
  return null;
}

try {
  // 1. Unauthenticated: must ask for sign-in, and no WHEP request may be made.
  const whepRequests = [];
  page.on("request", (r) => { if (/\/whep/.test(r.url())) whepRequests.push(r.method()); });
  await page.goto(`${BASE}/#/watch`);
  const signin = await waitForPill(/Sign-in required/, 15000);
  record("unauthenticated viewer is asked to sign in", !!signin && await page.locator(".watch__signin").isVisible(), signin?.text);
  record("no media request before sign-in", whepRequests.length === 0, `${whepRequests.length} WHEP requests`);

  // 2. Wrong password is rejected with a useful message.
  await page.fill("#w-user", USER);
  await page.fill("#w-pass", "definitely-wrong-password");
  await page.click(".watch__signin button[type=submit]");
  await page.waitForSelector(".watch__signin [role=alert]:not(:empty)", { timeout: 10000 });
  record("wrong password rejected", true, await page.locator(".watch__signin [role=alert]").innerText());

  // 3. Correct sign-in → live video.
  await page.fill("#w-pass", PASS);
  const t0 = Date.now();
  await page.click(".watch__signin button[type=submit]");
  const live = await waitForPill(/^Live$/, 20000);
  record("signed-in viewer goes live", !!live, live ? `${Date.now() - t0} ms from sign-in to first frame` : await pillText());
  if (!live) throw new Error("not live");
  const cookies = await context.cookies();
  const session = cookies.find((c) => c.name === "veil_stream_session");
  record("session cookie is HttpOnly + SameSite=Strict", !!session?.httpOnly && session.sameSite === "Strict");
  const jsVisible = await page.evaluate(() => document.cookie.includes("veil_stream_session"));
  record("session cookie not readable from JavaScript", !jsVisible);

  // "Live" = track arrived; the first decoded frame (videoWidth > 0) can follow a moment later.
  await page.waitForFunction(() => document.querySelector(".watch__stage video")?.videoWidth > 0, null, { timeout: 10000 });
  const info = await page.evaluate(() => {
    const v = document.querySelector(".watch__stage video");
    return { w: v.videoWidth, h: v.videoHeight, muted: v.muted, playsInline: v.playsInline, paused: v.paused };
  });
  record("video element plays muted + inline", info.muted && info.playsInline && !info.paused, `${info.w}x${info.h}`);

  // 4. Latency from the test pattern's embedded capture time.
  const lat = await page.evaluate(async () => {
    const v = document.querySelector(".watch__stage video");
    const BITS = 44;
    const w = v.videoWidth;
    const c = Object.assign(document.createElement("canvas"), { width: w, height: 1 });
    const ctx = c.getContext("2d", { willReadFrequently: true });
    const samples = [];
    await new Promise((resolve) => {
      const end = performance.now() + 10000;
      setTimeout(resolve, 12000); // hard stop if frame callbacks stall
      const onFrame = () => {
        ctx.drawImage(v, 0, 24, w, 1, 0, 0, w, 1);
        const d = ctx.getImageData(0, 0, w, 1).data;
        const bw = Math.floor(w / BITS);
        let ms = 0;
        for (let i = 0; i < BITS; i++) ms = ms * 2 + (d[(i * bw + (bw >> 1)) * 4] > 128 ? 1 : 0);
        const age = Date.now() - ms;
        if (age > -50 && age < 60000) samples.push(age);
        if (performance.now() < end) v.requestVideoFrameCallback(onFrame); else resolve();
      };
      v.requestVideoFrameCallback(onFrame);
    });
    samples.sort((a, b) => a - b);
    const q = (p) => samples[Math.min(samples.length - 1, Math.floor(p * samples.length))];
    return { n: samples.length, p50: q(0.5), p95: q(0.95), max: samples.at(-1) };
  });
  if (lat.n > 30) record("latency measured (test pattern → displayed frame)", true, `n=${lat.n} median ${lat.p50} ms, p95 ${lat.p95} ms, max ${lat.max} ms`);
  else record("latency measured", false, "no decodable timestamps (publisher not in CAMERA_TYPE=test?)");

  // 5. Diagnostics (route, fps, bitrate) come from getStats.
  await page.click(".watch__diag summary");
  await page.waitForTimeout(4500);
  const diag = await page.locator(".watch__diag .kv").innerText();
  const route = /Route\s+(.+)/.exec(diag)?.[1] ?? "?";
  record("diagnostics populated", !/Frame rate\s+—/.test(diag), diag.replace(/\s*\n\s*/g, " | "));
  if (process.env.FORCE_RELAY === "1") record("media flows through TURN relay", /TURN relay/.test(route), route);

  // 6. Recovery: publisher restart, then media-server restart.
  for (const [label, cmd] of [["publisher restart", process.env.RESTART_PUBLISHER_CMD], ["media server restart", process.env.RESTART_SERVER_CMD]]) {
    if (!cmd) continue;
    execSync(cmd, { stdio: "inherit" });
    const down = await waitForPill(/Reconnecting|Offline|Connecting/, 20000);
    const back = await waitForPill(/^Live$/, 60000);
    record(`recovers automatically after ${label}`, !!down && !!back, down && back ? `saw "${down.text}", live again after ${back.ms} ms` : await pillText());
  }

  // 7. Manual retry button.
  if (await page.locator(".watch__msg button").isVisible()) await page.click(".watch__msg button");

  // 8. Layout screenshots.
  if (process.env.SCREENSHOTS) {
    await page.screenshot({ path: `${process.env.SCREENSHOTS}/watch-desktop-live.png` });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(800);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    record("phone layout has no horizontal overflow", !overflow);
    await page.screenshot({ path: `${process.env.SCREENSHOTS}/watch-phone-live.png`, fullPage: true });
  }

  // 9. Unmount releases the stream.
  await page.evaluate(() => { location.hash = "#/"; });
  await page.waitForTimeout(1500);
  const released = await page.evaluate(() => !document.querySelector("video") || !document.querySelector("video").srcObject);
  record("leaving the viewer releases the WebRTC session", released);

  // 10. Sign-out revokes access.
  await page.evaluate(async () => { await fetch("/api/stream/session", { method: "DELETE" }); });
  const after = await page.evaluate(async () => (await fetch("/api/stream/token", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status);
  record("sign-out revokes token issuance", after === 401, `token endpoint → ${after}`);
} catch (e) {
  record("run", false, e instanceof Error ? e.message : String(e));
} finally {
  // The robot control link (/ws) is a separate system and may legitimately be absent here.
  const relevant = consoleErrors.filter((t) => !/401|Failed to load resource|\/ws' failed/.test(t));
  record("no unexpected console errors", relevant.length === 0, relevant.slice(0, 3).join(" | "));
  await browser.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
}
