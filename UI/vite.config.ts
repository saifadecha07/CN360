/// <reference types="vitest/config" />
import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

// The Pi serves dist/ as static files, so asset paths must be relative.
// In dev, /ws is proxied to the mock robot (npm run mock) or to a real Pi
// when VEIL_ROBOT_HOST is set, e.g. VEIL_ROBOT_HOST=192.168.4.1:8443.
const robotHost = process.env.VEIL_ROBOT_HOST ?? "localhost:8765";
const robotSecure = process.env.VEIL_ROBOT_SECURE === "1";

// `vite --mode https` (npm run dev:https) serves over HTTPS with UI/.certs/{key,cert}.pem
// (self-signed, not committed). PICO Browser needs HTTPS for WebXR.
const httpsFor = (mode: string) =>
  mode === "https" ? { key: readFileSync(".certs/key.pem"), cert: readFileSync(".certs/cert.pem") } : undefined;

export default defineConfig(({ mode }) => ({
  base: "./",
  server: {
    host: true,
    https: httpsFor(mode),
    proxy: {
      "/ws": { target: `${robotSecure ? "wss" : "ws"}://${robotHost}`, ws: true, secure: false },
      "/cam": { target: `${robotSecure ? "https" : "http"}://${robotHost}`, changeOrigin: true, secure: false },
    },
  },
  build: {
    outDir: "dist",
    target: "es2022",
    chunkSizeWarningLimit: 900,
  },
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.ts"],
  },
}));
