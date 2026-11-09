# Context สไลด์นำเสนอ CN360 Progress Presentation (Version 1)

> **เอกสารสรุปเนื้อหาสำหรับใช้บรรยายและนำเสนอสไลด์ชุด Version 1**  
> ครอบคลุมการพัฒนา **PR #6** (การขับเคลื่อนหุ่น RoverC ล้อ Mecanum ผ่าน PICO 4) และ **PR #7** (ระบบกล้อง Pan/Tilt สตรีมสด WebRTC ติดตามการหันศีรษะบน Raspberry Pi 4)

---

## สไลด์ที่ 1: Title Slide (หน้าปก)

- **หมวดหมู่ / Tag:** `TELEOPERATION & PROGRESS UPDATE`
- **หัวข้อหลัก (Title):** CN360: VR Teleoperation & Subsystems
- **หัวข้อย่อย (Subtitle):** PICO 4 RoverC Mecanum Driving (PR #6) & Raspberry Pi Pan/Tilt Camera (PR #7)
- **ข้อมูลโปรเจกต์ (Metadata):**
  - **โครงการ:** CN360 Teleoperation Platform (VEIL)
  - **สถานะ:** Core Milestones Merged เรียบร้อยแล้ว (+300 บรรทัดใน PR #6 และ +399 บรรทัดใน PR #7)
  - **ผู้พัฒนาหลัก:** Wutthisak Boonkan (@Jupiter4428) สำหรับ PR #6, Montrinut (@Montree) สำหรับ PR #7
  - **สถาปัตยกรรมหลัก:** WebXR, Vite HTTPS Proxy, Node.js Protocol Bridge, MediaMTX WebRTC (WHEP) และ Linux Hardware PWM

---

## สไลด์ที่ 2: PR #6 Background & Motivation (ปัญหาและความท้าทาย)

- **หมวดหมู่:** `PART 1: ROVERC TELEOPERATION | PR #6 BACKGROUND & MOTIVATION`
- **หัวข้อ:** ปัญหาและความท้าทายในการเชื่อมต่อ PICO 4 กับ RoverC

### 1. ข้อจำกัดเดิมของระบบ (The Gaps)
- **ฮาร์ดแวร์คนละโปรโตคอล:** หุ่น RoverC ใช้เฟิร์มแวร์เฉพาะบนบอร์ด M5StickC Plus (ESP32) ซึ่งสื่อสารผ่าน JSON over WebSocket (`ws://:81/`) ในขณะที่ระบบควบคุม VEIL UI ถูกออกแบบมาให้สื่อสารผ่าน CN360 Protocol v1
- **เงื่อนไข WebXR Controllers:** เบราว์เซอร์บน PICO 4 จะยอมเปิดสิทธิ์ให้เข้าถึงพิกัด Joystick ผ่าน WebXR Gamepad API ได้เฉพาะเมื่อหน้าเว็บรันอยู่บนโปรโตคอลที่มีความปลอดภัยสูง (HTTPS ที่มีใบรับรอง SSL) เท่านั้น
- **ไม่ต้อง Flash Firmware ใหม่:** โจทย์สำคัญคือต้องการให้ PICO 4 สามารถเข้าควบคุม RoverC ได้ทันทีโดยไม่ต้องแฟลชเฟิร์มแวร์ใหม่ ไม่ต้องต่อ Raspberry Pi เสริมบนตัวรถในขั้นแรก และไม่เสี่ยงต่อความเสียหายของฮาร์ดแวร์

### 2. แนวทางแก้ไขใน PR #6 (The Solutions)
- **Node.js Translation Bridge:** พัฒนาสคริปต์ `tools/roverc-bridge.mjs` ทำหน้าที่เป็นตัวกลางแปลภาษา แปลงคำสั่ง DRIVE จาก Protocol v1 (VEIL) ให้อยู่ในรูป JSON WebSocket ส่งต่อไปยัง RoverC
- **Vite HTTPS Dev Server:** เพิ่มคำสั่ง `npm run dev:https` เพื่อเปิด Vite Dev Server แบบมีใบรับรองความปลอดภัย Self-signed cert พร้อมทำ WebSocket Proxy ในตัว ทำให้ PICO 4 เข้าถึง WebXR ได้อย่างสมบูรณ์
- **Mecanum Control Mapping:** ออกแบบระบบแมปปิ้งคันโยกสำหรับล้อ Mecanum ให้สามารถสไลด์ข้าง (Strafe) และหมุนตัว (Rotate) ได้อย่างอิสระ พร้อมระบบความปลอดภัย Failsafe ตัดการทำงานเมื่อปล่อยมือ

---

## สไลด์ที่ 3: RoverC Architecture (สถาปัตยกรรมการเชื่อมต่อและ Data Flow)

- **หมวดหมู่:** `PART 1: ROVERC TELEOPERATION | ROVERC ARCHITECTURE`
- **หัวข้อ:** สถาปัตยกรรมการเชื่อมต่อและเส้นทางการส่งข้อมูล (PR #6 Pipeline)

### โหนดหลักทั้ง 3 ส่วน:
1. **PICO 4 VR Headset:** รัน VEIL WebXR UI บนเบราว์เซอร์ PICO 4 อ่านพิกัดจาก Controller Joystick และเชื่อมต่อ Wi-Fi เข้ากับ Access Point ของตัวหุ่น
2. **Laptop (Host & Bridge):** 
   - `vite dev:https` รันที่พอร์ต `:5173` ทำหน้าที่เป็น Web Server และ Proxy
   - `roverc-bridge` รันที่พอร์ต `:8765` ทำหน้าที่แปลงโปรโตคอลและจำกัดอัตราการส่งข้อมูล (Rate limit)
3. **M5Stack RoverC:** บอร์ด M5StickC Plus ปล่อย Wi-Fi AP ชื่อ `RoverC-XXXX` ที่ไอพี `192.168.4.1` และเปิด WebSocket Server บนพอร์ต `:81` รับคำสั่ง JSON ไปคุมมอเตอร์ล้อ Mecanum

### ลำดับขั้นตอนการรับส่งข้อมูล (End-to-End Pipeline):
1. **PICO 4 ➔ Vite Proxy:** PICO 4 ส่งคำสั่ง DRIVE ผ่าน WebSocket Secure (`wss://<laptop>:5173/ws`)
2. **Vite ➔ RoverC Bridge:** Vite ทำหน้าที่ Proxy แพ็กเก็ต WebSocket ต่อไปยัง Node.js Bridge ที่ `localhost:8765`
3. **Protocol Translation:** Bridge ทำการแยกค่าแกน linear, strafe, angular จากคำสั่ง DRIVE แล้วแปลงเป็นคำสั่งทิศทาง JSON พร้อมคุมระดับความเร็ว
4. **Bridge ➔ RoverC Hardware:** Bridge ส่งข้อความ `{type: 'move', dir: '...'}` ผ่าน `ws://192.168.4.1:81/` เข้าไปยังตัวหุ่นยนต์เพื่อสั่งงานมอเตอร์

---

## สไลด์ที่ 4: RoverC Bridge Core (การแปลงโปรโตคอลและกลไกความเสถียร)

- **หมวดหมู่:** `PART 1: ROVERC TELEOPERATION | ROVERC BRIDGE CORE`
- **หัวข้อ:** RoverC Bridge: การแปลงโปรโตคอลและกลไกความเสถียร

### การ์ดฟังก์ชันหลัก 3 ด้าน:
1. **Session & Origin Claim:**
   - ตรวจสอบ Origin: ตัวหุ่นยนต์กำหนดให้ต้องส่ง Header `Origin: http://<robot>` เท่านั้น มิฉะนั้นการเชื่อมต่อจะถูกตัดทิ้ง
   - แย่งสิทธิ์ควบคุม (Force Claim): ส่ง `{type: "claim", force: true}` เพื่อชิงสิทธิ์ควบคุมมาจากหน้าเว็บอื่น (เช่น หน้าเว็บของ RoverC บนแท็บเล็ต)
   - Keep-Alive Ping: ส่งสัญญาณ Ping ไปยังหุ่นทุกๆ 2 วินาทีเพื่อป้องกันไม่ให้ Session หลุด
2. **Scheduler & Rate Limiting:**
   - ลูปจำกัดอัตราส่ง: รัน Scheduler ทุกๆ 25 ms คุมความถี่ในการส่งข้อมูลไม่ให้เกิน ~10 ข้อความ/วินาที
   - ป้องกันเฟิร์มแวร์ค้าง: หากส่งรัวเกิน 30 msg/s ตัวหุ่นจะติดขีดจำกัด Rate limit และหยุดนิ่งทันที
   - เลี้ยง Hardware Watchdog: ส่งข้อความซ้ำทุก 100 ms เพื่อไม่ให้ Hardware Watchdog ขนาด 400 ms ของหุ่นยนต์ตัดการทำงาน
3. **Failsafe Stop Systems:**
   - Zero-Deadzone Stop: ส่งคำสั่ง `stop` ทันทีเมื่อโยกคันโยกกลับเข้าสู่ช่วง Deadzone (รัศมี 0.12)
   - Heartbeat Timeout: สั่งหยุดอัตโนมัติหากไม่มีคำสั่ง DRIVE ใหม่ส่งเข้ามาเกิน 300 ms
   - Disconnect Protection: สั่งหยุดการทำงานทันทีหากฝั่งผู้ควบคุมหลุด หรือมีการ Reconnect ของหุ่นยนต์

---

## สไลด์ที่ 5: Mecanum Controls & Protocol v1 (การควบคุมและส่วนขยายโปรโตคอล)

- **หมวดหมู่:** `PART 1: ROVERC TELEOPERATION | MECANUM & PROTOCOL`
- **หัวข้อ:** Mecanum Controls และส่วนต่อขยาย CN360 Protocol v1

### 1. การควบคุมด้วย PICO 4 Controllers
- **Left Grip Button:** สวิตช์นิรภัย (Dead-man Switch) ต้องกดค้างไว้ตลอดการขับขี่ หากปล่อยมือ หุ่นยนต์จะหยุดการเคลื่อนที่ทันที
- **Left Thumbstick (Translate):**
  - โยกแกนขึ้น/ลง = เดินหน้า - ถอยหลัง
  - โยกแกนซ้าย/ขวา = สไลด์ข้างซ้าย - ขวา (Strafe Left / Right)
- **Right Thumbstick (Rotate):** โยกแกนซ้าย/ขวา = หมุนตัวกลับทิศทาง (Rotate Left / Right)
- **Keyboard Fallback:** รองรับการควบคุมผ่านคีย์บอร์ด (W/S = เดินหน้า/ถอยหลัง, A/D = สไลด์ข้าง, Q/E = หมุนตัว)

### 2. ส่วนขยายโปรโตคอล & อัลกอริทึมเลือกทิศทาง
- **Optional 6th DRIVE Field:** โครงสร้าง `DRIVE,<seq>,<linear>,<angular>,<mode>,[strafe]` โดยจะส่งฟิลด์ที่ 6 เมื่อมีการสไลด์ เพื่อให้เข้ากันได้กับหุ่นยนต์รุ่นเดิมที่มี 5 ฟิลด์ (Backward Compatible)
- **Strongest-Axis Arbitration:** เนื่องจากเฟิร์มแวร์ของ RoverC รับคำสั่งทิศทางได้ทีละ 1 ทิศทาง แกนที่มีแรงโยกมากที่สุดจะได้รับเลือกเป็นทิศทางหลัก
- **Hysteresis กันกระตุก (0.2 Delta):** เมื่อโยกคันโยกในแนวทแยง ทิศทางใหม่จะต้องมีค่ามากกว่าทิศทางเดิมอย่างน้อย 0.2 จึงจะยอมเปลี่ยนทิศทาง เพื่อป้องกันไม่ให้หุ่นยนต์สลับทิศทางกระตุกไปมา
- **Motor Speed Clamping:** แปลงค่าเปอร์เซ็นต์เป็นสปีดระหว่าง 8–30 (ตั้งขั้นต่ำไว้ที่ 8 เพื่อป้องกันมอเตอร์ติดขัด และจำกัดสูงสุดที่ 30 ตามขีดจำกัดของเฟิร์มแวร์)

---

## สไลด์ที่ 6: Operational Workflow (ขั้นตอนการติดตั้งและทดสอบขับขี่)

- **หมวดหมู่:** `PART 1: ROVERC TELEOPERATION | OPERATIONAL WORKFLOW`
- **หัวข้อ:** ขั้นตอนการติดตั้งและทดสอบขับขี่ RoverC จาก PICO 4

### 4 ขั้นตอนการปฏิบัติงาน (Step-by-Step):
- **ขั้นตอนที่ 1 (Connect Wi-Fi):** นำแล็ปท็อปเชื่อมต่อกับเครือข่าย Wi-Fi AP ของหุ่นยนต์ RoverC (SSID: `RoverC-XXXX`) และสามารถใช้ USB Tethering จากมือถือเข้าแล็ปท็อปเพื่อใช้งานอินเทอร์เน็ตไปพร้อมกันได้
- **ขั้นตอนที่ 2 (Generate SSL Cert):** สร้างใบรับรอง Self-signed certificate เก็บไว้ในโฟลเดอร์ `UI/.certs/` เพื่อให้เบราว์เซอร์ของ PICO 4 ยอมรับการทำงานของ WebXR
- **ขั้นตอนที่ 3 (Start Bridge & Server):** เปิด 2 หน้าต่าง Terminal บนแล็ปท็อป:
  - Terminal 1: รัน `npm run roverc` (เปิด Bridge แปลงโปรโตคอล)
  - Terminal 2: รัน `npm run dev:https` (เปิด Vite Dev Server แบบ HTTPS)
- **ขั้นตอนที่ 4 (Enter Live VR):** สวมแว่น PICO 4 เปิดเบราว์เซอร์ไปที่ `https://<laptop-ip>:5173/#/immersive?mode=live` ยอมรับคำเตือนใบรับรอง กดปุ่ม Enter VR แล้วกำปุ่ม Left Grip ค้างไว้เพื่อเริ่มขับขี่

---

## สไลด์ที่ 7: New Progress Overview (ภาพรวมความคืบหน้าระบบ Pan/Tilt ใน PR #7)

- **หมวดหมู่:** `PART 2: PAN/TILT SUBSYSTEM | NEW PROGRESS OVERVIEW`
- **หัวข้อ:** Pan/Tilt Camera Subsystem: ติดตามการหันศีรษะแบบเรียลไทม์

### 1. ความก้าวหน้าใหม่ (PR #7 Overview)
- **Head-Tracking เต็มรูปแบบ:** กล้อง Pi Camera v2 บนฐานหมุน Pan/Tilt (ใช้เซอร์โว SG90 ×2) สามารถหมุนตามมุมศีรษะของผู้สวม PICO 4 ในโลกจริงได้อย่างแม่นยำ
- **Pure WebXR (ไม่ต้องใช้ Unity):** รันระบบทั้งหมดผ่านเบราว์เซอร์ PICO 4 ด้วย WebXR + A-Frame โดยตรง ลดภาระในการพัฒนาแอปพลิเคชันแบบ Native
- **Ultra-Low Latency Video:** สตรีมวิดีโอความละเอียดสูงผ่าน WebRTC (WHEP) พร้อมการเข้ารหัสแบบฮาร์ดแวร์ H.264 แทนที่ระบบ MJPEG เดิมที่ภาพกระตุกและกินแบนด์วิธสูง
- **ผสานการทำงานสมบูรณ์:** ทำงานควบคู่กับตัวรถ RoverC ได้ทันที และพร้อมเชื่อมต่อสัญญาณภาพเข้าสู่หน้าจอ VEIL UI

### 2. รายละเอียดไฟล์ที่เพิ่มเข้ามาใน PR #7
- `control.py`: สคริปต์ Flask + flask-sock รัน HTTPS พอร์ต 8000 ควบคุมเซอร์โวมอเตอร์ 2 แกนผ่าน Hardware PWM และคำนวณการหน่วงการเคลื่อนที่ (Smoothing)
- `vr_rtc.html`: หน้าเว็บ WebXR สำหรับแว่น VR ทำหน้าที่รับภาพ WebRTC และอ่านค่ามุมศีรษะส่งกลับผ่าน WebSocket พร้อมระบบเตือนการชนขอบ
- `mediamtx.yml`: ไฟล์ตั้งค่าสำหรับ MediaMTX v1.21.3 ทำหน้าที่ดึงภาพจากกล้อง Pi Camera v2 และส่งออกเป็น WebRTC WHEP ที่พอร์ต 8889
- `systemd/ Services`: ไฟล์เซอร์วิส `pantilt-control.service` และ `pantilt-mediamtx.service` สำหรับสั่งให้ระบบเริ่มทำงานอัตโนมัติเมื่อเปิดเครื่อง Raspberry Pi

---

## สไลด์ที่ 8: Pan/Tilt Dual-Channel Architecture (สถาปัตยกรรมแยกช่องสัญญาณ)

- **หมวดหมู่:** `PART 2: PAN/TILT SUBSYSTEM | PAN/TILT ARCHITECTURE`
- **หัวข้อ:** สถาปัตยกรรมการสื่อสารแบบ Dual-Channel (Control & Video)

### โหนดการทำงานหลัก:
1. **PICO 4 Browser (WebXR):** หน้าเว็บ A-Frame รับสตรีมวิดีโอ WebRTC WHEP, คำนวณมุม Yaw & Pitch ของแว่นตา แล้วส่งพิกัดผ่าน WebSocket ทุก 25 ms
2. **Raspberry Pi 4 (Core):** รัน Flask-Sock สำหรับรับค่าควบคุมที่พอร์ต `:8000`, รัน MediaMTX WebRTC ที่พอร์ต `:8889`, และสร้างสัญญาณ Hardware PWM 2 ช่อง
3. **Camera & Pan/Tilt Servos:** ฮาร์ดแวร์จริง ประกอบด้วย Pi Camera v2 (imx219), มอเตอร์ SG90 แกน Pan ต่อขา GPIO12 (PWM0) และแกน Tilt ต่อขา GPIO13 (PWM1)

### การแยกทราฟฟิกข้อมูล (Dual-Channel Dataflow):
- **Downlink (Video Stream):** Pi Camera v2 ➔ H.264 Encoder บนชิป Pi ➔ MediaMTX ➔ WebRTC (WHEP) ➔ เบราว์เซอร์ PICO 4 (ภาพลื่นไหล ความหน่วงต่ำระดับมิลลิวินาที)
- **Uplink (Head Tracking):** เซนเซอร์วัดมุมบนแว่น WebXR ➔ ส่ง JSON `{"pan": ..., "tilt": ...}` ➔ `wss://<pi>:8000/ws` ➔ `control.py`
- **Hardware PWM Actuation:** `control.py` คำนวณความนุ่มนวล (Smooth Exponential) ➔ สั่งการขับเคลื่อน Hardware PWM บน GPIO12/13 ควบคุมมุม SG90 โดยตรง
- **Safety Feedbacks:** เมื่อหันหัวจนกล้องหมุนใกล้ถึงขอบจำกัด (Limit Margin) หน้าจอจะแสดงแถบสีแดง ส่งเสียงปี๊บ และสั่นเตือนที่คอนโทรลเลอร์

---

## สไลด์ที่ 9: PWM & Servo Engineering (วิศวกรรมการควบคุมเซอร์โว)

- **หมวดหมู่:** `PART 2: PAN/TILT SUBSYSTEM | PWM & SERVO ENGINEERING`
- **หัวข้อ:** วิศวกรรมการควบคุมเซอร์โว: Hardware PWM, พัลส์ และความปลอดภัย

### รายละเอียดทางวิศวกรรมทั้ง 3 ส่วน:
1. **ทำไมต้องเลือกใช้ Hardware PWM?**
   - ตัดปัญหาข้อจำกัดของ OS: ไลบรารี `pigpio` ถูกตัดออกจาก Debian 13 (Bookworm) รุ่นใหม่ ทำให้ไม่สามารถติดตั้งผ่าน apt ได้
   - สัญญาณนิ่งและแม่นยำ: Software PWM มักเกิดอาการกระตุกเมื่อ CPU ประมวลผลหนัก แต่ Hardware PWM ใช้ตัวนับสัญญาณของฮาร์ดแวร์โดยตรง
   - คอนฟิกใน Kernel Overlay: เพิ่มบรรทัด `dtoverlay=pwm-2chan,pin=12,func=4,pin2=13,func2=4` ใน `/boot/firmware/config.txt`
2. **Extended Pulse Calibration (การปรับขยายช่วงพัลส์):**
   - แก้ไขช่วงหมุนที่แคบเกินไป: เซอร์โว SG90 มักตอบสนองได้เพียงประมาณ 90° เมื่อใช้สัญญาณพัลส์มาตรฐาน 1.0–2.0 ms
   - ขยายช่วงพัลส์กว้างพิเศษ (0.6–2.4 ms): ฟังก์ชัน `duty_wide()` ปรับ Duty Cycle เป็น 3–12% ทำให้แกน Pan หมุนได้กว้างถึง 140° เพื่อให้ครอบคลุมระยะการหันหัวของมนุษย์
   - ตั้งขอบเขตที่ปลอดภัย: กำหนด `PAN_LIM = 70°` (หมุนซ้าย-ขวาข้างละ 70°) และ Tilt ก้มได้ถึง 50° และเงยได้ 30°
3. **Thermal & Gear Protection (การป้องกันมอเตอร์และความร้อน):**
   - ฟังก์ชัน `IDLE_STOP` (1.5 วินาที): สั่งตัดการส่งสัญญาณ PWM ทันทีที่เซอร์โวหยุดนิ่ง ช่วยลดความร้อนสะสมและยืดอายุเฟืองพลาสติก
   - Motion Smoothing: ใช้สมการ `cp += (tp - cp) * 0.5` เพื่อให้กล้องเคลื่อนที่อย่างนุ่มนวล ไม่กระชากสายตา
   - Isolated Power: แยกรางจ่ายไฟ 5V จ่ายให้กับเซอร์โวมอเตอร์โดยเฉพาะ และต่อสาย Ground ร่วมกับ Raspberry Pi เพื่อป้องกันสัญญาณรบกวน

---

## สไลด์ที่ 10: Lessons Learned & Field Operations (ปัญหาหน้างานและวิธีแก้ไข)

- **หมวดหมู่:** `PART 2: PAN/TILT SUBSYSTEM | LESSONS LEARNED`
- **หัวข้อ:** ปัญหาหน้างานและแนวทางแก้ไข (Troubleshooting & Fixes)

### 1. ปัญหาที่พบบ่อยและวิธีแก้ไข (Troubleshooting)
- **กล้องแจ้งเตือน Busy หรือ Timeout:** เกิดจากมีโปรเซสอื่นแย่งถือครองกล้อง (เช่น คำสั่ง `rpicam` ค้าง) แก้ไขโดยใช้ `pkill -9 rpicam` และให้สิทธิ์ MediaMTX เป็นผู้ถือครองกล้องแต่เพียงผู้เดียว
- **เซอร์โวร้อนจัดและสั่นค้าง:** เกิดจากสัญญาณ PWM ค้างหรือหมุนชนขอบสุดของเฟือง แก้ไขโดยเปิดใช้งาน `IDLE_STOP` 1.5 วินาที, ตั้ง Deadband 0.4° และลดค่า `PAN_LIM`
- **ระยะหันแคบเกินไป (~90°):** เกิดจากพัลส์ 1.0–2.0 ms สั้นเกินไป แก้ไขโดยปรับช่วงพัลส์เป็น 0.6–2.4 ms ในฟังก์ชัน `duty_wide()`
- **ภาพกระตุกและช้าในระบบ MJPEG:** การดึงภาพนิ่ง JPEG ผ่าน HTTP ซ้ำๆ กินแบนด์วิธสูง แก้ไขโดยย้ายมาใช้ระบบ WebRTC WHEP ผ่าน MediaMTX

### 2. ฟังก์ชันเสริมสำหรับการใช้งานจริง
- **ระบบเตือน 3 ประสาน (Multi-Sensory Boundary Alert):** แจ้งเตือนผู้ใช้ทันทีเมื่อหันหัวใกล้ถึงขอบจำกัดของมอเตอร์ (Margin 2°) ผ่าน 3 ช่องทางพร้อมกัน: แถบสีแดงบนจอ, เสียงบี๊บ 880 Hz, และการสั่น Haptic บนคอนโทรลเลอร์ PICO
- **ฟังก์ชัน Recenter อย่างรวดเร็ว:** ผู้ใช้สามารถกดปุ่ม Trigger บนคอนโทรลเลอร์ หรือกดปุ่ม `c` บนคีย์บอร์ดเพื่อรีเซ็ตจุดกึ่งกลางของมุมมองได้ทันทีโดยไม่ต้องถอดแว่น
- **รันเซอร์วิสอัตโนมัติ (Systemd):** ติดตั้งเซอร์วิส `pantilt-mediamtx` และ `pantilt-control` ให้เริ่มทำงานทันทีที่เปิดเครื่อง Raspberry Pi พร้อมใช้งานภาคสนาม

---

## สไลด์ที่ 11: Combined System Integration (การบูรณาการทั้งระบบ)

- **หมวดหมู่:** `FULL SYSTEM INTEGRATION | COMBINED SYSTEM`
- **หัวข้อ:** ภาพรวมการบูรณาการทั้งระบบ (RoverC Driving + Pan/Tilt Camera)

### 1. การผสาน 2 ซับซิสเต็มเข้าสู่ VEIL
- **Subsystem A: RoverC Base (PR #6):** ทำหน้าที่เป็นฐานล้อเคลื่อนที่ล้อ Mecanum ขับเคลื่อน 6 ทิศทาง รับคำสั่ง DRIVE จาก PICO 4 Joysticks ผ่าน Bridge
- **Subsystem B: Pan/Tilt Camera (PR #7):** ทำหน้าที่เป็นสายตาของหุ่นยนต์ สตรีมวิดีโอความหน่วงต่ำ และหันกล้องตามทิศทางศีรษะ (Head Pose)
- **Full Immersion Teleoperation:** สร้างประสบการณ์เสมือนจริงเต็มรูปแบบ ผู้ใช้สามารถ "หันมองสำรวจรอบตัว" ได้อย่างอิสระด้วยระบบ Pan/Tilt ในขณะที่ "มือบังคับทิศทางการเดินรถ" ด้วยคันโยก Mecanum

### 2. ตารางเปรียบเทียบการทำงานคู่ขนาน

| หัวข้อ | Subsystem การขับเคลื่อน (RoverC) | Subsystem มุมมองและกล้อง (Pan/Tilt) |
|---|---|---|
| **หน้าที่หลัก** | เคลื่อนที่ตัวรถ (Locomotion) | สายตาและการมองเห็น (Vision / Look) |
| **ฮาร์ดแวร์** | M5StickC Plus (ESP32) + ฐาน RoverC | Raspberry Pi 4 + Pi Cam v2 + SG90 ×2 |
| **โปรโตคอล** | CN360 Protocol v1 ➔ JSON WebSocket | WebRTC WHEP + WebSocket (`/ws`) |
| **สัญญาณควบคุม** | Joysticks + ปุ่ม Dead-man Grip บนคอนโทรลเลอร์ | เซนเซอร์ตรวจจับองศาศีรษะ (HMD Head Pose) |
| **สถานะการรวมโค้ด** | Merged เข้าสู่กิ่ง main เรียบร้อย (PR #6) | Merged เข้าสู่กิ่ง main เรียบร้อย (PR #7) |

---

## สไลด์ที่ 12: Next Steps & Team Roadmap (สรุปสถานะและแผนงานถัดไป)

- **หมวดหมู่:** `CN360 PROJECT SUMMARY | NEXT STEPS & ROADMAP`
- **หัวข้อ:** สรุปสถานะความคืบหน้าและแผนการดำเนินงานถัดไป

### ตัวชี้วัดความคืบหน้า (Progress Metrics):
- **PR #6 Done:** ควบคุมการขับขี่ RoverC ล้อ Mecanum จากแว่น PICO 4 ผ่าน Bridge พร้อมระบบ Failsafe ครบวงจร
- **PR #7 Done:** สตรีมวิดีโอสดผ่าน WebRTC และระบบกล้อง Pan/Tilt หันตามศีรษะด้วย Hardware PWM ทำงานได้สมบูรณ์
- **Zero Unity (100% WebXR):** พัฒนาบนเทคโนโลยีเว็บทั้งหมด เข้าถึงง่าย ไม่ต้องติดตั้งแอปพลิเคชันภายนอก
- **Next Goal:** รวมหน้าจอแสดงผลและระบบควบคุมเข้าไว้ใน VEIL UI หน้าเดียวอย่างสมบูรณ์

### แผนงานระยะถัดไป (Immediate Next Milestones):
1. **ผสานฟีด WebRTC เข้าสู่ VEIL UI:** นำสตรีม WebRTC WHEP จาก Raspberry Pi ไปแสดงผลในโดม Three.js เพื่อปลดล็อกปุ่ม `ENTER LIVE VR` บนหน้า Lobby
2. **รวมคำสั่งควบคุมให้เป็นชุดเดียว:** ปรับแต่งให้ VEIL ส่งคำสั่งควบคุมศีรษะ (HEAD) ควบคู่กับคำสั่งขับเคลื่อน (DRIVE) ภายใต้โปรโตคอลเดียวกัน
3. **ทดสอบภาคสนามแบบเต็มรูปแบบ:** ประกอบชุดติดตั้งกล้องเข้ากับตัวรถเพื่อทดสอบการขับขี่ไปพร้อมกับการหันมองภาพจริง ตรวจสอบความร้อนของมอเตอร์และอัตราการใช้พลังงาน
4. **ปรับปรุงเอกสาร System Architecture:** บันทึกข้อกำหนดและสเปกส่วนต่อขยายของ Protocol v1 ลงใน `_docs/protocol.md` อย่างเป็นทางการ
