// CN360 — Tinkercad stand-in for the ESP32 firmware (Arduino Uno).
// The Serial Monitor plays the Raspberry Pi: type one command per line, e.g.
//   DRIVE,1,0.5,0,1      HEAD,2,30,-10,0      LIGHT,3,80,0
// On the robot this is UART2 at 115200 with a 300 ms failsafe. See Docs/esp32-pinout.md.
#include <Wire.h>
#include <Servo.h>

const uint8_t ROVERC_ADDR = 0x38;
const bool ROVERC_CONNECTED = false;  // true once the RoverC Uno is wired to A4/A5; until then wheel speeds are only printed
const unsigned long FAILSAFE_MS = 3000;  // 300 on the robot; longer here so typed commands stay visible
const uint8_t PAN_PIN = 9, TILT_PIN = 10, LED_PIN = 5, IR_PIN = 6;

Servo pan, tilt;
char line[64];
uint8_t len = 0;
unsigned long lastByteAt = 0, lastCmdAt = 0;
bool stopped = true;

float clampf(float v, float lo, float hi) { return v < lo ? lo : (v > hi ? hi : v); }

void writeWheels(const int8_t s[4]) {
  if (!ROVERC_CONNECTED) return;
  Wire.beginTransmission(ROVERC_ADDR);
  Wire.write((uint8_t)0x00);  // first wheel register; RoverC auto-increments
  for (uint8_t i = 0; i < 4; i++) Wire.write((uint8_t)s[i]);
  Wire.endTransmission();
}

void stopWheels() {
  const int8_t zero[4] = {0, 0, 0, 0};
  writeWheels(zero);
}

// Mecanum mixing: linear + = forward, angular + = turn right, strafe + = right.
void drive(float linear, float angular, int mode, float strafe) {
  float w[4] = {
    linear + strafe + angular,  // FL
    linear - strafe - angular,  // FR
    linear - strafe + angular,  // RL
    linear + strafe - angular,  // RR
  };
  float peak = 1;
  for (uint8_t i = 0; i < 4; i++) if (fabs(w[i]) > peak) peak = fabs(w[i]);
  float scale = (mode == 2 ? 1.0 : 0.6) / peak;
  int8_t s[4];
  for (uint8_t i = 0; i < 4; i++) s[i] = (int8_t)round(w[i] * scale * 127);
  writeWheels(s);

  Serial.print(F("DRIVE -> RoverC FL/FR/RL/RR = "));
  for (uint8_t i = 0; i < 4; i++) {
    Serial.print(s[i]);
    Serial.print(i < 3 ? '/' : '\n');
  }
}

void handle(char *msg) {
  char *f[7];
  uint8_t n = 0;
  for (char *t = strtok(msg, ","); t && n < 7; t = strtok(NULL, ",")) f[n++] = t;
  if (n == 0) return;

  if (!strcmp(f[0], "DRIVE") && (n == 5 || n == 6)) {
    float strafe = n == 6 ? clampf(atof(f[5]), -1, 1) : 0;  // v1.1 proposal; absent = 0
    drive(clampf(atof(f[2]), -1, 1), clampf(atof(f[3]), -1, 1), atoi(f[4]), strafe);
    stopped = false;
  } else if (!strcmp(f[0], "HEAD") && n == 5) {
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
    Serial.print(atoi(f[2]));
    Serial.println('%');
  } else {
    Serial.print(F("ignored: "));
    Serial.println(f[0]);
    return;
  }
  lastCmdAt = millis();
}

void setup() {
  Serial.begin(9600);
  Wire.begin();
  pan.attach(PAN_PIN);
  tilt.attach(TILT_PIN);
  pan.write(90);
  tilt.write(90);
  pinMode(LED_PIN, OUTPUT);
  pinMode(IR_PIN, OUTPUT);
  stopWheels();
  Serial.println(F("CN360 ESP32 stand-in ready. Type DRIVE / HEAD / LIGHT."));
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

  if (!stopped && millis() - lastCmdAt > FAILSAFE_MS) {
    stopWheels();
    stopped = true;
    Serial.println(F("FAILSAFE: no command, wheels stopped"));
  }
}
