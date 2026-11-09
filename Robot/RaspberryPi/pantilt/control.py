import json, os, threading, time
from flask import Flask, Response
from flask_sock import Sock
from rpi_hardware_pwm import HardwarePWM

PAN_LIM, TILT_LIM = 70, 30
TILT_UP, TILT_DOWN = 30, 50   # ค่าบวก = ก้ม
PAN_DIR, TILT_DIR = 1, 1
SMOOTH = 0.5
IDLE_STOP = 1.5

pan = HardwarePWM(0, 50, chip=0)    # GPIO12
tilt = HardwarePWM(1, 50, chip=0)   # GPIO13
lock = threading.Lock()
target = {"pan": 0.0, "tilt": 0.0}

def duty_wide(a, lo, hi):
    return 3.0 + (a - lo) / (hi - lo) * 9.0

def duty(a, lo, hi):
    return 5.0 + (a - lo) / (hi - lo) * 5.0   # 1.0-2.0 ms

def tduty(a):   # tilt: 0.8-2.2 ms
    return 4.0 + (a + 45) / 90 * 7.0

def servo_loop():
    cp = ct = 0.0
    last_move = time.time()
    running = False
    while True:
        with lock:
            tp, tt = target["pan"], target["tilt"]
        if abs(tp - cp) > 0.4 or abs(tt - ct) > 0.4:
            last_move = time.time()
            if not running:
                pan.start(duty_wide(PAN_DIR * cp, -90, 90))
                tilt.start(tduty(TILT_DIR * ct))
                running = True
            cp += (tp - cp) * SMOOTH
            ct += (tt - ct) * SMOOTH
            pan.change_duty_cycle(duty_wide(PAN_DIR * cp, -90, 90))
            tilt.change_duty_cycle(tduty(TILT_DIR * ct))
        elif running and time.time() - last_move > IDLE_STOP:
            pan.stop()
            tilt.stop()
            running = False
        time.sleep(0.01)

app = Flask(__name__)
sock = Sock(app)

@sock.route("/ws")
def ws(ws):
    while True:
        data = ws.receive()
        try:
            d = json.loads(data)
            p = max(-PAN_LIM, min(PAN_LIM, float(d["pan"])))
            t = max(-TILT_UP, min(TILT_DOWN, float(d["tilt"])))
            with lock:
                target["pan"], target["tilt"] = p, t
        except Exception:
            pass

@app.get("/vr")
def vr():
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "vr_rtc.html")
    with open(path, encoding="utf-8") as f:
        return Response(f.read(), mimetype="text/html")

if __name__ == "__main__":
    threading.Thread(target=servo_loop, daemon=True).start()
    try:
        app.run(host="0.0.0.0", port=8000, threaded=True, ssl_context="adhoc")
    finally:
        pan.stop()
        tilt.stop()
