---
name: veil-ui
description: Conventions for the VEIL operator interface in UI/ (Vite + TypeScript + Three.js + WebXR). Use when changing any screen, design token, 3D scene, robot integration (protocol, WebSocket, WHEP video), or tests under UI/.
---

# VEIL UI conventions

VEIL is the CN360 operator interface. Full docs are in `UI/README.md`. The protocol contract is plan.md Phase 1.

## Before you finish any change
Run these from `UI/`:
- `npm test`
- `npm run build`
- `node tests/e2e/smoke.mjs` (Chromium + axe, writes screenshots to `tests/e2e/screenshots/`)

Look at the screenshots for any visual change.

## Honesty rules (never break)
- Label every content source: `SIMULATED`, `PRERECORDED`, `LIVE` or `NO SIGNAL`.
  - Show `LIVE` only when a WebRTC video track has actually arrived.
- Robot identity comes from `HELLO`: `mock` is shown as Simulated, `hardware` as Online. Without HELLO, show "unverified".
- Protocol v1 has no actuator feedback. A test goes `acknowledged` once `ack_seq` covers it, and becomes `passed` only after the operator confirms.
- Never invent metrics: no battery %, no latency derived from 1 Hz STATUS, no sensors outside the protocol.
  - If something is unavailable, disable the control and say why in its `title` or note.

## Safety rules
- Send `DRIVE` only while armed: the desktop toggle, or the XR left-grip dead-man switch.
- Always disarm (`commands.disarm()`) on any of these: link loss, tab hidden, leaving the live screen, XR end.
- Never queue commands while disconnected.
- Preview mode never sends HEAD/DRIVE and never changes robot lighting.

## Architecture boundaries
- `services/` are pure TS, with no DOM except `video.ts` and `capabilities.ts`. They are unit-tested with fakes in `tests/fakes.ts`.
- `app/store.ts` is the single state. Update one slice with `store.patch(slice, partial)`.
  - Screens render through `frameThrottle` and `setText` (no framework).
- `app/session.ts` owns the connection singletons. Screens borrow them and never construct their own.
- `three/` modules must release GPU resources in `dispose()` (`disposeTree` + `handle.dispose()`).
  - Screens call dispose in `unmount()`.
- New 3D screens must be lazy-loaded in `main.ts`, so the landing page ships without three.js.

## Design tokens (`src/styles/tokens.css`)
- Palette:
  - Surfaces: `--veil-black` #050506.
  - Content: `--veil-pearl`, `--veil-silver`, `--veil-grey`.
  - Status: `--veil-ok`, `--veil-warn`, `--veil-err` (desaturated).
  - `--veil-sim` is always paired with a dashed border.
- No neon, no purple/blue gradients, no extra cards.
- Panels (`.panel`) are used only where they hold controls or readouts.
- Type:
  - System sans; uppercase micro labels via `.label` (0.18em tracking).
  - Telemetry in `.mono` with tabular numbers.
- Components:
  - `.btn` with `--primary`, `--lg`, `--sm` or `--quiet` modifiers.
  - `pill(text, tone)` with tone `ok|warn|err|idle|sim`.
  - `.kv` for key/value readouts.
  - `.source-badge` for content source.
- Motion: use `--veil-fast` / `--veil-med` / `--veil-slow` (zeroed under reduced motion). Animate only to show state (boot checks, connection, selection).

## Three.js / WebXR
- Units in the robot model: 1 = 10 cm, and the front faces +Z.
- `PARTS` in `three/parts.ts` lists only hardware that appears in the Docs BOM.
- When a GLTF replaces the model, keep the same PartId → anchor/mesh mapping.
- `ImmersiveView` is the single scene for desktop and XR.
  - Use the `local` reference space; the viewer is at the origin at robot-camera height.
  - Enter XR only from a user click, through `enterXR()`.
- Head convention, kept from the Unity prototype: yaw + = right, pitch + = down. Convert with `quatToHead`.
  - Clamp with `LIMITS`.
