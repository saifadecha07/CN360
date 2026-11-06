// CN360 — Tinkercad stand-in for the ESP32: camera pan/tilt and lights only.
// The Serial Monitor plays the Raspberry Pi: type one command per line, e.g.
//   HEAD,1,45,-20,0      LIGHT,2,80,0      LIGHT,3,100,1
// Wiring: Pan D9, Tilt D10, yellow LED D5 and IR (red) LED D6, each through 220 ohm to GND.
// The robot drives its lights through MOSFETs; small LEDs in Tinkercad can hang off the pins.
#include <Servo.h>

const uint8_t PAN_PIN = 9, TILT_PIN = 10, LED_PIN = 5, IR_PIN = 6;

Servo pan, tilt;
char line[64];
uint8_t len = 0;
unsigned long lastByteAt = 0;

float clampf(float v, float lo, float hi) { return v < lo ? lo : (v > hi ? hi : v); }

void handle(char *msg) {
  char *f[6];
  uint8_t n = 0;
  for (char *t = strtok(msg, ","); t && n < 6; t = strtok(NULL, ",")) f[n++] = t;
  if (n == 0) return;

  if (!strcmp(f[0], "HEAD") && n == 5) {
    // yaw + = turn right, pitch + = look down (Docs/protocol convention)
    float yaw = clampf(atof(f[2]), -90, 90), pitch = clampf(atof(f[3]), -45, 45);
    pan.write(90 + yaw);
    tilt.write(90 + pitch);
    Serial.print(F("HEAD -> pan "));
    Serial.print(yaw);
    Serial.print(F(" deg, tilt "));
    Serial.print(pitch);
    Serial.println(F(" deg"));
  } else if (!strcmp(f[0], "LIGHT") && n == 4) {
    int duty = map(constrain(atoi(f[2]), 0, 100), 0, 100, 0, 255);
    bool ir = atoi(f[3]) == 1;
    analogWrite(LED_PIN, ir ? 0 : duty);
    analogWrite(IR_PIN, ir ? duty : 0);
    Serial.print(F("LIGHT -> "));
    Serial.print(ir ? F("IR ") : F("yellow "));
    Serial.print(constrain(atoi(f[2]), 0, 100));
    Serial.println('%');
  } else {
    Serial.print(F("ignored: "));
    Serial.println(f[0]);
  }
}

void setup() {
  Serial.begin(9600);
  pan.attach(PAN_PIN);
  tilt.attach(TILT_PIN);
  pan.write(90);
  tilt.write(90);
  pinMode(LED_PIN, OUTPUT);
  pinMode(IR_PIN, OUTPUT);
  Serial.println(F("CN360 ESP32 (pan/tilt + lights) ready. Type HEAD / LIGHT."));
}

void loop() {
  while (Serial.available()) {
    char c = Serial.read();
    lastByteAt = millis();
    if (c == '\n' || c == '\r') {
      if (len) { line[len] = 0; handle(line); len = 0; }
    } else if (len < sizeof(line) - 1) {
      line[len++] = c;
    }
  }
  // Tinkercad's Serial Monitor may send no newline: treat a 50 ms pause as end of line.
  if (len && millis() - lastByteAt > 50) { line[len] = 0; handle(line); len = 0; }
}
