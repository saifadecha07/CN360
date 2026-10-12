/// <reference types="vitest/config" />
import { defineConfig } from "vite";

// The Pi serves dist/ as static files, so asset paths must be relative.
// In dev, /ws is proxied to the mock robot (npm run mock) or to a real Pi
// when VEIL_ROBOT_HOST is set, e.g. VEIL_ROBOT_HOST=192.168.4.1:8443.
const robotHost = process.env.VEIL_ROBOT_HOST ?? "localhost:8765";
const robotSecure = process.env.VEIL_ROBOT_SECURE === "1";

export default defineConfig({
  base: "./",
  server: {
    host: true,
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
});
