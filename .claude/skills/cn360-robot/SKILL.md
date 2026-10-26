---
name: cn360-robot
description: Conventions for the robot side of CN360 — the Raspberry Pi server (Robot/RaspberryPi/), ESP32 firmware (Robot/ESP32/), ROS 2 bridge (Robot/ROS2/) and test tools (TestTools/). Use when writing or changing anything that speaks Command Protocol v1 (DRIVE/HEAD/LIGHT/STATUS/HELLO), the WebSocket or serial link, motor/servo/LED control, failsafes, or robot-side tests.
---

# CN360 robot-side conventions

The operator UI (`UI/`, see the `veil-ui` skill) is already built. The robot side may not be. Build it to match what the UI already sends and expects.

## Step 1: scan the repo and record its structure (always do this first)
Do not trust this skill, `plan.md` or `README.md` about what exists. Check the files themselves.

- If the `repo-structure` skill is available, run it. It updates `PROJECT_STRUCTURE.md` (or creates it if missing).
- Otherwise do the same by hand: `git ls-files` + `git status --short`, compare with `PROJECT_STRUCTURE.md`, and fix it with the labels `(planned)`, `(empty)`, `(generated)`, `legacy`.
- CN360 specifics: planned files come from `plan.md` §4; `UI/dist/` is `(generated)`; `UnityProjects/` is `legacy`; the file is written in English.
- Then read the robot-side files you are about to touch, and tell the user which files the task needs that are still empty or missing.

## Sources of truth (in this order)
1. `plan.md` Phase 1 (protocol) and Phases 3–4 (Pi server, ESP32).
2. `WORKING_PROCESS.md` §2.3: shared constants. Never hard-code a value that differs from this table.
3. `UI/src/services/protocol.ts`: the only implemented encoder/parser. The robot must accept exactly what it produces.
4. `UI/tools/mock-robot.mjs`: reference behaviour for the server (operator lock, seq handling, failsafe, STATUS, HELLO).

`Docs/protocol.md` does not exist yet. If you change the protocol, write it there; do not invent a second spec.

Open decisions — ask the user, do not pick silently:
- ESP32 framework: MicroPython (matches `code.py`) or Arduino/PlatformIO (required for micro-ROS later).
- ROS 2 topic names: `/camera_cmd,/light_cmd` vs `/head_cam,/aux_light`.

## Protocol v1 (wire format)
```
DRIVE,<seq>,<linear -1..1>,<angular -1..1>,<speed_mode 1|2>    browser → Pi → ESP32
HEAD,<seq>,<yaw deg>,<pitch deg>,<roll deg>                     browser → Pi → ESP32
LIGHT,<seq>,<brightness 0..100>,<vision_mode 0|1>               browser → Pi → ESP32
STATUS,<seq>,<battery_v>,<ack_seq>                              Pi → browser, 1 Hz
HELLO,<seq>,<mock|hardware>,<server_version>                    Pi → browser, once on connect (v1.1, proposed)
```
- ASCII, comma-separated, `.` as decimal point. One message per WebSocket frame; on serial, one message per line ending in `\n`.
- The Pi forwards the same line to the ESP32 unchanged in format (re-encode after clamping is fine).
- Parsing never throws and never resets the board. Malformed lines (wrong field count, non-numeric, unknown type, overlong line) are dropped and counted.
- `seq`: drop any command with `seq <= last accepted seq`. Reset the counter when a new operator connects (the UI restarts from 1).
- `ack_seq` in STATUS = the seq of the last command actually applied.
- STATUS must have exactly 4 fields — the UI parser rejects anything else. Adding fields is a protocol change (see below).

## Shared constants (WORKING_PROCESS.md §2.3)
| Value | Setting |
|---|---|
| Command rate from UI | 20 Hz |
| Failsafe timeout | 300 ms |
| Servo range | yaw ±90°, pitch −45°..+45°, roll ±45° |
| Head direction | yaw + = right, pitch + = down (same as the UI and Unity prototype) |
| Serial | 115200 baud, Pi GPIO14/15 ↔ ESP32 UART2, common GND |
| Web | HTTPS port 8443, WebSocket path `/ws` |
| Video | MediaMTX WHEP at `/cam/whep`, same origin as the page |
| Network | SSID `CN360-Robot`, Pi at `192.168.4.1` |

## Safety rules (never break)
- **Two independent failsafes, both required:**
  - Pi: WebSocket closes, or no `DRIVE` for 300 ms → send `DRIVE,<seq>,0,0,1` to the ESP32.
  - ESP32: no valid line on serial for 300 ms → stop motors itself. It must not rely on the Pi.
- Boot state is safe: motors stopped, servos centred, LEDs off — before the first command arrives.
- Clamp every value on the robot side too. Never trust the browser's clamping.
- Rate-limit servo motion so pan/tilt never jerks.
- One operator at a time. A second WebSocket is closed with code 1013 and a reason, like the mock.
- On link loss keep HEAD where it is; only DRIVE is forced to zero.
- Never queue commands for later delivery. Only the latest DRIVE/HEAD/LIGHT matters.
- Motor power on its own rail, separate from the Pi's 5 V, with a common ground (brown-out reboots the Pi otherwise).

## Honesty rules (the UI depends on these)
- `--mock` mode sends `HELLO,…,mock,…`. Only a server that is actually driving the ESP32 sends `hardware`.
- `battery_v` is a real measurement in hardware mode. If there is no ADC yet, say so in the log and do not invent a believable voltage; in `--mock` it may be fake because HELLO says mock.
- Do not report actuator movement the protocol cannot confirm. `ack_seq` means "processed", not "moved".

## Raspberry Pi server (`Robot/RaspberryPi/`)
- Files: `code.py` (aiohttp server), `protocol.py` (parse/validate/clamp, no I/O), `requirements.txt` (`aiohttp`, `pyserial`).
- Serves the built UI (`UI/dist/`) as static files on the same origin as `/ws` and `/cam/whep`. `plan.md` still says `WebApp/`; the UI moved to `UI/`.
- Flags: `--mock` (no serial, prints simulated robot state), `--https --cert --key`, `--verbose`. Debug logging off by default.
- Proxy `/cam/whep` to MediaMTX so video and page share one origin and one certificate.
- Never commit `*.pem` files.

## ESP32 (`Robot/ESP32/`)
- Non-blocking line reader with a max line length; discard and count on overflow.
- Differential drive: `linear`, `angular` → left/right wheel speed, scaled by `speed_mode` (1 normal, 2 high torque). TB6612FNG, PWM + DIR.
- Pan/tilt: SG90 ×2, degrees → PWM, clamp, rate-limit.
- LED: PWM brightness 0–100 % through a MOSFET; `vision_mode` 1 switches to IR LED.
- Watchdog runs in the main loop or a timer, independent of serial parsing.
- Record pin assignments in `Docs/esp32-pinout.md`.

## Testing
- `protocol.py` gets pytest coverage in `TestTools/test_protocol.py`: valid lines, malformed lines, out-of-range values, stale seq, and lines produced by `UI/src/services/protocol.ts`.
- Run the real UI against the Pi server in mock mode, from `UI/`:
  `VEIL_ROBOT_HOST=localhost:<port> npm run dev` (add `VEIL_ROBOT_SECURE=1` when the server uses HTTPS).
  The landing page must show *Simulated robot*, and closing the tab must log the failsafe stop within 300 ms.
- `TestTools/ws_client.py` sends commands without a browser (integration step I-1: 1,000 messages, no errors, no seq gaps).
- `TestTools/udp_receiver.py` is from the Unity era; the web stack does not use UDP. Replace it once the WebSocket tools exist.
- Follow the integration order in WORKING_PROCESS.md §4 (I-1 → I-8); do not skip steps.
- Before any test with motors: wheels off the ground, battery checked, failsafe tested first (close the page → wheels stop), one person ready to pull the battery.

## Changing the protocol or a shared constant
It is a team-wide change (WORKING_PROCESS.md §2.1, §2.3). In the same PR update together:
- `Docs/protocol.md`
- `UI/src/services/protocol.ts` and its tests
- `UI/tools/mock-robot.mjs`
- `Robot/RaspberryPi/protocol.py` and `TestTools/test_protocol.py`
- the ESP32 parser

Tell the user it needs approval from every team member before merge.

## Git
- Branch `<name>/<task>`; commit prefix by area: `pi:`, `esp32:`, `ros2:`, `tools:`.
- A PR that adds, moves or deletes files also updates `PROJECT_STRUCTURE.md`.
