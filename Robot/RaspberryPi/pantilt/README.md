# Pan/Tilt Camera — head tracking from PICO 4

กล้อง Raspberry Pi บนแกน pan/tilt (SG90 ×2) ที่หันตามหัวผู้สวม PICO 4 ผ่านเบราว์เซอร์ (WebXR) ไม่ต้องใช้ Unity
*A Pi camera on a 2-servo pan/tilt mount that follows the PICO 4 wearer's head, entirely in the browser (WebXR).*

## สถาปัตยกรรม

```text
PICO 4 browser (A-Frame / WebXR)  ──WebSocket wss://<pi>:8000/ws  {"pan":..,"tilt":..}──▶ control.py ──Hardware PWM──▶ SG90 ×2
        ▲
        └────────── WebRTC (WHEP) https://<pi>:8889/cam/whep ◀── MediaMTX ◀── Pi Camera v2 (H.264 ฮาร์ดแวร์)
```

- `control.py` — Flask + flask-sock, HTTPS (self-signed) พอร์ต 8000, หน้า VR ที่ `/vr`, รับมุมผ่าน WebSocket `/ws`
- `vr_rtc.html` — หน้า VR: แสดงวิดีโอ WebRTC, อ่านมุมหัว (yaw/pitch) ส่งไป `/ws`, แจ้งเตือนเมื่อหันถึงปลาย servo (แถบแดง + เสียง + สั่นที่คอนโทรลเลอร์)
- `mediamtx.yml` — ตั้งค่า MediaMTX ให้สตรีมกล้อง `cam` เป็น WebRTC
- `systemd/` — ให้ `mediamtx` และ `control.py` เริ่มเองตอนเปิดเครื่อง

> ไฟล์ `control.py` และ `vr_rtc.html` ต้องวางในโฟลเดอร์นี้ (ยังอยู่บน Pi: `~/control.py`, `~/vr_rtc.html`)

## อุปกรณ์และการต่อสาย

| ส่วน | รายละเอียด |
|---|---|
| บอร์ด | Raspberry Pi 4 (Raspberry Pi OS / Debian 13) |
| กล้อง | Pi Camera v2 (imx219) |
| Servo | SG90 ×2 (ฟันเฟืองพลาสติก ระวังชนปลาย) |
| Pan | GPIO12 (pin 32) = PWM channel 0 |
| Tilt | GPIO13 (pin 33) = PWM channel 1 |
| ไฟ | servo ควรใช้ไฟ 5V แยก และต่อ GND ร่วมกับ Pi |

`/boot/firmware/config.txt` (ใต้ `[all]`) แล้ว reboot:

```ini
dtoverlay=pwm-2chan,pin=12,func=4,pin2=13,func2=4
```

ใช้ Hardware PWM (`rpi-hardware-pwm`) แทน software PWM เพราะสัญญาณนิ่งกว่า servo ไม่สั่น และ `pigpio` ติดตั้งผ่าน apt ไม่ได้บน OS รุ่นใหม่

## ติดตั้ง

```bash
python3 -m venv --system-site-packages ~/servo-env
source ~/servo-env/bin/activate
pip install -r requirements.txt

# MediaMTX v1.21.3 (linux arm64) -> ~/mediamtx/
cp mediamtx.yml ~/mediamtx/mediamtx.yml
cd ~/mediamtx && openssl req -x509 -newkey rsa:2048 -nodes -keyout server.key -out server.crt -days 365 -subj "/CN=raspi"
```

## รัน

กล้องเปิดได้ทีละโปรเซสเท่านั้น (MediaMTX เป็นเจ้าของกล้อง) อย่ารัน `rpicam-*` หรือ picamera2 ขณะนี้

```bash
# เทอร์มินัล 1
cd ~/mediamtx && ./mediamtx
# เทอร์มินัล 2
source ~/servo-env/bin/activate && python ~/control.py
```

จาก PICO Browser เปิด `https://<pi-ip>:8000/vr` (ยอมรับใบรับรอง self-signed ทั้งพอร์ต 8000 และ 8889 ก่อน) แล้วกด Enter VR
กด trigger หรือ `c` เพื่อ recenter ทิศหัว

เริ่มอัตโนมัติ:

```bash
sudo cp systemd/*.service /etc/systemd/system/
sudo systemctl enable --now pantilt-mediamtx pantilt-control
```

(แก้ `User` และ path ใน service ถ้าไม่ได้ใช้ user `raspi`)

## ค่าที่ปรับได้

ต้องตั้งให้ตรงกันทั้ง `control.py` และ `vr_rtc.html`

| ค่า | ความหมาย |
|---|---|
| `PAN_LIM` | มุม pan สูงสุดแต่ละข้าง (°) |
| `TILT_UP`, `TILT_DOWN` | ช่วง tilt เงย/ก้ม (ค่าบวก = ก้ม) |
| `PAN_DIR`, `TILT_DIR` / `INVERT_PAN`, `INVERT_TILT` | กลับทิศ (ที่ใช้อยู่เป็น `true` ทั้งคู่ในหน้า VR) |
| `SMOOTH` | ความนุ่มของการเคลื่อน (0.3–0.5) |
| `IDLE_STOP` | หยุดส่ง PWM เมื่อไม่ขยับ (วินาที) ลดความร้อน/สั่น |
| ความกว้างพัลส์ | pan 0.6–2.4 ms (duty 3–12 %) ผ่าน `duty_wide`; tilt 1–2 ms (duty 5–10 %) |

SG90 ตอบสนองแค่ราว 90° เมื่อใช้พัลส์ 1–2 ms แต่หมุนมือได้ราว 180° จึงขยายพัลส์ของ pan เป็น 0.6–2.4 ms เพื่อให้ถึงช่วงหัวคน (ตั้ง `PAN_LIM = 70` ≈ 140° รวม) — **ค่านี้ยังต้องสอบเทียบกับเครื่องจริง**

## ข้อควรระวัง servo

- ถ้า servo ครืด ๆ หรือสั่นค้างที่ปลาย แปลว่าชนจุดสุด ให้ลด `PAN_LIM` ทันที (SG90 เคยร้อนจนไหม้เมื่อถูกดันค้าง)
- ใช้ `IDLE_STOP` เพื่อตัด PWM เมื่อหยุดนิ่ง
- ไฟ 5V แยกจาก Pi + GND ร่วม

## ปัญหาที่เจอและวิธีแก้

| อาการ | สาเหตุ | แก้ |
|---|---|---|
| `pigpio` ไม่มีให้ติดตั้ง | ถูกตัดออกจาก repo รุ่นใหม่ | ใช้ Hardware PWM |
| `SyntaxError` ตอนวางโค้ดใน nano | nano เติมการเยื้องเพี้ยน | สร้างไฟล์ด้วย `cat > file << 'EOF'` |
| กล้อง `timed out` / `no cameras available` | สายแพไม่แน่น | เสียบสายใหม่ทั้งสองฝั่ง |
| `Device or resource busy` | โปรเซสอื่นถือกล้อง (เช่น `rpicam-still` ค้าง) | `pkill -9 rpicam-still`; รันได้ทีละโปรเซส |
| `ERR_TUNNEL_CONNECTION_FAILED` (Windows) | proxy ระบบ | ยกเว้น proxy สำหรับ IP ของ Pi |
| หน้า `/` ได้ 404 | ไม่มี route | เข้า `/vr` |
| `ModuleNotFoundError: flask` | ไม่ได้เปิด venv | `source ~/servo-env/bin/activate` |
| servo ร้อน/สั่น | PWM ค้าง / ชนปลาย / ไฟไม่พอ | deadband, `IDLE_STOP`, จำกัดมุม, ไฟแยก |
| pan หมุนได้แค่ ~90° | พัลส์ 1–2 ms แคบเกิน | ใช้พัลส์ 0.6–2.4 ms (`duty_wide`) |
| ภาพกระตุก/ค้างแบบ MJPEG | ดึงภาพผ่าน HTTP ช้า | ย้ายเป็น WebRTC ผ่าน MediaMTX |

## เวอร์ชันเก่า (MJPEG)

`webcam.py` + `vr.html` — Flask + picamera2 ส่ง `/snapshot.jpg` และ POST `/api/move` ใช้ร่วมกับ MediaMTX ไม่ได้ (แย่งกล้อง) ถูกแทนที่ด้วยสถาปัตยกรรมข้างบนแล้ว
