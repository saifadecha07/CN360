/** Robot component catalogue. Hardware facts come from _docs/robot 1.5.txt, _docs/hardware.md, _docs/pi-pinout.md, plan.md and WORKING_PROCESS.md. */
import type { TestId } from "../app/store";

export type PartId = "camera" | "pantilt" | "drive" | "lights" | "compute" | "mcu" | "power";

export interface PartInfo {
  id: PartId;
  name: string;
  hardware: string;
  summary: string;
  test?: TestId;
}

export const PARTS: PartInfo[] = [
  { id: "camera", name: "Camera", hardware: "Pi Camera Module 3 · H.264 · MediaMTX WHEP",
    summary: "The robot's eye. Streams to your view over WebRTC on /cam/whep.", test: "video" },
  { id: "pantilt", name: "Pan / Tilt", hardware: "SG90 ×2 · yaw ±90° · pitch −45° to +45°",
    summary: "Follows your head. HEAD commands at 20 Hz, clamped in the browser and on the robot.", test: "pantilt" },
  { id: "drive", name: "Drive", hardware: "M5Stack RoverC · 4 mecanum wheels · I2C 0x38 from the Pi",
    summary: "Joystick or WASD. Stops automatically if commands pause for 300 ms.", test: "motors" },
  { id: "lights", name: "Lighting", hardware: "Raspberry Pi on-board ACT LED",
    summary: "On / off and a 0–100 % level. The on-board LED shows any level above 0 as on.", test: "lights" },
  { id: "compute", name: "Robot Core", hardware: "Raspberry Pi 4B · aiohttp · WebSocket /ws",
    summary: "Serves VEIL, validates commands and drives the hardware itself: RoverC wheels over I2C, the ACT LED, and the battery ADC.", test: "link" },
  { id: "mcu", name: "Controller", hardware: "RoverC on-board STM32 · I2C 0x38",
    summary: "Built into the RoverC. Runs the four wheel motors from speeds the Pi writes, and stops them by itself when I2C goes quiet." },
  { id: "power", name: "Power", hardware: "2S LiPo · BMS · 5 V buck for Pi · ADS1115",
    summary: "Battery voltage is reported by the Pi in STATUS messages.", test: "telemetry" },
];

export const partById = (id: PartId) => PARTS.find((p) => p.id === id)!;
