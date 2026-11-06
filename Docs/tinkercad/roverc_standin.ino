// CN360 — Tinkercad stand-in for the M5Stack RoverC HAT (Arduino Uno + 2x L293D + 4 DC motors).
// I2C slave at 0x38; registers 0x00–0x03 = wheel speed FL/FR/RL/RR, int8 −127..127.
// Like the real board (as far as we know), it keeps the last speed until told otherwise,
// so stopping on a lost link is the ESP32's job.
#include <Wire.h>

const uint8_t ADDR = 0x38;
const uint8_t EN[4] = {3, 5, 6, 9};       // L293D enable (PWM)
const uint8_t IN_A[4] = {2, 7, 12, A0};
const uint8_t IN_B[4] = {4, 8, 13, A1};

volatile int8_t speed[4];
volatile bool changed = false;

void onReceive(int count) {
  if (count < 1) return;
  uint8_t reg = Wire.read();
  while (Wire.available()) {
    int8_t v = (int8_t)Wire.read();
    if (reg < 4) speed[reg] = v;
    reg++;
  }
  changed = true;
}

void setup() {
  for (uint8_t i = 0; i < 4; i++) {
    pinMode(EN[i], OUTPUT);
    pinMode(IN_A[i], OUTPUT);
    pinMode(IN_B[i], OUTPUT);
  }
  Serial.begin(9600);
  Wire.begin(ADDR);
  Wire.onReceive(onReceive);
  Serial.println(F("RoverC stand-in ready at 0x38"));
}

void loop() {
  if (!changed) return;
  int8_t s[4];
  noInterrupts();
  for (uint8_t i = 0; i < 4; i++) s[i] = speed[i];
  changed = false;
  interrupts();

  for (uint8_t i = 0; i < 4; i++) {
    digitalWrite(IN_A[i], s[i] > 0);
    digitalWrite(IN_B[i], s[i] < 0);
    analogWrite(EN[i], abs(s[i]) * 2);
  }
  Serial.print(F("wheels FL/FR/RL/RR = "));
  for (uint8_t i = 0; i < 4; i++) {
    Serial.print(s[i]);
    Serial.print(i < 3 ? '/' : '\n');
  }
}
