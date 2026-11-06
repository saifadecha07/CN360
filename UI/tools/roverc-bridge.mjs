#!/usr/bin/env node
/**
 * VEIL ⇄ M5Stack RoverC bridge — runs on a laptop joined to the robot's Wi-Fi.
 *
 * The RoverC firmware (M5StickC Plus, AP "RoverC-XXXX", 192.168.4.1) speaks its own
 * JSON protocol on ws://<robot>:81/ and only accepts its own page as Origin.
 * VEIL speaks CN360 Protocol v1 on /ws. This process sits in between:
 *
 *   VEIL (PICO, https) ──wss /ws──▶ vite proxy ──▶ bridge :8765/ws ──ws :81──▶ RoverC
 *
 *   node tools/roverc-bridge.mjs [--robot 192.168.4.1] [--port 8765] [--key <control key>]
 *
 * Mapping: DRIVE linear / strafe (optional 6th field) / angular → the robot's six
 * directions (forward/backward, left/right slide, rotate_left/rotate_right);
 * magnitude → speed up to the robot's speed limit. The robot runs one direction at
 * a time, so with several axes pushed the strongest one wins — see "drive mapping". HEAD and LIGHT are acknowledged only (no servo, no light).
 *
 * Safety: stop on DRIVE 0,0, on 300 ms without DRIVE, on operator disconnect and on
 * robot reconnect. The robot itself also stops when "move" repeats stop arriving.
 */
import { createServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";

const args = process.argv.slice(2);
const opt = (name, def) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : def);
const robotHost = opt("robot", "192.168.4.1");
const port = Number(opt("port", 8765));
const controlKey = opt("key", "");

const DEADZONE = 0.12;
const MIN_SPEED = 8;          // below this the RoverC motors stall
const REPEAT_MS = 100;        // re-send "move" while held (robot timeout is ~400 ms)
const DRIVE_FAILSAFE_MS = 300;

const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);

// ─── robot side ─────────────────────────────────────────────────────────────
const robot = {
  ws: null,
  open: false,
  controller: false,
  speedLimit: 30,
  status: null,
  retry: 0,
};

function robotSend(msg) {
  if (robot.ws && robot.ws.readyState === WebSocket.OPEN) robot.ws.send(JSON.stringify(msg));
}

function connectRobot() {
  const url = `ws://${robotHost}:81/`;
  const ws = new WebSocket(url, { headers: { Origin: `http://${robotHost}` }, handshakeTimeout: 4000 });
  robot.ws = ws;
  ws.on("open", () => {
    robot.open = true;
    robot.retry = 0;
    log(`[robot] connected ${url}`);
    robotSend({ type: "stop" });
  });
  ws.on("message", (data) => {
    let msg;
    try { msg = JSON.parse(String(data)); } catch { return; }
    switch (msg.type) {
      case "hello":
        if (Number.isInteger(msg.speedLimit)) robot.speedLimit = msg.speedLimit;
        log(`[robot] hello: speedLimit=${robot.speedLimit} timeout=${msg.commandTimeoutMs}ms keyRequired=${!!msg.controlKeyRequired}`);
        claim();
        break;
      case "status":
        robot.status = msg;
        robot.controller = !!msg.controller;
        if (Number.isInteger(msg.speedLimit)) robot.speedLimit = msg.speedLimit;
        if (!robot.controller && operator) claim();
        break;
      case "control":
        robot.controller = !!msg.granted;
        log(`[robot] control ${msg.granted ? "granted" : `denied (${msg.reason})`}`);
        break;
      case "error":
        log(`[robot] error: ${msg.code} ${msg.message ?? ""}`);
        if (msg.code === "not_controller") { robot.controller = false; claim(); }
        break;
    }
  });
  ws.on("close", () => {
    if (robot.open) log("[robot] disconnected");
    robot.open = false;
    robot.controller = false;
    const delay = Math.min(5000, 500 * 2 ** robot.retry++);
    setTimeout(connectRobot, delay);
  });
  ws.on("error", (e) => { if (!robot.open && robot.retry < 2) log(`[robot] ${e.message}`); });
}

let lastClaimAt = 0;
function claim() {
  if (Date.now() - lastClaimAt < 1000) return;
  lastClaimAt = Date.now();
  const msg = { type: "claim", force: true };
  if (controlKey) msg.key = controlKey;
  robotSend(msg);
}

setInterval(() => robotSend({ type: "ping", id: Date.now() >>> 0 }), 2000);

// ─── drive mapping ──────────────────────────────────────────────────────────
// The firmware runs one direction at a time and rate-limits messages, so:
//  - one scheduler (TICK_MS) decides what to send; DRIVE frames only update the target;
//  - "move" goes out when the direction changes, the speed changes noticeably, or
//    every REPEAT_MS to keep the robot's watchdog fed — never faster than MIN_GAP_MS;
//  - several axes at once (e.g. forward + rotate): the robot can only run one
//    direction, and alternating between them made it jerk, so the strongest axis
//    wins. The current direction is kept until another axis is stronger by
//    SWITCH_MARGIN (hysteresis), so a stick near a diagonal does not flip-flop.
//    Smooth arcs need per-wheel speeds, which this firmware does not accept.
const TICK_MS = 25;
const MIN_GAP_MS = 60;
const SWITCH_MARGIN = 0.2;

const drive = { target: null, sent: { dir: null, speed: 0, at: 0 }, lastDriveAt: 0 };

/** → null (stop) or { speed, axes: [{ dir, mag }] }. */
export function mapDrive(linear, angular, strafe, mode, limit) {
  const axes = [
    { v: linear, pos: "forward", neg: "backward" },
    { v: strafe, pos: "right", neg: "left" },
    { v: angular, pos: "rotate_right", neg: "rotate_left" },
  ].filter((a) => Math.abs(a.v) >= DEADZONE);
  if (!axes.length) return null;
  const mag = Math.max(...axes.map((a) => Math.abs(a.v)));
  const scale = mode === 2 ? 1 : 0.7;
  const speed = Math.max(MIN_SPEED, Math.min(limit, Math.round(mag * scale * limit)));
  return { speed, axes: axes.map((a) => ({ dir: a.v > 0 ? a.pos : a.neg, mag: Math.abs(a.v) })) };
}

/** Strongest axis, but stay on `current` unless another beats it by SWITCH_MARGIN. */
export function pickDirection(axes, current) {
  const best = axes.reduce((a, b) => (b.mag > a.mag ? b : a));
  const cur = axes.find((a) => a.dir === current);
  return cur && best.mag - cur.mag < SWITCH_MARGIN ? cur.dir : best.dir;
}

function setDrive(next) {
  drive.target = next;
  if (!next && drive.sent.dir) {
    drive.sent = { dir: null, speed: 0, at: Date.now() };
    robotSend({ type: "stop" });
    log("[drive] stop");
  }
}

setInterval(() => {
  const now = Date.now();
  if (drive.target && now - drive.lastDriveAt > DRIVE_FAILSAFE_MS) { log("[drive] FAILSAFE: no DRIVE for 300 ms"); setDrive(null); return; }
  const t = drive.target;
  if (!t) return;
  const s = drive.sent;
  const dir = pickDirection(t.axes, s.dir);
  const due = dir !== s.dir || Math.abs(t.speed - s.speed) >= 2 || now - s.at >= REPEAT_MS;
  if (!due || now - s.at < MIN_GAP_MS) return;
  robotSend({ type: "move", direction: dir, speed: t.speed });
  if (dir !== s.dir) log(`[drive] ${dir} @ ${t.speed}`);
  drive.sent = { dir, speed: t.speed, at: now };
}, TICK_MS);

// ─── VEIL side (Protocol v1) ────────────────────────────────────────────────
let operator = null;
let ackSeq = 0;
let outSeq = 0;

function handleLine(line) {
  const p = String(line).trim().split(",");
  const seq = Number(p[1]);
  if (!Number.isInteger(seq) || seq < 0) return;
  if (seq <= ackSeq && seq !== 0) return;
  const n = p.slice(2).map(Number);
  if (n.some((x) => !Number.isFinite(x))) return;
  switch (p[0]) {
    case "DRIVE": {
      if (n.length < 3) return;
      drive.lastDriveAt = Date.now();
      const c = (v) => Math.max(-1, Math.min(1, v ?? 0));
      setDrive(mapDrive(c(n[0]), c(n[1]), c(n[3]), n[2], robot.speedLimit));
      break;
    }
    case "HEAD":
    case "LIGHT":
      break;  // no servo / light on the RoverC: acknowledge only
    default:
      return;
  }
  ackSeq = seq;
}

const http = createServer((req, res) => {
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("RoverC bridge: no camera stream.\n");
});
const wss = new WebSocketServer({ server: http, path: "/ws" });

wss.on("connection", (ws, req) => {
  if (operator && operator.readyState === WebSocket.OPEN) {
    ws.close(1013, "Another operator is already connected");
    return;
  }
  operator = ws;
  ackSeq = 0;
  log(`[veil] operator connected from ${req.socket.remoteAddress}`);
  ws.send(`HELLO,${++outSeq},hardware,roverc-bridge/0.1`);
  claim();
  ws.on("message", handleLine);
  ws.on("close", () => {
    if (operator === ws) operator = null;
    setDrive(null);
    robotSend({ type: "stop" });
    log("[veil] operator disconnected → stop");
  });
});

// STATUS 1 Hz, only while the robot link is up (VEIL then shows "robot offline" otherwise).
setInterval(() => {
  if (!operator || operator.readyState !== WebSocket.OPEN || !robot.open) return;
  const s = robot.status ?? {};
  const v = Number(s.batteryV ?? s.battery ?? s.vbat ?? 0);
  operator.send(`STATUS,${++outSeq},${(Number.isFinite(v) ? v : 0).toFixed(2)},${ackSeq}`);
}, 1000);

http.listen(port, () => {
  log(`[bridge] VEIL side ws://localhost:${port}/ws  →  RoverC ws://${robotHost}:81/`);
  connectRobot();
});
