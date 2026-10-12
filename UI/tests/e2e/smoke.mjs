#!/usr/bin/env node
/**
 * Browser smoke test across all four screens, desktop + phone widths.
 * Starts the mock robot and the Vite dev server, drives Chromium, saves
 * screenshots to tests/e2e/screenshots/, and fails on unexpected console errors.
 *
 *   node tests/e2e/smoke.mjs            (CHROME_PATH=/path/to/chrome to override browser)
 */
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { chromium } from "playwright";

const axeSource = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");

const PORT = 5199, MOCK = 8765;
const out = fileURLToPath(new URL("./screenshots/", import.meta.url));
mkdirSync(out, { recursive: true });

const procs = [];
const run = (cmd, args, ready) => new Promise((res, rej) => {
  const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, VEIL_ROBOT_HOST: `localhost:${MOCK}` } });
  procs.push(p);
  const onData = (d) => { if (ready.test(String(d))) res(p); };
  p.stdout.on("data", onData); p.stderr.on("data", onData);
  p.on("exit", (c) => rej(new Error(`${cmd} exited ${c}`)));
});
const cleanup = () => procs.forEach((p) => p.kill());
process.on("exit", cleanup);

const checks = [];
const check = (name, ok, extra = "") => { checks.push({ name, ok }); console.log(`${ok ? "✓" : "✗"} ${name}${extra ? ` — ${extra}` : ""}`); };

try {
  await run(process.execPath, ["tools/mock-robot.mjs", "--port", String(MOCK), "--quiet"], /mock robot/);
  await run("npx", ["vite", "--port", String(PORT), "--strictPort"], /Local:/);

  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined,
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
  });

  for (const vp of [{ name: "desktop", width: 1440, height: 900 }, { name: "phone", width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    const errors = [];
    page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
    page.on("pageerror", (e) => errors.push(String(e)));
    const shot = async (n) => {
      await page.screenshot({ path: `${out}${vp.name}-${n}.png` });
      // WCAG 2.1 AA audit of the visible DOM (canvas content is not auditable).
      await page.evaluate(axeSource);
      const res = await page.evaluate(() => window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa"] }));
      const bad = res.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      check(`[${vp.name}] a11y ${n}`, bad.length === 0, bad.map((v) => `${v.id}: ${v.nodes.length} × ${v.nodes[0]?.target}`).join("; "));
    };
    const base = `http://localhost:${PORT}/`;

    // 01 Landing
    await page.goto(base);
    await page.getByRole("button", { name: "ENTER VEIL" }).waitFor();
    await page.getByText("Robot link · Simulated robot").waitFor({ timeout: 8000 });
    check(`[${vp.name}] landing shows real link state (simulated robot)`, true);
    await page.waitForTimeout(1200);
    await shot("01-landing");

    // 02 Command Center
    await page.getByRole("button", { name: "ENTER VEIL" }).click();
    await page.locator(".cc canvas").waitFor();
    await page.getByText("Battery via STATUS", { exact: false }).or(page.getByText(/Battery \d\.\d\d V/)).first().waitFor({ timeout: 6000 });
    await page.getByText("No camera stream published at /cam/whep").first().waitFor({ timeout: 8000 });
    check(`[${vp.name}] command center reports missing camera honestly`, true);
    const src = await page.locator(".kv dd").first().textContent();
    check(`[${vp.name}] telemetry source labelled SIMULATED`, src === "SIMULATED", src ?? "");
    await page.waitForTimeout(800);
    await shot("02-command");

    // 03 Lobby
    await page.getByRole("button", { name: "OPEN SETUP LOBBY" }).click();
    await page.locator(".lobby canvas").waitFor();
    await page.waitForTimeout(800);
    await shot("03-lobby");
    await page.locator(".hotspot", { hasText: "Camera" }).click();
    await page.getByRole("heading", { name: "Camera" }).waitFor();
    check(`[${vp.name}] hotspot opens inspector`, true);
    await page.getByRole("button", { name: "Reset view" }).click();
    await page.locator(".parts button", { hasText: "Pan / Tilt" }).click();
    await page.getByRole("button", { name: "Run sweep test" }).click();
    await page.getByText("Awaiting confirmation").waitFor({ timeout: 8000 });
    check(`[${vp.name}] pan/tilt test acknowledged by robot, awaiting operator`, true);
    await page.getByRole("button", { name: "Yes, it moved" }).click();
    await page.getByText("Confirmed by operator").first().waitFor();
    const live = page.getByRole("button", { name: "ENTER LIVE VR" });
    check(`[${vp.name}] ENTER LIVE VR blocked without camera`, await live.isDisabled());
    const blocking = await page.locator(".lobby__blocking").textContent();
    check(`[${vp.name}] blocking reason names the camera`, /Camera stream/.test(blocking ?? ""), blocking ?? "");
    await page.waitForTimeout(600);
    await shot("03-lobby-pantilt");
    await page.getByRole("button", { name: "Reset view" }).click();
    await page.locator(".parts button", { hasText: "Lighting" }).click();
    await page.locator('input[aria-label="LED brightness"]').fill("70");
    await shot("03-lobby-lights");

    // 04 Preview
    await page.getByRole("button", { name: "360° Preview" }).click();
    await page.locator(".source-badge").filter({ hasText: "SIMULATED" }).waitFor();
    check(`[${vp.name}] preview labelled SIMULATED`, true);
    const vr = page.getByRole("button", { name: "ENTER VR" });
    check(`[${vp.name}] ENTER VR disabled without headset`, await vr.isDisabled());
    const box = await page.locator(".imm__reticle").boundingBox();
    if (box) {
      await page.mouse.move(box.x, box.y);
      await page.mouse.down();
      await page.mouse.move(box.x - 260, box.y + 40, { steps: 8 });
      await page.mouse.up();
    }
    await page.waitForTimeout(600);
    await shot("04-preview");

    // 04 Live (direct navigation — must show NO SIGNAL, never fake video)
    await page.goto(`${base}#/immersive?mode=live`);
    await page.locator(".source-badge").filter({ hasText: "NO SIGNAL" }).waitFor({ timeout: 10000 });
    check(`[${vp.name}] live mode without stream shows NO SIGNAL`, true);
    await page.waitForTimeout(600);
    await shot("04-live-nosignal");

    check(`[${vp.name}] no unexpected console errors`, errors.length === 0, errors.join(" | "));
    await page.close();
  }
  await browser.close();
} catch (e) {
  check("smoke run completed", false, String(e));
} finally {
  cleanup();
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed. Screenshots: ${out}`);
process.exit(failed.length ? 1 : 0);
