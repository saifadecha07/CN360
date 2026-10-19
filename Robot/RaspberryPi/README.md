# Raspberry Pi

| Path | What |
|---|---|
| `code.py` | Robot control server (HTTP + WebSocket → ESP32). *Not written yet.* |
| `video_publisher/` | Camera → H.264 → MediaMTX publisher with automatic recovery (below) |
| `install-publisher.sh` | Installs the publisher as the `veil-publisher` systemd service |
| `publisher.env.example` | Every setting, with defaults → `/etc/veil-publisher/publisher.env` |
| `systemd/veil-publisher.service` | Unit: starts at boot, watchdog, unprivileged user, hardening |
| `tests/` | `python3 -m unittest discover -s tests` (standard library only) |

## Video publisher

```bash
sudo ./install-publisher.sh                     # packages, user, code, env file, service
sudoedit /etc/veil-publisher/publisher.env      # server, device id/key, camera, resolution
sudo systemctl restart veil-publisher
journalctl -u veil-publisher -f
```

**What it does:**
1. Detects the camera: CSI via Picamera2 first, then USB via OpenCV. `CAMERA_TYPE` forces one, and `test` generates frames with no camera.
2. Encodes H.264 with the cheapest working option on *this* Pi:
   - the VideoCore hardware encoder on a Pi Zero 2 to Pi 4;
   - `h264_v4l2m2m` when it actually works;
   - otherwise libx264 (Pi 5 has no H.264 encoder).
   The output is baseline profile with no B-frames, so every browser can decode it.
3. Publishes over RTSPS to MediaMTX with a short-lived token from VEIL (`STREAM_TOKEN_URL`).
4. Recovers on its own:
   - **Exponential backoff:** 1 s → `RECONNECT_MAX_DELAY`, ±20 % jitter, reset after 30 s of stable streaming.
   - **Stall detection:** distinguishes "camera stalled" from "network or server stalled".
   - **Token caching:** reuses the token across reconnects.
   - **Clean shutdown:** on SIGTERM it closes ffmpeg and releases the camera.
5. Logs every camera, connection, publishing and recovery event to the journal, with credentials redacted.

`python3 -m video_publisher --probe` (from `/opt/veil-publisher`) prints the cameras, encoders and ffmpeg capabilities this Pi really has. `--check-config` validates the env file.

To stream only on the robot's own Wi-Fi with a local MediaMTX, set `STREAM_SERVER_URL=rtsp://127.0.0.1:8554` and leave `STREAM_TOKEN_URL` empty.

See [Docs/streaming/](../../Docs/streaming/README.md) for the architecture, deployment, security and troubleshooting.
