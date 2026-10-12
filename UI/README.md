# VEIL — Virtual Exploration & Immersive Link

The operator interface for the CN360 remote-presence robot.
*You don't control the robot. You become the robot.*

**Live demo:** https://veil-rho-six.vercel.app (no robot attached — the link shows *Robot offline*, the 360° preview is simulated)

It runs in a desktop browser (mouse and keyboard, 360° view) and in PICO Browser (WebXR immersive VR). The build output is plain static files that the Raspberry Pi serves.

## Quick start

```bash
cd UI
npm install
npm run mock     # terminal 1 — simulated robot on ws://localhost:8765/ws (no hardware)
npm run dev      # terminal 2 — http://localhost:5173, /ws and /cam proxied to the mock
```

To develop against a real Pi instead of the mock:

```bash
VEIL_ROBOT_HOST=192.168.4.1:8443 VEIL_ROBOT_SECURE=1 npm run dev
```

A built app can also point at any robot with `?robot=<host:port>` and/or `?whep=<url>`. The choice is remembered in localStorage.

### Production (served by the Pi)

```bash
npm run build    # → UI/dist/  (relative asset paths, no CDN, works on an offline Wi-Fi AP)
```

Serve `UI/dist/` as static files from the Pi server, on the same origin as `/ws` and `/cam/whep` (WORKING_PROCESS.md §2.3). **WebXR needs HTTPS** on the headset: open `https://<pi-ip>:8443` in PICO Browser.

## Screens

| Route | Screen | What it does |
|---|---|---|
| `#/` | Landing | Wordmark, `ENTER VEIL`, and live availability: WebGL, robot link, headset. |
| `#/command` | Command Center | Robot model (or live camera when available), system statuses, telemetry, readiness. |
| `#/lobby` | 3D Setup Lobby | Orbitable robot with selectable parts, an inspector per part, diagnostics, pan/tilt, motor and light tests, a readiness checklist, and `ENTER LIVE VR` gated on the required checks. `H` hides panels. |
| `#/immersive?mode=preview` | 360° Preview | Simulated crawlspace, or a 360° image you load. Drag or arrow keys to look, scroll to zoom, fullscreen, Enter VR when supported. |
| `#/immersive?mode=live` | Live | Robot camera over WebRTC on a screen that follows the commanded pan/tilt. View direction → `HEAD`; WASD or left stick → `DRIVE`. |

### Live-session gate

`ENTER LIVE VR` unlocks only when all of these pass:

- 3D rendering
- Robot link
- Fresh telemetry (STATUS < 3 s old)
- Camera stream live
- Pan/tilt test confirmed by the operator

A headset is **not** required. Without one, the live view opens in desktop mode.

## Honesty rules (do not break)

- **Every content source is labelled.**
  - `SIMULATED` means the generated environment or the mock robot.
  - `PRERECORDED` means an image loaded from disk.
  - `LIVE` appears only when a WebRTC video track is actually received.
  - `NO SIGNAL` is shown otherwise.
- **Robot identity comes from the robot.**
  - A server that sends `HELLO,…,mock` is shown as *Simulated robot*.
  - A server that sends `HELLO,…,hardware` is shown as *Robot online*.
  - No HELLO means *Connected · unverified*.
- **Actuator tests never claim movement.**
  - Protocol v1 has no actuator feedback. A test reaches *Awaiting confirmation* when STATUS `ack_seq` shows the robot processed the commands.
  - It becomes *Verified* only after the operator confirms they saw it move.
- **No invented metrics.**
  - Battery is shown as raw volts; no percentage until thresholds exist.
  - "Ack lag" is shown in commands, not milliseconds, because STATUS arrives at 1 Hz and can't measure latency.
  - Sensors beyond battery voltage are listed as not in protocol v1.

## Safety behaviour

- `DRIVE` is sent only while driving is *armed*.
  - Desktop: an explicit toggle, then WASD.
  - Headset: a dead-man switch — hold the left grip.
- On disarm, a single zero `DRIVE` is sent, then nothing. The Pi/ESP32 300 ms failsafe keeps the robot stopped.
- Driving is disarmed automatically when any of these happen:
  - the link drops
  - the tab is hidden
  - the page closes
  - the operator leaves the live screen
  - the XR session ends
- Commands are never queued while disconnected, so a stale `DRIVE` is never replayed.
- `LIGHT` is not sent until the operator changes lighting, so connecting never overrides the robot's light state.
- The motor test requires ticking "robot is lifted / path is clear".

## Architecture

```
src/
  main.ts                 boot + router; 3D screens are lazy-loaded (landing JS ≈ 8 KB gz)
  app/      store.ts      single observable state (link, telemetry, video, control, tests)
            session.ts    singletons: RobotLink, VideoStream, CommandLoop, HardwareTests
            router.ts     hash router, cross-fade, focus management
            status.ts     state → operator-facing label + tone (shared by all screens)
  services/ protocol.ts   Protocol v1 encode/parse/clamp (the contract with the Pi)
            transport.ts  WebSocket /ws, backoff 1→10 s, no queueing
            video.ts      WHEP client (recvonly) for MediaMTX /cam/whep
            commandLoop.ts 20 Hz HEAD/DRIVE/LIGHT scheduler
            hardwareTests.ts  pan/tilt sweep, motor pulse, light test (+ ack wait)
            readiness.ts  checklist + live gate (pure)
            capabilities.ts  WebGL / WebXR / WebRTC / secure-context detection
            keyboard.ts, locomotion.ts  input mapping, deadzone/expo, quaternion → HEAD
  three/    renderer.ts   shared renderer (ACES, sRGB, DPR ≤ 2, disposal)
            robotModel.ts procedural schematic robot with named parts (swap for GLTF later)
            robotStage.ts studio scene, orbit, picking, hotspot projection
            crawlspace.ts SIMULATED preview environment at robot-camera height
            immersiveView.ts one scene for desktop 360° and WebXR; live screen; XR HUD + controllers
  screens/  landing.ts, command.ts, lobby.ts, immersive.ts, shared.ts
```

## Protocol notes

Implements Protocol v1 from plan.md Phase 1, unchanged:

```
DRIVE,<seq>,<linear -1..1>,<angular -1..1>,<speed_mode 1|2>
HEAD,<seq>,<yaw>,<pitch>,<roll>       yaw ±90, pitch −45..45 (clamped here and on the robot)
LIGHT,<seq>,<0..100>,<vision 0|1>
STATUS,<seq>,<battery_v>,<ack_seq>    Pi → browser
```

The proposals below need team approval in `Docs/protocol.md` (owner: แฟน, all approve):

1. **`HELLO,<seq>,<mock|hardware>,<server_version>`**, sent by the Pi on connect. The UI already understands it; without it the robot is shown as *unverified*.
2. **Sign convention.** VEIL keeps the Unity prototype's convention: yaw + = turn right, pitch + = look **down**. The ESP32 servo mapping must match.
3. **Second operator.** The mock closes a second operator with code `1013` and reason text. VEIL shows that reason to the operator.

## Tests

```bash
npm test                                   # 49 vitest unit + integration tests (incl. real WebSocket ↔ mock robot)
npm run build                              # typecheck + production build
node tests/e2e/smoke.mjs                   # Chromium: all 4 screens × desktop/phone, screenshots + axe WCAG 2.1 AA
```

`smoke.mjs` uses Playwright's Chromium. Set `CHROME_PATH=…` to use an already-installed browser.

## Needs physical verification

These are implemented against the agreed interfaces but could not be exercised without hardware:

- **PICO 4 + PICO Browser.**
  - `immersive-vr` session entry over HTTPS.
  - Head-pose → `HEAD` sign conventions on the real servos.
  - Controller mapping (left grip + thumbstick to drive, A light, B recenter, Y exit) against PICO's `xr-standard` gamepad layout.
  - In-headset HUD legibility.
  - Frame rate.
- **WebRTC/WHEP from MediaMTX.**
  - Negotiation, latency, and resolution are untested; only the "no stream" path was exercised.
- **Raspberry Pi server.**
  - `Robot/RaspberryPi/code.py` is still empty. VEIL needs it to serve `dist/`, accept `/ws`, reply with `STATUS` (and ideally `HELLO`), and enforce single-operator and failsafe.
- **ESP32 firmware.**
  - `Robot/ESP32/code.py` is empty. Pan/tilt, motor, and light tests will reach "acknowledged" only once the Pi forwards to it, and "verified" only after operator confirmation.
- **Battery voltage source.**
  - The ADC path is not built yet (WORKING_PROCESS §3.3 step 8).
- **Contrast over 3D content.**
  - axe cannot measure text contrast over the canvas or blurred panels. Check readability on the headset and on bright camera feeds.
