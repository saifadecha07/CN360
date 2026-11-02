# CN360 Robot Rescue VR — แผนพัฒนา (plan.md)

> อัปเดตล่าสุด: 2026-11-02 — Raspberry Pi คุมฮาร์ดแวร์ทั้งหมด ไม่มี ESP32 แล้ว (ดู [Docs/system-design.md](Docs/system-design.md))
> อ้างอิงหลัก: [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md) — ไฟล์ใหม่ทุกไฟล์ต้องอยู่ภายในโครงสร้างนี้ และต้องอัปเดต PROJECT_STRUCTURE.md ทุกครั้งที่เพิ่มไฟล์
> อ้างอิงเพิ่มเติม: [Docs/robot 1.5.txt](Docs/robot%201.5.txt), [README.md](README.md)

## 1. เป้าหมาย

หุ่นยนต์สำรวจพื้นที่แคบขนาดกะทัดรัด (ไม่มีแขนกล) ควบคุมผ่าน PICO 4 VR โดยมี 3 ระบบหลัก:

1. **Head-Tracking Camera View** — หันหัวแล้วกล้องบนหุ่นหันตาม (ฮาร์ดแวร์ปัจจุบันไม่มี servo: รอทีมตัดสินเปลี่ยนเป็น "หันหัวแล้วมุมมองในแว่นหันตาม" — `Docs/system-design.md` ข้อ 9.7)
2. **Locomotion** — ขับล้อ/สายพานด้วย joystick ของ controller
3. **Illumination** — เปิด/ปิด และปรับระดับแสง LED

หลักการ: แยก **Control Flow** (WebSocket) ออกจาก **Video Flow** (WebRTC) และแบ่งโค้ดเป็นชั้น Input → Command → Transport → Robot

## 2. การเปลี่ยนแปลงหลัก: Unity → Web App (HTTP)

ฝั่งผู้ควบคุมเปลี่ยนจากแอป Unity มาเป็น **เว็บแอปที่ Raspberry Pi เสิร์ฟผ่าน HTTP** แล้วเปิดด้วย PICO Browser (ใช้ WebXR) หรือเบราว์เซอร์บน PC (ใช้เมาส์และคีย์บอร์ด)

```text
[ PICO 4 Browser / PC Browser ]
  WebXR head pose + controller gamepad  /  mouse + WASD
        │  WebSocket (คำสั่ง 20 Hz)          ▲ WebRTC (วิดีโอ)
        ▼                                    │
[ Raspberry Pi — code.py (HTTP + WebSocket server) ] ── camera ──┘
        │  I2C (0x38)              │ sysfs        │ I2C (0x48)
        ▼                          ▼              ▼
[ M5Stack RoverC — ล้อ mecanum ×4 ]  [ LED ACT ]  [ ADS1115 — แบต ]
```

| เรื่อง | Unity (เดิม) | Web App (ใหม่) |
|---|---|---|
| ติดตั้งบน PICO | build APK แล้ว sideload | เปิด URL ได้เลย ไม่ต้องติดตั้ง |
| Head tracking | OpenXR + Tracked Pose Driver | WebXR `XRViewerPose` (หรือ DeviceOrientation สำรอง) |
| Controller | Input System | WebXR Gamepad (`xr-standard` mapping) |
| ส่งคำสั่ง | UDP | WebSocket (เบราว์เซอร์ส่ง UDP เองไม่ได้) |
| วิดีโอ | ต้องใช้ `com.unity.webrtc` | เบราว์เซอร์มี WebRTC ในตัว |
| แสดงผล 3D/VR | URP | Three.js (รองรับ WebXR) |
| ทดสอบบน PC | Unity Editor | เปิดเบราว์เซอร์ธรรมดา |

> ⚠️ **ข้อจำกัดสำคัญ:** WebXR (`immersive-vr`) และ DeviceOrientation ใช้ได้เฉพาะ **secure context** คือ HTTPS หรือ `localhost` ถ้าเปิดผ่าน `http://<ip-ของ-pi>` บน PICO จะเข้าโหมด VR และอ่านค่าหันหัวไม่ได้ จึงต้องมีทางเลือกอย่างใดอย่างหนึ่ง:
> - ใช้ HTTPS ด้วย self-signed cert หรือ `mkcert` บน Pi (ต้องกดยอมรับ cert บน PICO ครั้งแรก) ← **แนะนำ**
> - หรือใช้ `adb reverse` ให้ PICO เข้าผ่าน `localhost` (ต้องต่อสาย USB และใช้ได้แค่ตอนพัฒนา)
>
> ส่วนการควบคุมบน PC ด้วยเมาส์และคีย์บอร์ดใช้ HTTP ธรรมดาได้

## 3. สถานะปัจจุบัน (จากการสำรวจโค้ด)

| ส่วน | สถานะ | หมายเหตุ |
|---|---|---|
| `UnityProjects/CN360_Robot_Rescue_VR/` | 🗄️ หยุดพัฒนา | เก็บไว้อ้างอิงจนกว่าเว็บจะผ่าน M2 แล้วค่อยลบออก |
| ตรรกะใน Unity (`HeadTracker`, `MouseHeadSimulator`, `CommandManager`) | ♻️ นำแนวคิดมาใช้ | port เป็น JavaScript (normalize angle, clamp pitch ±60°, ส่ง 20 Hz) |
| `TestTools/udp_receiver.py` | ⚠️ ต้องเปลี่ยน | เว็บไม่ใช้ UDP แล้ว ต้องเปลี่ยนเป็นเครื่องมือทดสอบ WebSocket |
| `Robot/RaspberryPi/code.py` | ❌ ไฟล์ว่าง | จะเป็น HTTP + WebSocket server |
| `Robot/ROS2/code.py` | ❌ ไฟล์ว่าง | |
| Web App | ❌ ยังไม่เริ่ม | |
| WebRTC video | ❌ ยังไม่เริ่ม | |

### บทเรียนจากโค้ด Unity ที่ต้องไม่ทำซ้ำในเว็บ

- รูปแบบ `HEAD` packet ไม่ตรงกัน 3 แบบ (`HEAD,yaw,pitch` / `HEAD,yaw,pitch,roll` / สเปก `HEAD,seq,yaw,pitch,roll`) → ต้องมี `Docs/protocol.md` เป็นแหล่งอ้างอิงเดียว
- format ตัวเลขขึ้นกับ locale → ใน JS ใช้ `toFixed()` ซึ่งได้จุดทศนิยมเสมอ
- log ทุกเฟรมกระทบ performance บน PICO → ให้มี flag `debug` ที่ปิดไว้เป็นค่าเริ่มต้น

## 4. โครงสร้างเป้าหมาย

เพิ่มโฟลเดอร์ระดับบนสุด `WebApp/` แทน `UnityProjects/` (`+` = ไฟล์ที่จะเพิ่ม, `−` = จะลบหลังผ่าน M2)

```text
CN360/
├── Docs/
│   └── + protocol.md                  # Phase 1
├── Robot/
│   ├── RaspberryPi/
│   │   ├── code.py                    # Phase 3 — HTTP(S) + WebSocket server
│   │   ├── + protocol.py              # Phase 3 — parse/validate คำสั่ง
│   │   ├── + drive.py                 # Phase 4 — mecanum mix + I2C ไป RoverC + failsafe
│   │   ├── + light.py                 # Phase 4 — LIGHT → LED ACT
│   │   ├── + battery.py               # Phase 4 — ADS1115 → battery_v
│   │   └── + requirements.txt         # aiohttp, smbus2
│   └── ROS2/
│       └── code.py                    # Phase 4 (หลัง M3) — cn360_bridge node
├── TestTools/
│   ├── udp_receiver.py                # − แทนด้วย ws_client.py
│   ├── + ws_client.py                 # Phase 3 — ยิงคำสั่งทดสอบเข้า server
│   └── + test_protocol.py             # Phase 3 — pytest
├── + WebApp/                          # Phase 2 — static files ที่ Pi เสิร์ฟ
│   ├── + index.html
│   ├── + style.css
│   └── + js/
│       ├── + main.js                  # เริ่มระบบ, loop 20 Hz
│       ├── + input/
│       │   ├── + xrHead.js            # WebXR viewer pose → yaw/pitch/roll
│       │   ├── + xrGamepad.js         # joystick / trigger / ปุ่ม A-B
│       │   ├── + mouseHead.js         # จำลองการหันหัวด้วยเมาส์
│       │   └── + keyboard.js          # WASD + hotkey ไฟ
│       ├── + control/
│       │   ├── + commandManager.js    # รวมคำสั่ง, clamp, deadzone, smoothing, seq
│       │   ├── + locomotion.js
│       │   └── + lighting.js
│       ├── + network/
│       │   └── + wsTransport.js       # WebSocket + reconnect
│       ├── + video/
│       │   └── + webrtcView.js        # รับวิดีโอ → <video> / Three.js texture
│       └── + ui/
│           └── + hud.js
└── UnityProjects/                     # − ลบหลังผ่าน M2
```

> ใช้ JavaScript แบบ ES modules ล้วน ไม่ต้องมี build step (โหลด Three.js จาก CDN หรือเก็บไฟล์ไว้ใน `WebApp/js/vendor/`) ทำให้ Pi เสิร์ฟไฟล์ได้ตรง ๆ
> ต้องอัปเดต PROJECT_STRUCTURE.md และ README.md ให้ตรงกับโครงสร้างนี้ใน Phase 0

## 5. แผนงานแบ่งตามเฟส

### Phase 0 — เตรียม repo

- [ ] สร้างโฟลเดอร์ `WebApp/` ตามโครงสร้างข้างบน
- [x] อัปเดต PROJECT_STRUCTURE.md + README.md (ส่วน Requirements: เปลี่ยน "Unity with XR support" เป็น "เบราว์เซอร์ที่รองรับ WebXR (PICO Browser)")
- [ ] เพิ่ม `.gitignore` (`__pycache__/`, `.venv/`, `*.pem`, `node_modules/`)
- [ ] ตัดสินใจกับทีมว่าจะเก็บ `UnityProjects/` ไว้ใน repo นานแค่ไหน (แนะนำ: ลบหลังผ่าน M2 เพราะประวัติยังอยู่ใน git)
- [ ] ระบุ License ใน README

### Phase 1 — สรุป Command Protocol v1

ใช้ **Modular Packets** แบบ text (รูปแบบที่ 1 ใน Docs) เพราะอ่านง่าย ทดสอบง่าย และ Pi parse ได้ตรง ๆ (Browser → WebSocket → Pi) — สเปกฉบับใช้งานอยู่ที่ `Docs/protocol.md`

```
DRIVE,<seq>,<linear -1..1>,<angular -1..1>,<speed_mode 1|2>
HEAD,<seq>,<yaw deg>,<pitch deg>,<roll deg>
LIGHT,<seq>,<level 0..100>                   (0 = ปิด)
STATUS,<seq>,<battery_v>,<ack_seq>          # Pi → Browser
```

- [ ] เขียน `Docs/protocol.md`: หน่วย, ช่วงค่า, ทศนิยม 1–2 ตำแหน่ง, ASCII, 1 ข้อความต่อ 1 WebSocket frame
- [ ] กำหนดกฎ `seq`: เพิ่มทีละ 1 ต่อข้อความ ฝั่งรับทิ้งข้อความที่ seq เก่ากว่า
- [ ] กำหนด **Failsafe** 2 ชั้น
  - Pi: WebSocket หลุด หรือไม่ได้รับ `DRIVE` เกิน 300 ms → เขียน 0 ลงทุกล้อของ RoverC
  - RoverC: ไม่ได้รับ I2C → หยุดล้อเอง (firmware ในตัว, ทดสอบแล้ว H-2)
- [ ] กำหนดช่วงมุม `HEAD` (yaw ±90°, pitch −45°..+45°) และ clamp ทั้งฝั่งเว็บและฝั่งหุ่น (ตอนนี้ไม่มี servo รับ แต่ค่ายังอยู่ใน protocol)
- [ ] จำกัดผู้ควบคุมให้มีได้ทีละ 1 WebSocket เพื่อกันการสั่งพร้อมกันจากหลายเครื่อง
- [ ] (ข้อเสนอ v1.1, รอทุกคน approve) เพิ่ม `strafe` ใน `DRIVE` เพราะล้อ mecanum ของ RoverC ไปด้านข้างได้: `DRIVE,<seq>,<linear>,<angular>,<speed_mode>,<strafe -1..1>` — ต่อท้าย field เดิม ฝั่งที่ยังไม่รองรับถือว่า `strafe = 0`

### Phase 2 — Web App (ฝั่งผู้ควบคุม)

**Input**
- [ ] `mouseHead.js`: กดเมาส์ซ้ายค้างแล้วลาก, ปรับ sensitivity ได้, clamp pitch ±60° (port จาก `MouseHeadSimulator.cs`)
- [ ] `keyboard.js`: WASD = ขับ, Shift = High Torque, `L` = เปิด/ปิดไฟ, `[` `]` = ปรับระดับแสง
- [ ] `xrHead.js`: เข้า `immersive-vr` แล้วอ่าน `XRViewerPose` quaternion → yaw/pitch/roll (port `NormalizeAngle` จาก `HeadTracker.cs`) พร้อมปุ่ม "recenter" ตั้งทิศปัจจุบันเป็น 0°
- [ ] `xrGamepad.js`: ใช้ thumbstick ซ้ายขับ (`axes[2..3]`), trigger ขวาปรับไฟ, ปุ่ม A/B สลับโหมด
- [ ] สลับ input source อัตโนมัติ: ถ้าอยู่ใน XR session ใช้ XR ถ้าไม่ใช่ ใช้เมาส์และคีย์บอร์ด

**Control**
- [ ] `locomotion.js`: deadzone ~0.15, expo curve, speed mode
- [ ] `lighting.js`: สถานะเปิด/ปิด + ระดับแสง
- [ ] `commandManager.js`: loop 20 Hz ด้วย `setInterval` (ใน XR ใช้ `XRSession.requestAnimationFrame` อ่านค่าแล้วส่งตามรอบ 20 Hz), smoothing มุมหัว, ใส่ seq, ส่ง `DRIVE` + `HEAD` ทุกรอบ, ส่ง `LIGHT` เมื่อค่าเปลี่ยน + ทุก 1 วินาที

**Network & UI**
- [ ] `wsTransport.js`: เชื่อมต่อ `ws(s)://<host>/ws` จาก host เดียวกับหน้าเว็บ, reconnect อัตโนมัติ (backoff), ไม่ส่งคำสั่งค้างคิวตอนหลุด
- [ ] `hud.js`: สถานะการเชื่อมต่อ, ping, ค่า drive/head, ระดับไฟ, แบตเตอรี่ (บน PC แสดงเป็น HTML overlay ใน VR แสดงเป็นแผ่นข้อความใน Three.js)
- [ ] หน้า PC แสดงวิวจำลองแบบ 2D (ทิศหุ่น, มุมกล้อง, ไฟ) แทนโฟลเดอร์ `Simulation/` ของ Unity

### Phase 3 — Raspberry Pi Server & Test Tools

- [ ] `Robot/RaspberryPi/code.py` (aiohttp)
  - เสิร์ฟ static files จาก `WebApp/`
  - endpoint `/ws`: รับคำสั่ง → `protocol.py` validate/clamp → เก็บเป็นคำสั่งล่าสุดให้ `drive.py` / `light.py`
  - ส่ง `STATUS` กลับทุก 1 วินาที
  - failsafe timeout ตาม Phase 1
  - flag `--mock`: ไม่แตะ I2C/LED แค่พิมพ์สถานะหุ่นจำลอง (ใช้แทน `udp_receiver.py`) เพื่อพัฒนาเว็บบน PC ได้โดยไม่ต้องมีฮาร์ดแวร์
  - flag `--https --cert --key` สำหรับ WebXR บน PICO
- [ ] `protocol.py` + `TestTools/test_protocol.py` (pytest)
- [ ] `TestTools/ws_client.py`: ยิงคำสั่งทดสอบและวัด round-trip โดยไม่ต้องเปิดเบราว์เซอร์
- [ ] systemd service ให้ server รันตอนบูต
- [ ] ลบ `TestTools/udp_receiver.py` และอัปเดต PROJECT_STRUCTURE.md

### Phase 4 — ควบคุมฮาร์ดแวร์บน Pi

**Raspberry Pi (ไม่มี ESP32)** — `Robot/RaspberryPi/` ดูขาและ register ใน `Docs/pi-pinout.md`, ลำดับทดสอบ H-1..H-6 ใน `Docs/system-design.md` ข้อ 8
- [ ] `drive.py`: ขับล้อผ่าน M5Stack RoverC (I2C `0x38`, mecanum 4 ล้อ) ด้วย `smbus2` ใน thread แยก 50 Hz
- [ ] mecanum mixing: `linear`, `angular` (+ `strafe` ถ้า v1.1 ผ่าน) → ความเร็ว 4 ล้อ + `speed_mode`
- [ ] failsafe ชั้น 1: WebSocket ปิด หรือไม่มี `DRIVE` 300 ms → เขียน 0 ทุกล้อ และวัดเวลาที่ RoverC หยุดเองเมื่อ I2C เงียบ (H-2)
- [ ] `light.py`: `LIGHT` level > 0 → LED ACT ติด, 0 → ดับ (หรี่ไม่ได้) และคืน trigger เดิมตอนปิด
- [ ] `battery.py`: อ่านแบตจาก ADS1115 (`0x48`) → `battery_v` ใน `STATUS`
- [ ] `HEAD`: ไม่มี servo แล้ว (กล้องติดตาย) Pi รับแล้วนับ `ack_seq` เฉย ๆ จนกว่าทีมจะตัดสิน (`Docs/system-design.md` ข้อ 9)

**ROS 2 (เฟสหลัง)** — `Robot/ROS2/`
- [ ] node `cn360_bridge`: รับคำสั่งจาก WebSocket server → topics `/cmd_vel` (Twist), `/camera_cmd`, `/light_cmd` (หรือใช้ rosbridge_suite ให้เว็บคุยกับ ROS ผ่าน roslibjs โดยตรง)
- [ ] หมายเหตุ: Docs ใช้ชื่อ topic สองชุด (`/camera_cmd,/light_cmd` vs `/head_cam,/aux_light`) ต้องเลือกใช้ชุดเดียว

### Phase 5 — Video Streaming (WebRTC)

- [ ] ติดตั้ง MediaMTX บน Pi + Pi Camera Module 3 (H.264 hardware encode, เปิดรับ WebRTC/WHEP ให้เบราว์เซอร์ดึงภาพได้)
- [ ] `webrtcView.js`: รับ stream ผ่าน WHEP → `<video>` บน PC / `THREE.VideoTexture` บนแผ่นภาพหน้าผู้ใช้ใน VR
- [ ] ตั้ง reverse proxy หรือ CORS ให้หน้าเว็บกับ MediaMTX ใช้ origin และ cert เดียวกัน
- [ ] วัด glass-to-glass latency (เป้าหมาย < 150 ms) และปรับ resolution/bitrate
- [x] เส้นทางระยะไกล: Pi → MediaMTX บน VPS → WebRTC → VEIL บน Vercel (มี sign-in + token) — โค้ดและการทดสอบบนเครื่องเดียวเสร็จแล้ว ยังต้องทดสอบกับ Pi/VPS จริง ดู `Docs/streaming/`
- [ ] (ตัวเลือก) Night/Thermal mode ด้วย IR camera หรือ shader filter ใน Three.js

### Phase 6 — ฮาร์ดแวร์ & Integration

- [ ] สั่งซื้ออุปกรณ์ตาม BOM ใน Docs (งบ 5,600–9,250 บาท)
- [ ] ออกแบบแผ่นยึดบน RoverC (3D print / อะคริลิค) สำหรับ Pi, แบต 2S, ADS1115 และกล้องหน้า-หลัง
- [ ] ระบบไฟ: 2S LiPo → buck 5V 3A (Pi) + ตัวแบ่งแรงดันเข้า ADS1115 — มอเตอร์ล้อใช้แบต 16340 ของ RoverC แยกอยู่แล้ว ต่อแค่ GND ร่วม
- [ ] ตั้ง Pi เป็น Wi-Fi Access Point (hostapd) เพื่อให้ PICO ต่อตรงได้ในพื้นที่ที่ไม่มีเครือข่าย
- [ ] ทดสอบทีละชั้น: เว็บ → server `--mock` → server + I2C RoverC (ยกล้อลอย) → LED ACT + ADS1115
- [ ] ทดสอบ end-to-end ด้วย PICO 4 จริงในพื้นที่จำลอง (ท่อ/ซากอาคาร)
- [ ] วัดผล: latency คำสั่ง, latency ภาพ, ระยะ Wi-Fi, อายุแบต

## 6. ลำดับความสำคัญ (Milestones)

| Milestone | เนื้อหา | เกณฑ์ผ่าน |
|---|---|---|
| **M1** | Phase 0–1 | โครงสร้าง `WebApp/` พร้อม, `Docs/protocol.md` ตกลงร่วมกันในทีม |
| **M2** | Phase 2–3 (mock) | เปิดเว็บบน PC ใช้ WASD + เมาส์ แล้ว server `--mock` แสดง DRIVE/HEAD/LIGHT ถูกต้อง, ปิดแท็บแล้ว failsafe ทำงาน |
| **M2.5** | WebXR บน PICO | เปิดเว็บผ่าน HTTPS บน PICO เข้า VR ได้ หันหัวแล้วค่า HEAD เปลี่ยนตาม |
| **M3** | Phase 4 (ไม่มี ROS) | joystick ขับ RoverC ได้, ปิดเว็บแล้วล้อหยุด, `LIGHT` เปิด/ปิด LED ACT ได้, `STATUS` มีแบตจริงจาก ADS1115 |
| **M4** | Phase 5 | เห็นภาพจากกล้องหุ่นใน PICO แบบ real-time |
| **M5** | Phase 6 + ROS 2 | ทดสอบภาคสนามครบระบบ |

## 7. ความเสี่ยงและข้อควรระวัง

- **HTTPS บังคับสำหรับ WebXR** — ถ้าใช้ HTTP ธรรมดา PICO จะเข้า VR ไม่ได้ ควรทดสอบ M2.5 ให้เร็วที่สุด
- **ความสามารถของ PICO Browser** — ต้องตรวจว่ารองรับ WebXR + WebRTC + Gamepad บนเฟิร์มแวร์ที่ใช้อยู่จริง ทำ spike สั้น ๆ ก่อนเริ่ม Phase 2
- **WebSocket ทำงานบน TCP** — ถ้าแพ็กเก็ตหายบน Wi-Fi จะเกิดอาการหน่วงสะสม (head-of-line blocking) ให้ server ใช้เฉพาะค่าล่าสุด ถ้ายังไม่พอค่อยเปลี่ยนไปใช้ WebRTC DataChannel แบบ unreliable
- **Latency ของภาพ** เป็นตัวชี้ขาดประสบการณ์ VR — ทำ prototype วิดีโอให้เร็ว
- **Wi-Fi ในพื้นที่อับสัญญาณ** (ซากอาคาร/ท่อ) — ต้องมี failsafe และพิจารณา external antenna
- **failsafe ชั้น 2 เป็น firmware ของ RoverC ที่เราแก้ไม่ได้** — ต้องวัดเวลาหยุดจริง (H-2) ถ้าช้าเกินไปทีมต้องทบทวน
- **I2C 50 Hz คู่กับสตรีมวิดีโอ 2 กล้องบน Pi ตัวเดียว** — ทดสอบ H-6 ก่อนประกอบจริง
- **ไฟตก** เวลามอเตอร์ออกตัวทำให้ Pi รีบูต — มอเตอร์ใช้แบตของ RoverC แยกจาก Pi อยู่แล้ว ต่อแค่ GND ร่วม

## 8. สิ่งที่ยังไม่ได้ตรวจ

- `Docs/AUG.pdf` และ `Docs/อุปกรณ์เพิ่มเติม.pdf` ยังไม่ได้อ่าน (เครื่องไม่มีเครื่องมืออ่าน PDF) — ควรนำข้อกำหนดเพิ่มเติมจากไฟล์เหล่านี้มาปรับแผน
