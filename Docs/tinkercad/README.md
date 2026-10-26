# วงจรจำลอง CN360 ใน Tinkercad

Tinkercad Circuits ไม่มี ESP32, Raspberry Pi และ M5Stack RoverC จึงใช้ของแทนตามตารางนี้ (ตั้งชื่อชิ้นส่วนใน Tinkercad ตามคอลัมน์ "ชื่อ" เพื่อให้อ่านผังรู้เรื่อง)

| ของจริง | ของแทนใน Tinkercad | ชื่อ |
|---|---|---|
| Raspberry Pi (ส่งคำสั่งทาง UART) | Serial Monitor ของ Uno ตัวที่ 1 | — |
| ESP32 DevKit | Arduino Uno R3 + `esp32_standin.ino` | `ESP32` |
| M5Stack RoverC (STM32 @ I2C 0x38) | Arduino Uno R3 + `roverc_standin.ino` + L293D ×2 | `RoverC` |
| มอเตอร์ล้อ mecanum ×4 | DC Motor ×4 | `FL` `FR` `RL` `RR` |
| แบต 16340 ของ RoverC | Battery 4×AA (6V) | `RoverC battery` |
| servo SG90 pan/tilt | Micro Servo ×2 | `Pan` `Tilt` |
| LED ส่องสว่าง / IR LED + MOSFET | LED เหลือง + LED แดง, nMOSFET ×2 | `LED` `IR` |

โค้ดใช้โปรโตคอลจริงของโปรเจกต์ (`DRIVE` / `HEAD` / `LIGHT`), สูตร mecanum และ failsafe แบบเดียวกับ [esp32-pinout.md](../esp32-pinout.md) ต่างกันแค่ failsafe ตั้งไว้ 3 วินาที (ของจริง 300 ms) เพื่อให้พิมพ์คำสั่งทันเห็นล้อหมุน

## เวอร์ชันโชว์ตอนนี้: ต่อแค่ ESP32

ต่อเฉพาะ Uno `ESP32` + servo ×2 + LED ×2 (หัวข้อ 2 ด้านล่าง) ใช้โค้ด `esp32_standin.ino` ตามเดิมโดยปล่อย `ROVERC_CONNECTED = false` ไว้ — คำสั่ง `DRIVE` จะพิมพ์ความเร็ว 4 ล้อที่จะส่งให้ RoverC ออกทาง Serial แทนการส่ง I2C จริง ส่วน RoverC และมอเตอร์ (หัวข้อ 1 และ 3) เก็บไว้ต่อทีหลัง

## รายการชิ้นส่วน

Arduino Uno R3 ×2, Breadboard ×1, L293D ×2, DC Motor ×4, Battery 4×AA ×1, Micro Servo ×2, nMOSFET ×2, LED เหลือง ×1, LED แดง ×1, ตัวต้านทาน 220 Ω ×2, ตัวต้านทาน 10 kΩ ×2

## การต่อสาย

### 1. ESP32 (Uno ตัวที่ 1) ↔ RoverC (Uno ตัวที่ 2) — I2C

| ESP32 | RoverC | |
|---|---|---|
| A4 (SDA) | A4 (SDA) | |
| A5 (SCL) | A5 (SCL) | |
| GND | GND | GND ร่วม ไม่ต่อไฟเลี้ยงข้ามบอร์ด เหมือนของจริง |

### 2. ESP32 → servo และไฟ

| ESP32 | ต่อกับ |
|---|---|
| D9 | Pan signal |
| D10 | Tilt signal |
| 5V / GND | servo ทั้งสองตัว (ของจริงใช้ 5V แยก) |
| D5 | gate MOSFET ตัวที่ 1 (+ 10 kΩ ลง GND) |
| D6 | gate MOSFET ตัวที่ 2 (+ 10 kΩ ลง GND) |

MOSFET แต่ละตัว: source → GND, drain → ขาแคโทด LED, ขาแอโนด LED → 220 Ω → 5V (ตัวที่ 1 = LED เหลือง, ตัวที่ 2 = LED แดงแทน IR)

### 3. RoverC → L293D → มอเตอร์

ขา L293D: 1 = EN1, 2 = 1A, 3 = 1Y, 6 = 2Y, 7 = 2A, 9 = EN2, 10 = 3A, 11 = 3Y, 14 = 4Y, 15 = 4A, 16 = VCC1 (5V), 8 = VCC2 (ไฟมอเตอร์), 4/5/12/13 = GND

| L293D | ขา | RoverC Uno / อื่น ๆ |
|---|---|---|
| ตัวที่ 1 | 1 EN1 | D3 |
| | 2 1A / 7 2A | D2 / D4 |
| | 3, 6 | มอเตอร์ **FL** |
| | 9 EN2 | D5 |
| | 10 3A / 15 4A | D7 / D8 |
| | 11, 14 | มอเตอร์ **FR** |
| ตัวที่ 2 | 1 EN1 | D6 |
| | 2 1A / 7 2A | D12 / D13 |
| | 3, 6 | มอเตอร์ **RL** |
| | 9 EN2 | D9 |
| | 10 3A / 15 4A | A0 / A1 |
| | 11, 14 | มอเตอร์ **RR** |
| ทั้งสองตัว | 16 | 5V ของ RoverC Uno |
| | 8 | ขั้ว + ของแบต 4×AA |
| | 4, 5, 12, 13 | GND (ต่อขั้ว − ของแบตกับ GND ของ Uno ด้วย) |

## ใส่โค้ด

1. คลิก Uno ตัวที่ 1 → Code → Text → วางโค้ดจาก [esp32_standin.ino](esp32_standin.ino)
2. คลิก Uno ตัวที่ 2 → วางโค้ดจาก [roverc_standin.ino](roverc_standin.ino)
3. Start Simulation → เปิด Serial Monitor ของ Uno ตัวที่ 1

## คำสั่งสำหรับโชว์

| พิมพ์ | ผลที่เห็น |
|---|---|
| `DRIVE,1,0.5,0,1` | ล้อทั้ง 4 หมุนไปข้างหน้า |
| `DRIVE,2,0,1,2` | ล้อซ้ายหมุนหน้า ล้อขวาหมุนหลัง (หมุนตัวขวา) |
| `DRIVE,3,0,0,1,1` | FL/RR หมุนหน้า FR/RL หมุนหลัง (ไถลไปทางขวา — ข้อเสนอ `strafe` v1.1) |
| รอ 3 วินาที | Serial แสดง `FAILSAFE` แล้วล้อทุกล้อหยุด |
| `HEAD,4,45,-20,0` | servo pan หันขวา 45°, tilt เงยขึ้น 20° |
| `LIGHT,5,80,0` | LED เหลืองติด 80 % |
| `LIGHT,6,100,1` | สลับเป็น LED แดง (โหมด IR) |
