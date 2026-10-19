# CN360 Project Structure

The operator interface is a web app served by the Raspberry Pi and opened in the PICO 4 browser (WebXR) or a desktop browser. See [plan.md](plan.md) for the roadmap.

Items marked `(planned)` do not exist yet; `(empty)` exist but have no content.

```text
CN360/
├── README.md
├── PROJECT_STRUCTURE.md
├── plan.md                                roadmap by phase
├── WORKING_PROCESS.md                     team roles and per-person process
├── .claude/skills/
│   ├── veil-ui/SKILL.md                   Claude Code conventions for UI/
│   └── cn360-robot/SKILL.md               Claude Code conventions for Robot/ and TestTools/
├── Docs/
│   ├── AUG.pdf
│   ├── อุปกรณ์เพิ่มเติม.pdf
│   ├── hardware.md                        BOM (RoverC base), power and wiring overview
│   ├── system-design.md                   proposed system design: RoverC base + front/rear cameras (draft)
│   ├── platform-prompt.md                 prompt for building the team progress-tracking platform
│   └── protocol.md                        (planned) command protocol spec
├── docs/                                  lowercase duplicate of Docs/ — merge into Docs/
│   └── robot 1.5.txt                      architecture summary and progress notes (Unity era)
├── Robot/
│   ├── ESP32/
│   │   └── code.py                        (empty) motors, pan/tilt servos, LED, failsafe
│   ├── RaspberryPi/
│   │   ├── code.py                        (empty) HTTP(S) + WebSocket server → Serial to ESP32
│   │   ├── protocol.py                    (planned) command parsing and validation
│   │   └── requirements.txt               (planned) aiohttp, pyserial
│   └── ROS2/
│       └── code.py                        (empty) ROS 2 bridge (later phase)
├── TestTools/
│   ├── udp_receiver.py                    legacy UDP receiver for the Unity prototype
│   ├── ws_client.py                       (planned) WebSocket test client
│   └── test_protocol.py                   (planned) pytest for protocol.py
├── UI/                                    VEIL operator interface (Vite + TypeScript + Three.js) — see UI/README.md
│   ├── index.html
│   ├── vercel.json                        static deploy of the live demo
│   ├── src/
│   │   ├── main.ts                        boot, router, lazy-loaded 3D screens
│   │   ├── app/                           store, router, session (link/video/loop), status labels
│   │   ├── services/                      protocol v1, WebSocket transport, WHEP video, 20 Hz command
│   │   │                                  loop, keyboard, locomotion, capabilities, readiness, hw tests
│   │   ├── three/                         renderer, robot model, setup-lobby stage, crawlspace, XR view
│   │   ├── screens/                       landing, command center, setup lobby, 360°/live immersive
│   │   ├── ui/                            DOM helpers
│   │   └── styles/                        design tokens + app styles
│   ├── tools/mock-robot.mjs               dev-only simulated robot (protocol v1, labelled SIMULATED)
│   ├── tests/                             vitest unit/integration + tests/e2e/smoke.mjs (Playwright + axe)
│   └── dist/                              (generated) static build the Pi serves
├── WebApp/                                (planned — superseded by UI/) static files served by the Pi
│   ├── index.html
│   ├── style.css
│   └── js/
│       ├── main.js                        startup, 20 Hz command loop
│       ├── input/
│       │   ├── xrHead.js                  WebXR head pose → yaw/pitch/roll
│       │   ├── xrGamepad.js               PICO controller joystick and buttons
│       │   ├── mouseHead.js               mouse head-tracking simulator
│       │   └── keyboard.js                WASD drive + light hotkeys
│       ├── control/
│       │   ├── commandManager.js          clamp, deadzone, smoothing, sequence
│       │   ├── locomotion.js
│       │   └── lighting.js
│       ├── network/
│       │   └── wsTransport.js             WebSocket with auto-reconnect
│       ├── video/
│       │   └── webrtcView.js              WebRTC video view
│       └── ui/
│           └── hud.js
└── UnityProjects/                         legacy — Unity prototype, to be removed after milestone M2
    └── CN360_Robot_Rescue_VR/
        ├── Assets/
        │   ├── Scenes/SampleScene.unity
        │   └── Scripts/
        │       ├── UdpHeadSender.cs
        │       ├── Control/CommandManager.cs
        │       ├── Input/HeadTracker.cs
        │       ├── Input/MouseHeadSimulator.cs
        │       └── Network/UdpTransport.cs
        ├── Packages/
        └── ProjectSettings/
```

> Unity `.meta` files, `Logs/`, `UserSettings/`, `.vs/`, generated `.csproj`/`.sln` files, `UpgradeLog.htm` and `UI/node_modules/` are omitted from this overview. Unity `Logs/`, `.vs/` and `UserSettings/` are currently committed and should be removed from git.
