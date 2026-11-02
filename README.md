# CN360 Robot Rescue VR

[![Project URL](https://img.shields.io/badge/Project_URL-tttracker.space-blue?style=for-the-badge&logo=google-chrome)](https://www.tttracker.space)
[![VEIL Live Demo](https://img.shields.io/badge/VEIL_Web-veil--rho--six.vercel.app-black?style=for-the-badge&logo=vercel)](https://veil-rho-six.vercel.app)
[![Project Progress](https://img.shields.io/badge/Project_Progress-In_Development-yellow?style=for-the-badge&logo=github-actions&logoColor=black)](https://www.tttracker.space)
[![Platform](https://img.shields.io/badge/Platform-PICO_4_VR-purple?style=for-the-badge&logo=oculus&logoColor=white)]()
[![Stack](https://img.shields.io/badge/Stack-Python_•_Raspberry_Pi_•_WebRTC-orange?style=for-the-badge&logo=raspberry-pi&logoColor=white)]()
[![License](https://img.shields.io/badge/License-Unspecified-lightgrey?style=for-the-badge)]()

> **A compact confined-space rescue robot controlled from a PICO 4 headset via WebXR.**  
> Head movement steers the pan/tilt camera, controller joystick drives the robot, buttons control LED lighting. Video streams back over WebRTC.

🌐 **VEIL operator web app (live demo):** https://veil-rho-six.vercel.app — runs without hardware (simulated 360° preview); connect a robot with `?robot=<pi-ip>:8443`. Source: [`UI/`](UI/README.md)

---

## 🎯 Key Features

| Feature | Description |
|---------|-------------|
| 🎮 **Immersive VR Control** | WebXR head tracking + controller input on PICO 4 |
| 📹 **Real-time Video** | WebRTC streaming from robot camera to headset |
| 🤖 **Pan/Tilt Camera** | Head movement maps to servo-controlled camera gimbal |
| 💡 **LED Lighting** | Controller buttons toggle robot LEDs for dark environments |
| 🕸️ **Web-based** | No app install — runs in PICO Browser over HTTPS |
| ⚡ **Low Latency** | WebSocket commands + WebRTC video on local network |

---

## 🏗️ System Architecture

```mermaid
graph LR
    A[🥽 PICO 4 / PC Browser] -->|WebSocket Commands| B[🍓 Raspberry Pi]
    B -->|I2C 0x38| D[🏎️ RoverC mecanum wheels]
    B -->|sysfs| F[💡 On-board ACT LED]
    B -->|I2C 0x48| G[🔋 ADS1115 battery ADC]
    B -.->|WebRTC Video| A
```

One Raspberry Pi drives all robot hardware directly; there is no separate microcontroller. Details: [Docs/system-design.md](Docs/system-design.md).

**Data Flow:**
```
PICO 4 / PC browser ──WebSocket (commands)──▶ Raspberry Pi ──I2C──▶ RoverC wheels / ADS1115, sysfs ──▶ ACT LED
        ▲                                         │
        └──────────────WebRTC (video)─────────────┘
```

---

## 📁 Project Structure

```
CN360/
├── UI/                  # 🌐 VEIL operator web app (WebXR, Three.js, HUD) — https://veil-rho-six.vercel.app
├── Robot/
│   ├── RaspberryPi/     # 🍓 HTTP + WebSocket server, RoverC drive (I2C), LED, battery
│   └── ROS2/            # 🤖 ROS 2 bridge (future phase)
├── TestTools/           # 🧪 Communication test utilities
├── Docs/                # 📚 Documentation & hardware notes
└── UnityProjects/       # 📦 Legacy Unity prototype (reference only)
```

| Directory | Status | Description |
|-----------|--------|-------------|
| `UI/` | 🟢 In Progress | VEIL web app: landing, command center, 3D setup lobby, 360°/WebXR live view — [live demo](https://veil-rho-six.vercel.app) |
| `Robot/RaspberryPi/` | 🟢 In Progress | aiohttp + WebSocket server, serves the UI, drives RoverC over I2C, ACT LED, ADS1115 battery |
| `Robot/ROS2/` | ⚪ Later | ROS 2 integration bridge |
| `TestTools/` | 🟢 Active | WebSocket / protocol test utilities |
| `Docs/` | 🟢 Active | Hardware specs, wiring diagrams, API docs |
| `UnityProjects/` | 🔴 Archived | Legacy prototype (kept until WebApp reaches M2) |

---

## 🚀 Getting Started

### Prerequisites
- **Raspberry Pi** — Python 3.9+ (`aiohttp`, `smbus2`), I2C enabled
- **PICO 4** — PICO Browser (WebXR requires HTTPS or `localhost`)
- **Network** — Pi and headset on same LAN

### Quick Start (Mock Mode - No Hardware)
```bash
# On PC / Pi
cd Robot/RaspberryPi
python code.py --mock

# Open in browser
# Desktop: http://localhost:8080
# PICO 4:  https://<pi-ip>:8080 (requires TLS cert for WebXR)
```

### Hardware Mode
```bash
# 1. Check the I2C devices (RoverC 0x38, ADS1115 0x48)
i2cdetect -y 1

# 2. Run Pi server
cd Robot/RaspberryPi
python code.py

# 3. Connect from PICO 4 browser to https://<pi-ip>:8443
```

> ⚠️ **WebXR requires HTTPS.** Generate self-signed certs for LAN testing:
> ```bash
> openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem -days 365
> ```

---

## 🗺️ Roadmap

| Milestone | Target | Status |
|-----------|--------|--------|
| **M1** — Command protocol + mock WebApp | Q1 2025 | 🟢 Done |
| **M2** — WebRTC video + WebXR head tracking on PICO 4 | Q2 2025 | 🟡 In Progress |
| **M3** — Full teleop: RoverC drive + LED + battery + HUD | Q3 2025 | ⚪ Planned |
| **M4** — ROS 2 bridge + autonomous navigation aids | Q4 2025 | ⚪ Planned |
| **M5** — Field testing & hardening | 2026 | ⚪ Planned |

See [plan.md](plan.md) for detailed task breakdown.

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| **VR Interface** | WebXR API, Three.js, TypeScript |
| **Signaling** | WebSocket (aiohttp) |
| **Video Streaming** | WebRTC (aiortc) |
| **Edge Compute** | Raspberry Pi 4/5, Python 3.11+ |
| **Actuators** | M5Stack RoverC (4 mecanum wheels), Raspberry Pi on-board ACT LED |
| **Comms** | I2C Pi ↔ RoverC / ADS1115, WiFi AP/STA |

---

## 📖 Documentation

- [Project Plan](plan.md) — Milestones, tasks, timeline
- [Repository Structure](PROJECT_STRUCTURE.md) — Detailed folder layout
- [Hardware Notes](Docs/hardware.md) — Wiring, pinouts, BOM
- [API Reference](Docs/api.md) — WebSocket messages, REST endpoints

---

## 🤝 Contributing

1. Fork the repo
2. Create a feature branch: `git checkout -b feat/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push: `git push origin feat/amazing-feature`
5. Open a Pull Request

---

## 📄 License

No license specified yet. All rights reserved.

---

## 🔗 Links

- **Project Page:** [tttracker.space](https://www.tttracker.space)
- **Issues:** [GitHub Issues](https://github.com/saifadecha07/CN360/issues)
- **Discussions:** [GitHub Discussions](https://github.com/saifadecha07/CN360/discussions)

---

<p align="center">
  Made with ❤️ for rescue robotics
</p>