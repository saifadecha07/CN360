---
name: cn360-robot
description: Conventions for the robot side of CN360 — the Raspberry Pi server that drives all robot hardware directly (Robot/RaspberryPi/), the ROS 2 bridge (Robot/ROS2/) and test tools (TestTools/). Use when writing or changing anything that speaks Command Protocol v1 (DRIVE/HEAD/LIGHT/STATUS/HELLO), the WebSocket link, I2C to the M5Stack RoverC or ADS1115, the on-board LED, failsafes, or robot-side tests.
---

# CN360 robot-side conventions

The operator UI (`UI/`, see the `veil-ui` skill) is already built. The robot side may not be. Build it to match what the UI already sends and expects.

**There is no ESP32.** One Raspberry Pi 4B drives everything: the M5Stack RoverC over I2C, the on-board ACT LED through sysfs, and the battery reading from an ADS1115. Do not add a microcontroller, a serial link or `Robot/ESP32/`. Bringing one back is a team decision (`Docs/system-design.md` §9).

## Step 1: scan the repo and record its structure (always do this first)
Do not trust this skill, `plan.md` or `README.md` about what exists. Check the files themselves.

- If the `repo-structure` skill is available, run it. It updates `PROJECT_STRUCTURE.md` (or creates it if missing).
- Otherwise do the same by hand: `git ls-files` + `git status --short`, compare with `PROJECT_STRUCTURE.md`, and fix it with the labels `(planned)`, `(empty)`, `(generated)`, `legacy`.
- CN360 specifics: planned files come from `Docs/system-design.md` §7 and `plan.md` §4; `UI/dist/` is `(generated)`; `UnityProjects/` is `legacy`; the file is written in English.
- Then read the robot-side files you are about to touch, and tell the user which files the task needs that are still empty or missing.

## Sources of truth (in this order)
1. `Docs/protocol.md`: the wire format. If you change the protocol, change it here; do not invent a second spec.
2. `Docs/system-design.md` (architecture, failsafes, Pi server layout, test order H-1..H-6) and `Docs/hardware.md` (BOM, wiring).
3. `WORKING_PROCESS.md` §2.3: shared constants. Never hard-code a value that differs from this table.
4. `UI/src/services/protocol.ts`: the only implemented encoder/parser. The robot must accept exactly what it produces.
5. `UI/tools/mock-robot.mjs`: reference behaviour for the server (operator lock, seq handling, failsafe, STATUS, HELLO).
6. `Docs/pi-pinout.md`: Pi pins, I2C addresses, RoverC registers and wheel order.

Open decisions — ask the user, do not pick silently (`Docs/system-design.md` §9):
- `speed_mode` meaning on the RoverC (proposal: 1 = 50 %, 2 = 100 %).
- Keep or drop `HEAD` (there are no servos; proposal: accept, ack, do nothing).
- ROS 2 topic names: `/camera_cmd,/light_cmd` vs `/head_cam,/aux_light`.

## Protocol v1 (wire format)
```
DRIVE,<seq>,<linear -1..1>,<angular -1..1>,<speed_mode 1|2>    browser → Pi
HEAD,<seq>,<yaw deg>,<pitch deg>,<roll deg>                     browser → Pi (no actuator: ack only)
LIGHT,<seq>,<level 0..100>  (0 = off)                           browser → Pi
STATUS,<seq>,<battery_v>,<ack_seq>                              Pi → browser, 1 Hz
HELLO,<seq>,<mock|hardware>,<server_version>                    Pi → browser, once on connect (v1.1, proposed)
```
- ASCII, comma-separated, `.` as decimal point. One message per WebSocket frame.
- Parsing never throws and never crashes the server. Malformed lines (wrong field count, non-numeric, unknown type, overlong line) are dropped and counted.
- `seq`: drop any command with `seq <= last accepted seq`. Reset the counter when a new operator connects (the UI restarts from 1).
- `ack_seq` in STATUS = the seq of the last command actually applied.
- STATUS must have exactly 4 fields — the UI parser rejects anything else. Adding fields is a protocol change (see below).

## Shared constants (WORKING_PROCESS.md §2.3)
| Value | Setting |
|---|---|
| Command rate from UI | 20 Hz |
| Failsafe timeout | 300 ms |
| Drive loop on the Pi | 50 Hz, writes all 4 wheel speeds every tick |
| I2C | bus 1 (GPIO2 SDA / GPIO3 SCL), RoverC `0x38`, ADS1115 `0x48` |
| LIGHT output | on-board ACT LED via `/sys/class/leds/ACT` (cannot dim: level > 0 = on) |
| Head direction | yaw + = right, pitch + = down (same as the UI and Unity prototype) |
| Web | HTTPS port 8443, WebSocket path `/ws` |
| Video | MediaMTX WHEP at `/cam/whep` (front), `/camrear/whep` (rear, proposed), same origin as the page |
| Network | SSID `CN360-Robot`, Pi at `192.168.4.1` |

## Safety rules (never break)
- **Two independent failsafes, both required:**
  - Pi: WebSocket closes, or no `DRIVE` for 300 ms → write 0 to all four RoverC wheel registers.
  - RoverC: its own firmware stops the wheels when I2C goes quiet (H-2). Our code must not depend on the Pi being alive for this.
- The drive loop that writes I2C runs in its own thread, not in the aiohttp event loop, so a stuck WebSocket cannot delay a stop.
- Boot state is safe: wheels stopped, LED off — before the first command arrives.
- Clamp every value on the robot side too. Never trust the browser's clamping.
- One operator at a time. A second WebSocket is closed with code 1013 and a reason, like the mock.
- Never queue commands for later delivery. Only the latest DRIVE/HEAD/LIGHT matters.
- Motor power stays on the RoverC's own 16340 battery, separate from the Pi's 5 V, with a common ground.
- Restore the ACT LED trigger (`mmc0`) on shutdown.

## Honesty rules (the UI depends on these)
- `--mock` mode sends `HELLO,…,mock,…`. Only a server that is actually writing I2C to the RoverC sends `hardware`.
- `battery_v` is a real ADS1115 measurement in hardware mode. If it cannot be read, say so in the log and do not invent a believable voltage; in `--mock` it may be fake because HELLO says mock.
- Do not report actuator movement the protocol cannot confirm. `ack_seq` means "processed", not "moved".

## Raspberry Pi server (`Robot/RaspberryPi/`)
- Files (`Docs/system-design.md` §7):
  - `code.py`: aiohttp — static UI, `/ws`, proxy `/cam/whep` + `/camrear/whep`, STATUS 1 Hz.
  - `protocol.py`: parse / validate / clamp / seq, no I/O.
  - `drive.py`: pure mecanum mix `linear, angular, speed_mode → wheel[4]` + the 50 Hz I2C thread + failsafe layer 1.
  - `light.py`: level → ACT LED.
  - `battery.py`: ADS1115 → volts.
  - `requirements.txt`: `aiohttp`, `smbus2`.
- Keep hardware I/O behind small modules so `--mock` and tests can swap them for fakes.
- Serves the built UI (`UI/dist/`) as static files on the same origin as `/ws` and the WHEP paths.
- Flags: `--mock` (no I2C/LED access, prints simulated robot state), `--https --cert --key`, `--verbose`. Debug logging off by default.
- Never commit `*.pem` files.

## Testing
- `protocol.py` and the mecanum mix get pytest coverage in `TestTools/test_protocol.py`: valid lines, malformed lines, out-of-range values, stale seq, and lines produced by `UI/src/services/protocol.ts`.
- Run the real UI against the Pi server in mock mode, from `UI/`:
  `VEIL_ROBOT_HOST=localhost:<port> npm run dev` (add `VEIL_ROBOT_SECURE=1` when the server uses HTTPS).
  The landing page must show *Simulated robot*, and closing the tab must log the failsafe stop within 300 ms.
- `TestTools/ws_client.py` sends commands without a browser (integration step I-1: 1,000 messages, no errors, no seq gaps).
- `TestTools/udp_receiver.py` is from the Unity era; the web stack does not use UDP. Replace it once the WebSocket tools exist.
- Hardware bring-up follows `Docs/system-design.md` §8 (H-1..H-6), then WORKING_PROCESS.md §4 (I-1 → I-8); do not skip steps.
- Before any test with motors: wheels off the ground, battery checked, failsafe tested first (close the page → wheels stop), one person ready to pull the battery.

## Changing the protocol or a shared constant
It is a team-wide change (WORKING_PROCESS.md §2.1, §2.3). In the same PR update together:
- `Docs/protocol.md`
- `UI/src/services/protocol.ts` and its tests
- `UI/tools/mock-robot.mjs`
- `Robot/RaspberryPi/protocol.py` and `TestTools/test_protocol.py`

Tell the user it needs approval from every team member before merge.

## Git
- Branch `<name>/<task>`; commit prefix by area: `pi:`, `ros2:`, `tools:`.
- A PR that adds, moves or deletes files also updates `PROJECT_STRUCTURE.md`.
