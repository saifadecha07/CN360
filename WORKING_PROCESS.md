# CN360 — Working Process (การแบ่งงานและขั้นตอนการทำงาน)

> อัปเดตล่าสุด: 2026-10-04
> ใช้คู่กับ [plan.md](plan.md) (แผนงานตามเฟส) และ [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md) (ตำแหน่งไฟล์)

## 1. ทีมและความรับผิดชอบ

| คน | บทบาท | เป็นเจ้าของ (Owner) | ไฟล์/โฟลเดอร์หลัก |
|---|---|---|---|
| **แฟน** | Leader + UX/UI | ภาพรวมโปรเจกต์, `Docs/protocol.md`, หน้าเว็บผู้ควบคุม, ประสบการณ์ใช้งานใน VR | `WebApp/` (ยกเว้น `network/`, `video/`), `Docs/`, `plan.md`, ไฟล์นี้ |
| **โฟล์ค** | Raspberry Pi — Software | server บน Pi, ตรวจสอบคำสั่ง, failsafe ฝั่ง Pi, mock mode | `Robot/RaspberryPi/code.py`, `protocol.py`, `TestTools/test_protocol.py` |
| **นัท** | Raspberry Pi — System & Hardware | ติดตั้ง OS, กล้อง, Serial ไป ESP32, ระบบไฟของ Pi, systemd, ROS 2 | ตั้งค่าเครื่อง Pi, `Robot/RaspberryPi/requirements.txt`, `Robot/ROS2/` |
| **เม่น** | ESP32 | firmware ควบคุมมอเตอร์, servo, LED, failsafe ฝั่ง ESP32, วงจรไฟมอเตอร์ | `Robot/ESP32/` |
| **สกาย** | Network | WebSocket ฝั่งเว็บ, WebRTC video, Wi-Fi AP, HTTPS cert, วัด latency | `WebApp/js/network/`, `WebApp/js/video/`, `TestTools/ws_client.py`, ค่าเครือข่ายบน Pi |

**จุดเชื่อมต่อระหว่างคน (Interface) — ห้ามเปลี่ยนโดยไม่แจ้งทั้งทีม**

```text
แฟน (WebApp UI/Input/Control)
   │  เรียก wsTransport.send("DRIVE,...")      ← สัญญา: Docs/protocol.md
   ▼
สกาย (wsTransport.js) ──WebSocket /ws──▶ โฟล์ค (code.py + protocol.py)
                                             │  Serial "DRIVE,...\n"   ← สัญญา: Docs/protocol.md
                                             ▼
นัท (สาย UART, กล้อง, ไฟเลี้ยง Pi) ──────▶ เม่น (ESP32 firmware) ──▶ มอเตอร์ / servo / LED
   │
   └─ กล้อง ──▶ สกาย (MediaMTX / WebRTC) ──▶ แฟน (แสดงภาพใน HUD/VR)
```

> **สิ่งที่ต้องยืนยันกับทีม:** ไฟล์นี้แบ่งงาน Raspberry Pi ให้ **โฟล์ค = ซอฟต์แวร์ server** และ **นัท = ระบบ/ฮาร์ดแวร์ของ Pi** ถ้าทีมต้องการแบ่งแบบอื่นให้แก้ตารางนี้ก่อนเริ่มงาน

---

## 2. Process รวมของทีม (ทุกคนต้องทำ)

### 2.1 Git workflow

1. **ห้าม push ตรงเข้า `main`** ทุกงานต้องทำใน branch ของตัวเอง
2. ตั้งชื่อ branch: `<ชื่อ>/<งาน>` เช่น `fan/hud`, `folk/ws-server`, `nut/camera-setup`, `men/motor-driver`, `sky/webrtc`
3. ก่อนเริ่มงานทุกวัน: `git pull origin main` แล้ว rebase/merge เข้า branch ตัวเอง
4. commit เล็ก ๆ บ่อย ๆ ข้อความ commit ขึ้นต้นด้วยส่วนที่แก้ เช่น `esp32: add motor PWM`, `web: add WASD input`
5. เปิด Pull Request เมื่องานเสร็จ 1 checkbox ใน plan.md (ไม่ต้องรอเสร็จทั้งเฟส)
6. **Reviewer อย่างน้อย 1 คน** ตามตารางนี้:

   | ผู้เปิด PR | Reviewer หลัก | เหตุผล |
   |---|---|---|
   | แฟน | สกาย | เว็บกับ network ใช้ไฟล์ร่วมกัน |
   | โฟล์ค | นัท | Pi เครื่องเดียวกัน |
   | นัท | โฟล์ค | Pi เครื่องเดียวกัน |
   | เม่น | นัท | สาย Serial / ไฟเลี้ยงต่อกัน |
   | สกาย | โฟล์ค | WebSocket สองฝั่งต้องตรงกัน |
   | แก้ `Docs/protocol.md` | **ทุกคน** | กระทบทุกส่วน |

7. PR ที่เพิ่ม/ลบ/ย้ายไฟล์ ต้องแก้ `PROJECT_STRUCTURE.md` ใน PR เดียวกัน
8. merge แล้วให้ติ๊ก checkbox ใน `plan.md`

### 2.2 การประชุมและติดตามงาน

| รอบ | เวลา | ใครนำ | เนื้อหา |
|---|---|---|---|
| Daily check-in (แชท) | ทุกวัน ก่อน 21:00 | ทุกคน | 3 บรรทัด: เมื่อวานทำอะไร / วันนี้จะทำอะไร / ติดอะไร |
| Weekly sync | สัปดาห์ละครั้ง 30–45 นาที | แฟน | ไล่ milestone, demo ของที่เสร็จ, ปรับแผน |
| Integration day | ก่อนปิดทุก milestone | แฟน + เจ้าของส่วนที่ต่อกัน | เอาของทุกคนมาต่อกันจริง (ดูหัวข้อ 4) |

- ติดปัญหาเกิน **1 วัน** ต้องแจ้งในแชททีม พร้อมแท็กคนที่เกี่ยวข้อง
- เปลี่ยน interface (protocol, พอร์ต, ขา GPIO, baud rate) ต้องประกาศในแชท **ก่อน** แก้โค้ด

### 2.3 ค่ากลางที่ทุกคนต้องใช้ตรงกัน

ค่าเหล่านี้ต้องบันทึกใน `Docs/protocol.md` (แฟนเป็นเจ้าของ) และห้ามฮาร์ดโค้ดค่าต่างไปจากนี้

| ค่า | ค่าเริ่มต้นที่เสนอ | ผู้กำหนด |
|---|---|---|
| รูปแบบคำสั่ง `DRIVE` / `HEAD` / `LIGHT` / `STATUS` | ตาม plan.md Phase 1 | แฟน (ทุกคน approve) |
| อัตราส่งคำสั่ง | 20 Hz | แฟน |
| Failsafe timeout | 300 ms | เม่น + โฟล์ค |
| ช่วงมุม servo | yaw ±90°, pitch −45°..+45° | เม่น |
| Serial baud rate / ขา UART | 115200, Pi GPIO14/15 ↔ ESP32 UART2 | นัท + เม่น |
| พอร์ตเว็บ / path WebSocket | 8443 (HTTPS), `/ws` | สกาย + โฟล์ค |
| พอร์ต / path วิดีโอ | MediaMTX WHEP `/cam/whep` | สกาย |
| ชื่อ Wi-Fi / IP ของ Pi | SSID `CN360-Robot`, `192.168.4.1` | สกาย |

### 2.4 Definition of Done (ทุกงาน)

- [ ] โค้ดรันได้จริงบนอุปกรณ์เป้าหมาย (ไม่ใช่แค่บนเครื่องตัวเอง)
- [ ] มีวิธีทดสอบเขียนไว้ใน PR (คำสั่งที่รัน + ผลที่ควรเห็น)
- [ ] ไม่มีค่าคงที่ที่ขัดกับตารางข้อ 2.3
- [ ] ปิด debug log หรือทำให้ปิดได้
- [ ] reviewer approve แล้ว
- [ ] อัปเดต `PROJECT_STRUCTURE.md` / `plan.md` แล้ว

---

## 3. Process รายคน

### 3.1 แฟน — Leader + UX/UI

**หน้าที่ Leader**

1. **เริ่มโปรเจกต์ (Phase 0–1)**
   - [ ] สร้างโฟลเดอร์ `WebApp/` ตามโครงสร้างใน PROJECT_STRUCTURE.md และ push ให้ทุกคนแตก branch ได้
   - [ ] ร่าง `Docs/protocol.md` จาก plan.md Phase 1 แล้วเปิด PR ให้ **ทุกคน approve** ภายใน 3 วัน
   - [ ] กรอกค่าในตารางข้อ 2.3 ให้ครบ (ถามเจ้าของแต่ละค่า)
   - [ ] ตั้งกลุ่มแชท, กำหนดวัน weekly sync, เพิ่มทุกคนเป็น collaborator ใน GitHub
   - [ ] ตัดสินเรื่องที่ค้าง: จะลบ `UnityProjects/` เมื่อไร, License, งบซื้ออุปกรณ์
2. **ระหว่างพัฒนา**
   - [ ] ติดตาม daily check-in ถ้าใครหายเกิน 2 วันให้ทักส่วนตัว
   - [ ] ดูแล `plan.md` ให้ตรงกับความจริง (ย้ายงาน, เลื่อน milestone)
   - [ ] เป็นคนตัดสินเมื่อสองฝั่งเถียงกันเรื่อง interface
   - [ ] จัด Integration day ก่อนปิดทุก milestone (หัวข้อ 4)
3. **จัดซื้อ** — [ ] รวมรายการจาก นัท (Pi, กล้อง, แบต) และ เม่น (ESP32, มอเตอร์, driver, servo, LED) → สั่งซื้อ → เก็บใบเสร็จ

**หน้าที่ UX/UI (WebApp)**

ลำดับงานแนะนำ (ทำบน PC ก่อน แล้วค่อยขึ้น VR):

| ขั้น | งาน | ไฟล์ | ขึ้นกับใคร | เสร็จเมื่อ | Milestone |
|---|---|---|---|---|---|
| 1 | ออกแบบหน้าจอ: wireframe หน้า PC + layout HUD ใน VR (ตำแหน่งภาพกล้อง, สถานะ, แบต, ไฟ) | `Docs/ui-wireframe.png` | — | ทีมเห็นชอบใน weekly sync | M1 |
| 2 | โครงหน้าเว็บ + สไตล์ | `index.html`, `style.css`, `main.js` | — | เปิดผ่าน `python -m http.server` ได้ | M1 |
| 3 | จำลองหันหัวด้วยเมาส์ (port จาก `MouseHeadSimulator.cs`) | `input/mouseHead.js` | — | ลากเมาส์แล้วค่า yaw/pitch เปลี่ยน, pitch ไม่เกิน ±60° | M2 |
| 4 | คีย์บอร์ด WASD + hotkey ไฟ | `input/keyboard.js` | — | กดแล้วค่า drive/light เปลี่ยนบน HUD | M2 |
| 5 | deadzone, expo, speed mode | `control/locomotion.js` | — | มี unit test ง่าย ๆ หรือ demo ค่า | M2 |
| 6 | สถานะไฟ | `control/lighting.js` | — | | M2 |
| 7 | รวมคำสั่ง, seq, smoothing, loop 20 Hz | `control/commandManager.js` | protocol.md | console แสดงข้อความตรงสเปกทุกตัวอักษร | M2 |
| 8 | ต่อกับ `wsTransport.js` ของสกาย | `main.js` | **สกาย** | server `--mock` ของโฟล์คได้รับคำสั่ง → **M2** | M2 |
| 9 | HUD: การเชื่อมต่อ, ping, แบต, ไฟ, ค่าขับ | `ui/hud.js` | สถานะ `STATUS` จากโฟล์ค | | M3 |
| 10 | วิว 2D จำลองหุ่นบนหน้า PC | `ui/hud.js` | — | | M2 |
| 11 | WebXR: ปุ่ม Enter VR, อ่าน head pose, ปุ่ม recenter | `input/xrHead.js` | HTTPS จาก **สกาย** | หันหัวบน PICO แล้วค่า HEAD เปลี่ยน → **M2.5** | M2.5 |
| 12 | Controller PICO | `input/xrGamepad.js` | — | joystick ขับได้, trigger หรี่ไฟได้ | M2.5 |
| 13 | HUD ใน VR + แผ่นภาพวิดีโอ (Three.js) | `ui/hud.js` | `webrtcView.js` ของ **สกาย** | เห็นภาพกล้องใน PICO → **M4** | M4 |
| 14 | ทดสอบใช้งานจริง: ให้คนนอกทีมลองขับ, จดปัญหา (เวียนหัว, ปุ่มสับสน) | `Docs/usability-notes.md` | ทุกคน | | M5 |

ข้อควรระวัง UX ใน VR: ห้ามขยับกล้องในฉากเองโดยผู้ใช้ไม่ได้หันหัว (ทำให้เวียนหัว), ตัวหนังสือ HUD ต้องใหญ่พอ, ต้องมีสัญญาณเตือนชัด ๆ เมื่อการเชื่อมต่อหลุด

---

### 3.2 โฟล์ค — Raspberry Pi Software (Server)

| ขั้น | งาน | ไฟล์ | ขึ้นกับใคร | เสร็จเมื่อ | Milestone |
|---|---|---|---|---|---|
| 1 | อ่านและ review `Docs/protocol.md` | — | แฟน | approve PR แล้ว | M1 |
| 2 | parser + validator: แยกคำสั่ง, ตรวจจำนวน field, ตรวจช่วงค่า, clamp, ตรวจ seq | `protocol.py` | protocol.md | | M1 |
| 3 | unit test ครอบคลุม: ข้อความถูก, ผิดรูปแบบ, ค่าเกินช่วง, seq ย้อนหลัง | `TestTools/test_protocol.py` | — | `pytest` ผ่านหมด | M1 |
| 4 | server aiohttp: เสิร์ฟ `WebApp/` แบบ static | `code.py` | — | เปิดเว็บของแฟนผ่าน server ได้ | M2 |
| 5 | endpoint `/ws`: รับข้อความ → `protocol.py` → log | `code.py` | — | | M2 |
| 6 | รับผู้ควบคุมได้ทีละ 1 คน (คนที่สองต้องถูกปฏิเสธพร้อมข้อความแจ้ง) | `code.py` | — | | M2 |
| 7 | โหมด `--mock`: ไม่เปิด Serial, พิมพ์สถานะหุ่นจำลองแทน | `code.py` | — | **ใช้แทน `udp_receiver.py` ได้** — แจ้งแฟนกับสกายให้ใช้ทดสอบ | M2 |
| 8 | failsafe: WS หลุด หรือไม่มี `DRIVE` เกิน 300 ms → ส่งคำสั่งหยุด | `code.py` | — | ปิดแท็บเว็บแล้ว log แสดงคำสั่งหยุดภายใน 300 ms | M2 |
| 9 | ส่ง `STATUS` กลับทุก 1 วินาที (แบต + `ack_seq`) | `code.py` | ค่าแบตจาก **นัท** | HUD ของแฟนแสดงได้ | M3 |
| 10 | เขียน Serial ไป ESP32 (pyserial, ใส่ `\n` ท้าย) + อ่านข้อความตอบกลับ | `code.py` | สาย UART จาก **นัท**, firmware จาก **เม่น** | servo ขยับตามคำสั่งจากเว็บ → **M3** | M3 |
| 11 | ตัวเลือก `--https --cert --key` | `code.py` | cert จาก **สกาย** | | M2.5 |
| 12 | log ไฟล์แบบหมุนเวียน + flag `--verbose` | `code.py` | — | | M5 |
| 13 | ลบ `TestTools/udp_receiver.py` + แก้ PROJECT_STRUCTURE.md | — | M2 ผ่านแล้ว | | M3 |

**ส่งต่อให้:** นัท (ไฟล์ที่ systemd ต้องรัน + `requirements.txt`), สกาย (พอร์ตและ path ที่ใช้จริง)

---

### 3.3 นัท — Raspberry Pi System & Hardware

| ขั้น | งาน | ผลลัพธ์ | ขึ้นกับใคร | เสร็จเมื่อ | Milestone |
|---|---|---|---|---|---|
| 1 | ทำรายการอุปกรณ์ Pi: Pi 4B 4GB, microSD 32GB, Camera Module 3, heatsink, แบต 2S, BMS, buck 5V | ส่งรายการให้แฟน | — | แฟนสั่งซื้อแล้ว | M1 |
| 2 | ติดตั้ง Raspberry Pi OS Lite 64-bit, ตั้ง hostname `cn360`, เปิด SSH, สร้าง user ทีม | Pi พร้อมใช้ | — | ทุกคน SSH เข้าได้ | M2.5 |
| 3 | เขียนขั้นตอนติดตั้งทั้งหมดลง `Docs/pi-setup.md` (ทำซ้ำได้ถ้าการ์ดเสีย) | เอกสาร | — | คนอื่นทำตามแล้วได้ผลเหมือนกัน | M2 |
| 4 | ติดตั้ง Python, venv, `requirements.txt` (aiohttp, pyserial) | `Robot/RaspberryPi/requirements.txt` | โฟล์ค | `code.py --mock` รันบน Pi ได้ | M2.5 |
| 5 | ต่อและทดสอบกล้อง (`rpicam-hello`, ทดสอบ H.264 encode) | กล้องใช้ได้ | — | ถ่ายวิดีโอสั้นได้ | M2.5 |
| 6 | เปิด UART (`raspi-config` ปิด serial console), ต่อสาย GPIO14/15 + GND ร่วมกับ ESP32 | สาย Serial | **เม่น** (ขา ESP32) | ส่งข้อความ echo ไป-กลับกับ ESP32 ได้ | M3 |
| 7 | ระบบไฟของ Pi: แบต 2S → BMS → buck 5V 3A ไป Pi, วัดแรงดันตอนมอเตอร์ออกตัว | วงจรไฟ | **เม่น** (rail มอเตอร์แยก) | Pi ไม่รีบูตตอนมอเตอร์ออกตัวเต็มแรง | M3 |
| 8 | วัดแรงดันแบต (ADC ภายนอก เช่น ADS1115 หรืออ่านผ่าน ESP32) ส่งค่าให้โฟล์ค | ค่าแบต | โฟล์ค / เม่น | `STATUS` มีค่าแบตจริง | M3 |
| 9 | systemd service ให้ server ของโฟล์ค + MediaMTX ของสกายรันตอนบูต และรีสตาร์ทเองถ้าล่ม | `Docs/pi-setup.md` | โฟล์ค, สกาย | เสียบแบตแล้วเปิดเว็บได้โดยไม่ต้อง SSH | M3 |
| 10 | ตรวจอุณหภูมิ Pi ระหว่างสตรีมวิดีโอ 15 นาที | ผลวัด | สกาย | ไม่เกิน 75°C | M4 |
| 11 | ทำ image สำรองของ microSD หลังผ่าน M3 | ไฟล์ image | — | | M5 |
| 12 | (เฟสหลัง) ติดตั้ง ROS 2 + micro-ROS agent, เขียน `cn360_bridge` | `Robot/ROS2/code.py` | เม่น (micro-ROS) | ไปดูหัวข้อ ROS 2 ใน plan.md | M5 |

---

### 3.4 เม่น — ESP32

| ขั้น | งาน | ผลลัพธ์ | ขึ้นกับใคร | เสร็จเมื่อ | Milestone |
|---|---|---|---|---|---|
| 1 | **ตัดสินใจเฟรมเวิร์ก**: MicroPython หรือ Arduino/PlatformIO (ถ้าจะใช้ micro-ROS ในอนาคตต้องเป็น Arduino/C++) แจ้งทีม | การตัดสินใจ | แฟน | บันทึกใน plan.md | M1 |
| 2 | ทำรายการอุปกรณ์: ESP32 DevKit, มอเตอร์ N20/TT ×2–4, TB6612FNG, servo SG90 ×2, LED กำลังสูง + IR LED, MOSFET, ล้อ/สายพาน | ส่งรายการให้แฟน | — | | M1 |
| 3 | วาด pinout: ขามอเตอร์, servo, LED, UART2 แล้วบันทึกลง `Docs/esp32-pinout.md` | เอกสาร | นัท (UART) | | M2 |
| 4 | ทดสอบทีละอุปกรณ์: มอเตอร์ 1 ตัว → 2 ตัว → servo → LED | sketch ทดสอบ | — | ทุกอุปกรณ์ขยับได้ด้วยโค้ดทดสอบ | M2 |
| 5 | differential drive: `linear`, `angular` → ความเร็วล้อซ้าย/ขวา + speed mode | `Robot/ESP32/` | protocol.md | | M2.5 |
| 6 | servo pan/tilt: แปลงองศา → PWM, clamp ช่วงมุม, จำกัดความเร็วการหมุน | `Robot/ESP32/` | — | หันไม่กระชาก | M2.5 |
| 7 | LED: PWM ความสว่าง 0–100%, สลับ IR/ปกติ | `Robot/ESP32/` | — | | M2.5 |
| 8 | อ่าน Serial ทีละบรรทัด, parse คำสั่งตาม protocol.md, ไม่ค้างเมื่อเจอข้อความเสีย | `Robot/ESP32/` | protocol.md | ส่งข้อความมั่ว ๆ แล้วบอร์ดไม่รีเซ็ต | M3 |
| 9 | **failsafe watchdog**: ไม่ได้รับคำสั่งเกิน 300 ms → มอเตอร์หยุด | `Robot/ESP32/` | — | ดึงสาย UART ออกแล้วมอเตอร์หยุดทันที | M3 |
| 10 | ทดสอบกับ Pi จริง ผ่าน `code.py` ของโฟล์ค | — | **นัท** (สาย), **โฟล์ค** (server) | → **M3** | M3 |
| 11 | วงจรไฟมอเตอร์: rail แยกจาก Pi, ตัวเก็บประจุกันไฟกระชาก, GND ร่วม | วงจร | นัท | | M4 |
| 12 | ประกอบลงแชสซี + pan/tilt bracket (ร่วมกับนัท) | หุ่นที่ประกอบแล้ว | นัท | | M4 |
| 13 | (เฟสหลัง) micro-ROS | `Robot/ESP32/` | นัท (agent) | | M5 |

---

### 3.5 สกาย — Network

| ขั้น | งาน | ไฟล์/ผลลัพธ์ | ขึ้นกับใคร | เสร็จเมื่อ | Milestone |
|---|---|---|---|---|---|
| 1 | **Spike ความสามารถ PICO Browser** (ทำเป็นอย่างแรก): ทดสอบ WebXR `immersive-vr`, Gamepad, WebRTC บน PICO 4 ด้วยหน้าทดสอบง่าย ๆ | `Docs/pico-browser-check.md` | — | รู้แน่ว่าอะไรใช้ได้ (ถ้าไม่ได้ต้องแจ้งแฟนทันที เพราะกระทบทั้งแผน) | M1 |
| 2 | `wsTransport.js`: connect จาก host เดียวกับหน้าเว็บ, `send()`, reconnect แบบ backoff, ทิ้งคำสั่งเก่าตอนหลุด, event สถานะการเชื่อมต่อให้ HUD | `WebApp/js/network/wsTransport.js` | โฟล์ค (`/ws`) | ปิด/เปิด server แล้วเว็บต่อกลับเองได้ | M2 |
| 3 | วัด ping: ใช้ `ack_seq` จาก `STATUS` คำนวณ round-trip ส่งให้ HUD | `wsTransport.js` | โฟล์ค | HUD แสดง ping | M3 |
| 4 | `ws_client.py`: ยิงคำสั่งทดสอบ, วัด round-trip, จำลอง packet ถี่/เสีย | `TestTools/ws_client.py` | โฟล์ค | โฟล์คใช้ทดสอบ server ได้โดยไม่ต้องเปิดเว็บ | M2 |
| 5 | **HTTPS**: สร้าง cert ด้วย `mkcert` หรือ self-signed สำหรับ `192.168.4.1` / `cn360.local`, เขียนวิธีติดตั้ง cert บน PICO | `Docs/https-setup.md` (ห้าม commit ไฟล์ `.pem`) | นัท | PICO เปิดหน้าเว็บผ่าน HTTPS แล้วกด Enter VR ได้ → **M2.5** | M2.5 |
| 6 | **Wi-Fi AP บน Pi** (hostapd + dnsmasq หรือ NetworkManager hotspot): SSID `CN360-Robot`, IP `192.168.4.1` | `Docs/pi-setup.md` (ส่วน network) | นัท | PICO ต่อ Wi-Fi หุ่นตรง ๆ ได้โดยไม่ใช้เราเตอร์ | M2.5 |
| 7 | ติดตั้ง MediaMTX: รับภาพจาก Camera Module 3 (H.264 hardware), เปิด WebRTC/WHEP | config MediaMTX | นัท (กล้อง) | เปิด URL ใน Chrome บน PC แล้วเห็นภาพ | M4 |
| 8 | `webrtcView.js`: ต่อ WHEP → `<video>` และส่ง element ให้แฟนทำ texture ใน VR | `WebApp/js/video/webrtcView.js` | แฟน | → **M4** | M4 |
| 9 | ให้เว็บและวิดีโอใช้ origin/cert เดียวกัน (reverse proxy ใน aiohttp หรือ CORS) | config | โฟล์ค | ไม่มี mixed-content / CORS error ใน console | M4 |
| 10 | **วัด latency** แล้วบันทึก: คำสั่ง (กดปุ่ม → servo ขยับ), ภาพ (glass-to-glass ด้วยการถ่ายนาฬิกา) | `Docs/latency-report.md` | ทุกคน | ภาพ < 150 ms, คำสั่ง < 100 ms (ถ้าไม่ถึงให้ปรับ resolution/bitrate) | M4 |
| 11 | ทดสอบระยะ Wi-Fi และในพื้นที่อับสัญญาณ, เสนอเสาอากาศภายนอกถ้าจำเป็น | `Docs/latency-report.md` | เม่น, นัท | | M5 |
| 12 | (ถ้า WebSocket หน่วงเกิน) ทดลองเปลี่ยนเป็น WebRTC DataChannel แบบ unreliable | prototype | โฟล์ค | | M5 |

---

## 4. Integration (ต่อของทุกคนเข้าด้วยกัน)

ทำทีละขั้นตามลำดับ **ห้ามข้ามขั้น** ถ้าขั้นไหนพังให้กลับไปแก้ก่อน

| ขั้น | ต่ออะไรกับอะไร | คนที่ต้องอยู่ | วิธีทดสอบ | Milestone |
|---|---|---|---|---|
| I-1 | `ws_client.py` → `code.py --mock` (บน PC) | สกาย, โฟล์ค | ยิง 1,000 ข้อความ ไม่มี error, seq ไม่ขาด | M2 |
| I-2 | WebApp → `code.py --mock` (บน PC) | แฟน, สกาย, โฟล์ค | WASD + เมาส์ แล้ว log ตรงสเปก, ปิดแท็บแล้วเห็น failsafe | **M2** |
| I-3 | WebApp บน PICO → `code.py --mock` บน Pi ผ่าน HTTPS + Wi-Fi AP | แฟน, สกาย, นัท | Enter VR, หันหัวแล้วค่า HEAD เปลี่ยน | **M2.5** |
| I-4 | `code.py` → Serial → ESP32 (ยังไม่ต่อมอเตอร์ ดูแค่ log บน ESP32) | โฟล์ค, นัท, เม่น | คำสั่งครบ ไม่มีบรรทัดเสีย | M3 |
| I-5 | ต่อ servo + LED | เม่น, นัท | หัน PICO แล้วกล้องหันตาม, หรี่ไฟได้ | M3 |
| I-6 | ต่อมอเตอร์ (ยกหุ่นให้ล้อลอยก่อน) | เม่น, นัท, โฟล์ค | joystick ขับได้, ดึงสาย/ปิดเว็บแล้วล้อหยุด | **M3** |
| I-7 | วิดีโอ + คำสั่งพร้อมกัน | สกาย, แฟน, นัท | เห็นภาพใน PICO ขณะขับ, วัด latency | **M4** |
| I-8 | ทดสอบภาคสนาม (ท่อ / พื้นที่จำลอง) | ทุกคน | ภารกิจ: ขับเข้าไป 5 เมตร หาเป้าหมาย แล้วกลับออกมา | **M5** |

**Checklist ความปลอดภัยก่อนทดสอบที่มีมอเตอร์ (I-6 ขึ้นไป)**
- [ ] แบตชาร์จเต็ม, ตรวจสายไม่มีจุดเปลือย
- [ ] ยกหุ่นให้ล้อลอยในการทดสอบครั้งแรก
- [ ] ทดสอบ failsafe ก่อนทุกครั้ง (ปิดเว็บ → ล้อต้องหยุด)
- [ ] มีคนหนึ่งคนพร้อมถอดแบต

---

## 5. ลำดับเวลาโดยรวม (ใครทำอะไรพร้อมกัน)

| ช่วง | แฟน | โฟล์ค | นัท | เม่น | สกาย |
|---|---|---|---|---|---|
| **M1** | protocol.md, โครง WebApp, จัดซื้อ | review protocol, `protocol.py` + test | รายการอุปกรณ์ Pi | ตัดสินใจเฟรมเวิร์ก, รายการอุปกรณ์ | **spike PICO Browser** |
| **M2** | input เมาส์/คีย์บอร์ด, control, HUD | server, `/ws`, `--mock`, failsafe | (รอของ) `pi-setup.md` | pinout, ทดสอบทีละอุปกรณ์ | `wsTransport.js`, `ws_client.py` |
| **M2.5** | WebXR head + gamepad | `--https` | ติดตั้ง Pi, กล้อง | drive mixing, servo, LED | HTTPS cert, Wi-Fi AP |
| **M3** | HUD แบต/ping | Serial bridge, `STATUS` | UART, ระบบไฟ, systemd | Serial parser, watchdog | ping, ช่วยต่อ I-4 ถึง I-6 |
| **M4** | วิดีโอใน VR | reverse proxy | ตรวจความร้อน | วงจรไฟมอเตอร์, ประกอบแชสซี | MediaMTX, `webrtcView.js`, latency |
| **M5** | usability test | log, แก้บั๊ก | image สำรอง, ROS 2 | micro-ROS (ถ้าทำ) | ทดสอบระยะสัญญาณ |
