/** Robot component catalogue. Hardware facts come from Docs/robot 1.5.txt, plan.md and WORKING_PROCESS.md. */
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
  { id: "drive", name: "Drive", hardware: "DC motors · TB6612FNG · differential drive",
    summary: "Joystick or WASD. Stops automatically if commands pause for 300 ms.", test: "motors" },
  { id: "lights", name: "Lighting", hardware: "High-power LED · IR LED · MOSFET PWM",
    summary: "Brightness 0–100 % and a night (IR) vision mode.", test: "lights" },
  { id: "compute", name: "Robot Core", hardware: "Raspberry Pi 4B · aiohttp · WebSocket /ws",
    summary: "Serves VEIL, validates commands and forwards them to the ESP32 over serial.", test: "link" },
  { id: "mcu", name: "Controller", hardware: "ESP32 · UART 115200 · 300 ms watchdog",
    summary: "Low-level motor, servo and LED control. No direct link from the browser — reached through the Pi." },
  { id: "power", name: "Power", hardware: "2S LiPo · BMS · 5 V buck for Pi",
    summary: "Battery voltage is reported by the Pi in STATUS messages.", test: "telemetry" },
];

export const partById = (id: PartId) => PARTS.find((p) => p.id === id)!;
