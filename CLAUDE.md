# CN360 — Claude Code instructions

## การใช้ skill (เฉพาะโปรเจกต์นี้)

- ถ้างานตรงกับ skill ของโปรเจกต์ใน `.claude/skills/` ให้โหลด skill นั้นก่อนเริ่มงาน แล้วทำตามที่ skill กำหนดทุกข้อ (convention, ขั้นตอน, คำศัพท์, การเทส) ถ้าขัดกับวิธีปกติ ให้ยึดตาม skill
  - `cn360-robot` — `Robot/RaspberryPi/`, `Robot/ESP32/`, `Robot/ROS2/`, `TestTools/`, Command Protocol v1, WebSocket/serial, failsafe
  - `veil-ui` — ทุกอย่างใน `UI/` (screen, design token, Three.js, WebXR, WHEP video, เทสของ UI)
  - `codebase-design` — ออกแบบหรือปรับ interface / seam ของ module, ทำให้โค้ดเทสง่ายขึ้น
- ถ้างานไม่ตรงกับ skill ข้างบน ให้ทำงานตามปกติโดยไม่ต้องโหลด skill ใดๆ (รวมถึง skill จาก plugin หรือ skill ระดับ global) เว้นแต่ผู้ใช้สั่งเรียก skill นั้นเอง เช่นพิมพ์ `/<ชื่อ skill>`
