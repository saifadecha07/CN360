# CN360 Robot Rescue VR

[![Project URL](https://img.shields.io/badge/Project_URL-tttracker.space-blue?style=for-the-badge&logo=google-chrome)](https://www.tttracker.space)
[![Project Progress](https://img.shields.io/badge/Project_Progress-In_Development-yellow?style=for-the-badge&logo=github-actions&logoColor=black)](https://www.tttracker.space)

CN360 is a compact confined-space rescue robot controlled from a PICO 4 headset. The operator opens a web app served by the robot's Raspberry Pi: head movement steers the pan/tilt camera, the controller joystick drives the robot, and buttons control the LED lighting. Video streams back to the browser over WebRTC.

```text
PICO 4 / PC browser ──WebSocket (commands)──▶ Raspberry Pi ──Serial──▶ ESP32 ──▶ motors / servos / LED
        ▲                                         │
        └──────────────WebRTC (video)─────────────┘
```

## Project Areas

- `WebApp/` — (planned) operator web app: WebXR head tracking, controller input, HUD, video view.
- `Robot/RaspberryPi/` — HTTP(S) + WebSocket server that serves `WebApp/` and forwards commands to the ESP32.
- `Robot/ESP32/` — low-level control of drive motors, pan/tilt servos, and LEDs.
- `Robot/ROS2/` — ROS 2 bridge (later phase).
- `TestTools/` — communication test utilities.
- `Docs/` — project documentation and hardware notes.
- `UnityProjects/` — legacy Unity prototype, kept for reference until the web app reaches milestone M2.

## Getting Started

1. Run the server on the Raspberry Pi (or on a PC with `--mock` to test without hardware): `python Robot/RaspberryPi/code.py`.
2. Open `http://<pi-address>:<port>` in a desktop browser to control with mouse + keyboard.
3. For VR on the PICO 4, open the HTTPS address in the PICO browser. WebXR only works over HTTPS or `localhost`, so plain HTTP cannot enter VR mode.

The server is not implemented yet; see [plan.md](plan.md) for the roadmap and [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md) for the repository layout.

## Requirements

- Python 3 on the Raspberry Pi (aiohttp, pyserial)
- MicroPython or Arduino on the ESP32
- A WebXR-capable browser (PICO Browser) for VR; any modern browser for desktop control
- ROS 2 for the optional ROS integration

## License

No license has been specified yet.
