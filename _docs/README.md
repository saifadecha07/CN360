# เอกสารประกอบการพัฒนา CN360 Robot Rescue VR (`_docs/`)

หน้านี้เป็นสารบัญรวบรวมเอกสารทางเทคนิค ข้อกำหนดสถาปัตยกรรม แผนผังวงจร และโปรโตคอลการสื่อสารทั้งหมดของโปรเจกต์

---

## 1. สถาปัตยกรรมระบบและโครงสร้างโค้ด (Architecture & Codebase)

* **[แผนผังสถาปัตยกรรมระบบและสารบัญไฟล์ทั้งหมด (system-architecture-map.md)](system-architecture-map.md)**
  * แผนผังการเชื่อมโยงระบบ (System Architecture) จาก PICO 4 VR สู่ Raspberry Pi และ M5Stack RoverC
  * สารบัญไฟล์โค้ดทั้งหมด พร้อมคำอธิบายหน้าที่การทำงานทีละไฟล์
* **[การออกแบบสถาปัตยกรรมระบบ (system-design.md)](system-design.md)**
  * รายละเอียดการปรับสถาปัตยกรรมมาใช้ Raspberry Pi เดี่ยว ควบคุมฮาร์ดแวร์โดยตรง (ยกเลิก ESP32)
  * การเปรียบเทียบสเปก การคำนวณพลังงาน และการลดความหน่วง (Latency)

---

## 2. โปรโตคอลการสื่อสาร (Communication Protocols)

* **[ข้อกำหนดคำสั่ง Protocol v1 (protocol.md)](protocol.md)**
  * รูปแบบคำสั่งการเคลื่อนที่ `DRIVE,seq,linear,angular,boost,strafe` รองรับ Mecanum Holonomic Drive
  * คำสั่งมุมมองกล้อง `HEAD,seq,yaw,pitch,roll` และคำสั่งควบคุมไฟ `LIGHT,seq,level`
  * การตอบกลับสถานะของหุ่นยนต์ `STATUS` และกฎความปลอดภัย (Watchdog & Failsafe)

---

## 3. ฮาร์ดแวร์และการต่อสาย (Hardware & Wiring)

* **[แผนผังขาและการเชื่อมต่อ Raspberry Pi (pi-pinout.md)](pi-pinout.md)**
  * การต่อ I2C Bus (`0x38` RoverC, `0x48` ADS1115 Battery ADC)
  * การต่อ Hardware PWM (GPIO 12/13) สำหรับ Servo SG90 แพน/ทิลต์
  * ไฟแสดงสถานะ On-board ACT LED
* **[ข้อมูลจำเพาะฮาร์ดแวร์และรายการอุปกรณ์ (hardware.md)](hardware.md)**
  * รายการส่วนประกอบทั้งหมด (Bill of Materials - BOM)
  * การจ่ายพลังงานและข้อควรระวังเกี่ยวกับระดับแรงดันไฟฟ้า

---

## 4. ระบบสตรีมมิ่งวิดีโอ (Video Streaming System)

* **[คู่มือภาพรวมการสตรีมมิ่ง (streaming/README.md)](streaming/README.md)**
  * สถาปัตยกรรม WebRTC (WHEP) และ RTSP จาก Raspberry Pi สู่ PICO 4
* **[การติดตั้งและเซิร์ฟเวอร์คลาวด์ (streaming/deployment.md)](streaming/deployment.md)**
  * การติดตั้ง MediaMTX, Caddy, Turn Server (Coturn) ด้วย Docker Compose
* **[ความปลอดภัยและการยืนยันตัวตน (streaming/security.md)](streaming/security.md)**
  * การใช้งาน JWT Tokens, JWKS และการจำกัดสิทธิ์ผู้ควบคุม
* **[การทดสอบและผลลัพธ์ประสิทธิภาพ (streaming/test-report.md)](streaming/test-report.md)**
  * ผลการทดสอบ Latency, Bitrate และความเสถียรของวิดีโอ
* **[การแก้ปัญหาที่พบบ่อย (streaming/troubleshooting.md)](streaming/troubleshooting.md)**
  * วิธีวิเคราะห์และแก้ไขปัญหาเมื่อภาพไม่ขึ้นหรือ WebRTC หลุดการเชื่อมต่อ

---

## 5. แหล่งอ้างอิงและการทดลองดั้งเดิม (Reference & Prototypes)

* **[วงจรจำลองและการทดสอบ (tinkercad/README.md)](tinkercad/README.md)**
  * วงจรจำลองบน Tinkercad และโค้ดสเก็ตช์อ้างอิง
* **[โจทย์และข้อกำหนดทางเทคนิค (platform-prompt.md)](platform-prompt.md)**
  * ขอบเขตการทำงาน ความต้องการของระบบกู้ภัยพื้นที่แคบ
* **[เอกสารข้อกำหนดเดิม (robot 1.5.txt)](robot%201.5.txt)**
  * เอกสารสรุปข้อกำหนดรุ่นเริ่มต้น
