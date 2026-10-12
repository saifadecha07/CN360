#!/usr/bin/env node
/**
 * VEIL mock robot — DEVELOPMENT ONLY.
 * Speaks CN360 Protocol v1 over WebSocket at ws://localhost:<port>/ws so the UI
 * can be exercised without a Raspberry Pi. It announces itself with
 * `HELLO,<seq>,mock,...` and the UI labels everything from it as SIMULATED.
 *
 *   node tools/mock-robot.mjs [--port 8765] [--quiet]
 *
 * Mirrors the rules in plan.md Phase 1: one operator at a time, 300 ms DRIVE
 * failsafe, STATUS every second with ack_seq. Video is NOT simulated.
 */
import { createServer } from "node:http";
import { WebSocketServer } from "ws";

const args = process.argv.slice(2);
const port = Number(args[args.indexOf("--port") + 1]) || 8765;
const quiet = args.includes("--quiet");

const state = {
  battery: 8.2,
  ackSeq: 0,
  drive: { linear: 0, angular: 0, mode: 1 },
  head: { yaw: 0, pitch: 0, roll: 0 },
  light: { brightness: 0, vision: 0 },
  lastDriveAt: 0,
  moving: false,
  counts: { DRIVE: 0, HEAD: 0, LIGHT: 0, invalid: 0 },
};

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function handle(line) {
  const p = String(line).trim().split(",");
  const seq = Number(p[1]);
  if (!Number.isInteger(seq) || seq < 0) return state.counts.invalid++;
  if (seq <= state.ackSeq && seq !== 0) return; // drop stale/duplicate
  const n = p.slice(2).map(Number);
  if (n.some((x) => !Number.isFinite(x))) return state.counts.invalid++;

  switch (p[0]) {
    case "DRIVE":
      if (n.length !== 3) return state.counts.invalid++;
      state.drive = { linear: clamp(n[0], -1, 1), angular: clamp(n[1], -1, 1), mode: n[2] === 2 ? 2 : 1 };
      state.lastDriveAt = Date.now();
      state.moving = state.drive.linear !== 0 || state.drive.angular !== 0;
      break;
    case "HEAD":
      if (n.length !== 3) return state.counts.invalid++;
      state.head = { yaw: clamp(n[0], -90, 90), pitch: clamp(n[1], -45, 45), roll: n[2] };
      break;
    case "LIGHT":
      if (n.length !== 2) return state.counts.invalid++;
      state.light = { brightness: clamp(n[0], 0, 100), vision: n[1] ? 1 : 0 };
      break;
    default:
      return state.counts.invalid++;
  }
  state.counts[p[0]]++;
  state.ackSeq = seq;
}

// HTTP side: the mock has no camera, so every request (incl. /cam/whep) answers 404,
// which is what MediaMTX returns for an unpublished path.
const http = createServer((req, res) => {
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("The VEIL mock robot has no camera stream.\n");
});
const wss = new WebSocketServer({ server: http, path: "/ws" });
http.listen(port);
let operator = null;
let outSeq = 0;

wss.on("connection", (ws, req) => {
  if (operator && operator.readyState === operator.OPEN) {
    ws.close(1013, "Another operator is already connected");
    return;
  }
  operator = ws;
  state.ackSeq = 0;
  console.log(`[mock] operator connected from ${req.socket.remoteAddress}`);
  ws.send(`HELLO,${++outSeq},mock,veil-mock/0.1`);
  ws.on("message", (data) => handle(data));
  ws.on("close", () => {
    if (operator === ws) operator = null;
    if (state.moving) console.log("[mock] FAILSAFE: link closed → DRIVE 0,0");
    state.moving = false;
    console.log("[mock] operator disconnected");
  });
});

// Failsafe watchdog (300 ms without DRIVE while moving → stop).
setInterval(() => {
  if (state.moving && Date.now() - state.lastDriveAt > 300) {
    state.moving = false;
    state.drive = { linear: 0, angular: 0, mode: 1 };
    console.log("[mock] FAILSAFE: no DRIVE for 300 ms → stop");
  }
}, 50);

// STATUS at 1 Hz; battery drains slowly and sags under load. Values are fake.
setInterval(() => {
  state.battery = Math.max(6.6, state.battery - 0.0008 - (state.moving ? 0.002 : 0));
  const v = state.battery - (state.moving ? 0.15 : 0);
  if (operator && operator.readyState === operator.OPEN) operator.send(`STATUS,${++outSeq},${v.toFixed(2)},${state.ackSeq}`);
}, 1000);

if (!quiet) {
  setInterval(() => {
    if (!operator) return;
    const { drive: d, head: h, light: l, counts: c } = state;
    console.log(
      `[mock] ack=${state.ackSeq} drive=${d.linear.toFixed(2)}/${d.angular.toFixed(2)} m${d.mode}` +
      ` head=${h.yaw.toFixed(0)}°/${h.pitch.toFixed(0)}° light=${l.brightness}%${l.vision ? " IR" : ""}` +
      ` | rx D${c.DRIVE} H${c.HEAD} L${c.LIGHT} bad${c.invalid}`,
    );
  }, 2000);
}

console.log(`[mock] VEIL mock robot (SIMULATED) on ws://localhost:${port}/ws`);
