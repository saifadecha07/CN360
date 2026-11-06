# Raspberry Pi Pinout และการต่อสาย

> อัปเดตล่าสุด: 2026-11-02 · เจ้าของ: รอแบ่งงานใหม่ (`WORKING_PROCESS.md` §1)
> เปลี่ยนขาหรือ address ต้องประกาศในแชททีม **ก่อน** แก้โค้ด (`WORKING_PROCESS.md` ข้อ 2.2)
> ที่มา: [`system-design.md`](system-design.md) ข้อ 7 · รายการอุปกรณ์: [`hardware.md`](hardware.md)

## ภาพรวม

**Raspberry Pi 4B บอร์ดเดียวคุมทุกอย่าง** ไม่มี ESP32 แล้ว ล้อขับด้วย **M5Stack RoverC** (mecanum 4 ล้อ) ซึ่งมีชิป STM32 ขับมอเตอร์อยู่ในตัว Pi แค่เขียนความเร็วแต่ละล้อผ่าน I2C

```text
[ Raspberry Pi 4B ]
     ├── CSI  ← กล้องหน้า Camera Module 3
     ├── USB  ← กล้องหลัง ~160°
     ├── I2C bus 1 (GPIO2 SDA, GPIO3 SCL, GND ร่วม)
     │        ├── RoverC (STM32 @ 0x38) → มอเตอร์ N20 ×4 mecanum
     │        └── ADS1115 (@ 0x48) ← ตัวแบ่งแรงดันแบต 2S
     └── sysfs → LED ACT บนบอร์ด (คำสั่ง LIGHT)
```

## ตารางขา Pi

| หน้าที่ | GPIO (ขา header) | หมายเหตุ |
|---|---|---|
| I2C SDA → RoverC + ADS1115 | 2 (ขา 3) | bus `/dev/i2c-1`, มี pull-up 1.8 kΩ ไป 3.3 V บนบอร์ด |
| I2C SCL → RoverC + ADS1115 | 3 (ขา 5) | เริ่มที่ 100 kHz |
| 3.3 V → ADS1115 VDD | — (ขา 1) | |
| GND | — (ขา 6) | GND ร่วม: แบต 2S, Pi, ADS1115, RoverC |

- เปิด I2C ด้วย `raspi-config` แล้วตรวจด้วย `i2cdetect -y 1` ต้องเห็น `38` และ `48`
- ต่อ RoverC แค่ SDA, SCL, GND **ห้าม**ป้อนไฟเข้าขา 5V ของ HAT จนกว่าจะรู้ว่าขานั้นรับไฟเข้าได้
- วัดก่อนว่า SDA/SCL ของ RoverC เป็น 3.3 V ถ้า pull-up ไป 5 V ต้องใส่ level shifter
- LED ACT ไม่ใช้ขา header: ตั้ง `/sys/class/leds/ACT/trigger` เป็น `none` แล้วเขียน `brightness` `1`/`0` และคืน trigger เดิม (`mmc0`) ตอนปิด (kernel เก่าบางรุ่นชื่อ `led0`)

## RoverC

| เรื่อง | ค่า | สถานะ |
|---|---|---|
| Bus | I2C 3.3 V, address `0x38` | ⚠️ ยืนยันด้วย `i2cdetect` |
| ความเร็วล้อ | register `0x00`–`0x03` = ล้อ 1–4, int8 −127..127 | ⚠️ ยืนยันลำดับล้อด้วยการเขียนทีละ register |
| ไฟ | แบต 16340 ของ RoverC เอง ขับมอเตอร์อย่างเดียว | จ่ายไฟให้ Pi ไม่ได้ |
| ไม่มีคำสั่งใหม่ | หยุดล้อเอง (failsafe ชั้น 2) | ✅ ทดสอบแล้ว (H-2, 2026-10-26) — ยังต้องวัดเวลาเป็น ms |

**ทดสอบครั้งแรก** (ยกหุ่นให้ล้อลอย, H-1):
1. `i2cdetect -y 1` ต้องเจอ `0x38`
2. เขียน `30` ลงทีละ register `0x00`–`0x03` แล้วจดว่าล้อไหนหมุน ทิศไหน
3. ใส่ตำแหน่งล้อที่วัดได้ลงตารางด้านล่าง

| Register | ล้อ | ค่าบวก = หมุนไปข้างหน้า? |
|---|---|---|
| `0x00` | ? | ? |
| `0x01` | ? | ? |
| `0x02` | ? | ? |
| `0x03` | ? | ? |

## ADS1115

| เรื่อง | ค่า |
|---|---|
| Address | `0x48` (ADDR ต่อ GND) |
| ไฟเลี้ยง | 3.3 V จาก Pi (ขา 1) |
| ขาวัด | A0 ← ตัวแบ่งแรงดัน 100 kΩ / 33 kΩ จากแบต 2S (8.4 V → 2.08 V) แรงดันที่ A0 ห้ามเกิน 3.3 V |

## Mecanum mixing (คำนวณบน Pi ใน `drive.py`)

`DRIVE` ใน protocol v1 มี `linear` (หน้า +) และ `angular` (เลี้ยวขวา +) ช่วง −1..1 ยังไม่มีแกนเดินข้าง (`strafe` เป็นข้อเสนอ v1.1 รอทีม approve) สูตรจากไลบรารี M5-RoverC เมื่อ strafe = 0:

```text
y = linear  × max_speed      (−100..100)
z = angular × max_speed

wheel[0] = clamp(y − z)      wheel[1] = clamp(y + z)
wheel[2] = clamp(y − z)      wheel[3] = clamp(y + z)
```

`max_speed` มาจาก `speed_mode` (รอทีมตัดสิน `system-design.md` ข้อ 9) จับคู่ wheel[0..3] กับ register ตามตารางที่วัดได้ข้างบน

## Failsafe

- ชั้น 1 (Pi): WebSocket ปิด หรือไม่มี `DRIVE` เกิน 300 ms → เขียน `0` ลง `0x00`–`0x03` และเขียนซ้ำทุกรอบ drive loop (50 Hz) จนกว่าจะมีคำสั่งใหม่
- ชั้น 2 (RoverC): ไม่ได้รับ I2C → หยุดล้อเอง ไม่พึ่ง Pi
