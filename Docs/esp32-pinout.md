# ESP32 Pinout และการต่อสาย

> อัปเดตล่าสุด: 2026-10-26 · เจ้าของ: เม่น (ESP32) + นัท (UART / ไฟเลี้ยง)
> เปลี่ยนขาหรือ baud rate ต้องประกาศในแชททีม **ก่อน** แก้โค้ด (WORKING_PROCESS.md ข้อ 2.2)

## ภาพรวม

ล้อขับด้วย **M5Stack RoverC HAT** (ล้อ mecanum 4 ล้อ) ซึ่งมีชิป STM32 ขับมอเตอร์อยู่ในตัวแล้ว ESP32 จึงไม่ต้องขับมอเตอร์เอง แค่สั่งความเร็วแต่ละล้อผ่าน I2C — แผนเดิมที่ใช้ TB6612FNG + มอเตอร์ N20/TT ถูกตัดออก

```text
[ Raspberry Pi 4 ] ── กล้อง CSI/USB → video_publisher → MediaMTX
     │ UART 115200: GPIO14 (TX) → ESP32 GPIO16 (RX2)
     │              GPIO15 (RX) ← ESP32 GPIO17 (TX2), GND ร่วม
     ▼
[ ESP32 DevKit ]
     ├── I2C (GPIO21 SDA, GPIO22 SCL, GND ร่วม) → ช่อง Grove ของ RoverC
     │        → RoverC (STM32 @ 0x38) → มอเตอร์ 4 ล้อ mecanum
     ├── PWM → servo pan/tilt กล้อง (SG90 ×2, ไฟ 5V แยก)
     └── PWM → MOSFET → LED / IR LED
```

ESP32 อยู่ตรงกลางแทนที่จะให้ Pi คุย I2C กับ RoverC ตรง ๆ เพราะ failsafe 300 ms ต้องอยู่บนบอร์ดที่ต่อกับมอเตอร์ ถ้าสาย UART หลุดหรือ Pi ค้าง ESP32 ยังเขียนความเร็ว 0 ลง RoverC ได้

## ตารางขา ESP32

| ESP32 | ต่อกับ | หมายเหตุ |
|---|---|---|
| GPIO16 (RX2) | Pi GPIO14 (TXD, ขา 8) | UART2, 115200 8N1 |
| GPIO17 (TX2) | Pi GPIO15 (RXD, ขา 10) | |
| GND | Pi GND (ขา 6) | ต้องต่อ GND ร่วม |
| GPIO21 (SDA) | RoverC Grove SDA | I2C 3.3V, 100 kHz |
| GPIO22 (SCL) | RoverC Grove SCL | |
| GND | RoverC Grove GND | **ห้าม**ต่อเส้น 5V ของ Grove เข้า ESP32 |
| GPIO25 | servo pan (yaw) | PWM 50 Hz |
| GPIO26 | servo tilt (pitch) | PWM 50 Hz |
| GPIO27 | MOSFET LED ปกติ | PWM ความสว่าง 0–100 % |
| GPIO32 | MOSFET IR LED | `vision_mode = 1` |

> ขา servo/LED เป็นค่าเสนอ เม่นปรับได้ แต่ต้องอัปเดตตารางนี้ใน PR เดียวกัน

## RoverC HAT

รุ่นที่มีคือ **RoverC ธรรมดา** (ไม่ใช่ Pro) — ไม่มีช่อง servo ดังนั้น servo pan/tilt ยังต่อกับ ESP32

| เรื่อง | ค่า | สถานะ |
|---|---|---|
| Bus | I2C 3.3V, address `0x38` | ⚠️ ยืนยันด้วย I2C scan |
| ความเร็วล้อ | register `0x00`–`0x03` = ล้อ 1–4, int8 −127..127 | ⚠️ ยืนยันลำดับล้อด้วยการเขียนทีละ register |
| ไฟ | แบต 16340 ของ RoverC เอง ขับมอเตอร์อย่างเดียว | จ่ายไฟให้ Pi ไม่ได้ |
| ไม่มีคำสั่งใหม่ | น่าจะหมุนต่อด้วยค่าล่าสุด | ⚠️ ทดสอบ — ถ้าจริง failsafe บน ESP32 สำคัญมาก |

ค่าที่มี ⚠️ มาจากเอกสาร M5Stack ยังไม่ได้วัดกับบอร์ดจริง ให้เม่นยืนยันแล้วแก้สถานะเป็น ✅

**ทดสอบครั้งแรก** (ยกหุ่นให้ล้อลอย):
1. I2C scan ต้องเจอ `0x38`
2. เขียน `30` ลงทีละ register `0x00`–`0x03` แล้วจดว่าล้อไหนหมุน ทิศไหน
3. ใส่ตำแหน่งล้อที่วัดได้ลงตารางด้านล่าง

| Register | ล้อ | ค่าบวก = หมุนไปข้างหน้า? |
|---|---|---|
| `0x00` | ? | ? |
| `0x01` | ? | ? |
| `0x02` | ? | ? |
| `0x03` | ? | ? |

## Mecanum mixing

`DRIVE` ใน protocol v1 มี `linear` (หน้า +) และ `angular` (เลี้ยวขวา +) ช่วง −1..1 ล้อ mecanum ไปด้านข้างได้ด้วย (`strafe`, ขวา +) ซึ่งยังเป็นข้อเสนอ v1.1 รอทีม approve — ระหว่างนี้ให้ใช้ `strafe = 0`

```text
FL = linear + strafe + angular
FR = linear − strafe − angular
RL = linear − strafe + angular
RR = linear + strafe − angular
```

หารทุกค่าด้วยค่าสัมบูรณ์ที่มากที่สุดถ้าเกิน 1 แล้วคูณ scale ตาม `speed_mode` ก่อนแปลงเป็น int8 จับคู่ FL/FR/RL/RR กับ register ตามตารางที่วัดได้ข้างบน

## Failsafe

ไม่ได้รับคำสั่งทาง Serial เกิน 300 ms → เขียน `0` ลง `0x00`–`0x03` ทันที และเขียนซ้ำทุกรอบ watchdog จนกว่าจะมีคำสั่งใหม่ (เผื่อ I2C ครั้งแรกพลาด)
