# Deploying remote streaming

Do the steps in this order: each step needs the previous one.

Throughout this guide:
- `veil.example.com` is the VEIL site on Vercel.
- `media.example.com` is the VPS.
- `203.0.113.10` is the VPS's public IPv4 address.

Replace them with your own.

## 0. Prerequisites

| Item | Requirement |
|---|---|
| VPS | Ubuntu 24.04 / Debian 12 or newer, 1 vCPU / 1 GB is enough for a few viewers, public IPv4, Docker Engine + Compose plugin |
| Domain | A name you control for the VPS, e.g. `media.example.com` |
| Vercel | The existing `veil` project (root directory `UI/`) |
| Pi | Raspberry Pi OS Bookworm or newer, a CSI camera (Camera Module 2/3) or a UVC USB webcam |
| Workstation | Node 20+, this repository |

## 1. Generate the secrets (workstation)

All commands print to stdout only. Store the output in your password manager.

```bash
cd UI
node tools/stream-admin.mjs keys                  # STREAM_JWT_PRIVATE_KEY + STREAM_SESSION_SECRET  → Vercel
node tools/stream-admin.mjs viewer alice cam      # prompts for a password      → STREAM_VIEWERS entry  (Vercel)
node tools/stream-admin.mjs device robot-01 cam   # random device key           → Pi env + STREAM_PUBLISHERS (Vercel)
node tools/stream-admin.mjs turn-secret           # TURN_SECRET                 → VPS .env
```

Repeat `viewer` for every operator. Each password must be at least 12 characters, and only its scrypt hash goes to Vercel.

## 2. Vercel (VEIL + stream API)

1. Vercel → `veil` → Settings → Environment Variables → **Production**. Add the variables from [`UI/.env.stream.example`](../../UI/.env.stream.example):
   - `STREAM_JWT_PRIVATE_KEY`, `STREAM_SESSION_SECRET` (from `keys`)
   - `STREAM_JWT_ISSUER=https://veil.example.com/api/stream`. It must match the VPS `.env` exactly.
   - `STREAM_JWT_AUDIENCE=mediamtx`
   - `STREAM_WHEP_BASE=https://media.example.com`
   - `STREAM_VIEWERS=[…]`, `STREAM_PUBLISHERS=[…]`. These are JSON arrays of the objects from step 1.
2. Deploy:
   - Push to the branch Vercel builds, or run `cd UI && vercel deploy --prod`.
   - `api/stream/*.js` are deployed as Node functions automatically; no `vercel.json` change is needed.
3. Check:
   ```bash
   curl -s https://veil.example.com/api/stream/jwks | head -c 80      # {"keys":[{"kty":"RSA",…
   curl -s -o /dev/null -w '%{http_code}\n' https://veil.example.com/api/stream/session   # 401
   ```
   A `503 not_configured` answer means a variable is missing or malformed. The function log names which one; the response never does.
4. **The JWKS must be publicly reachable** by the VPS:
   - Use the production domain.
   - Preview deployments sit behind Vercel Authentication by default and answer 302, so MediaMTX cannot read them.

## 3. DNS and HTTPS

1. Create an **A record** `media.example.com → 203.0.113.10` (and AAAA only if the VPS really has IPv6). Wait until `dig +short media.example.com` returns the IP.
2. HTTPS is automatic:
   - Caddy obtains a Let's Encrypt certificate on first start (HTTP-01 on port 80) and renews it.
   - MediaMTX reuses that same certificate for RTSPS and reloads it when Caddy renews it.
3. VEIL itself is HTTPS on Vercel. Browsers require HTTPS for the page, and WebXR requires it too.

**TLS covers the signalling and the Pi's upload. The video to viewers is protected by WebRTC's own DTLS-SRTP encryption, not by the certificate.** See the port table in [README.md](README.md#https-is-not-where-the-video-goes).

## 4. VPS (MediaMTX + Caddy + coturn)

```bash
sudo mkdir -p /opt/veil && sudo chown $USER /opt/veil
git clone <this repository> /opt/veil          # or copy the deployment/ folder
cd /opt/veil/deployment
cp .env.example .env && chmod 600 .env && nano .env
```

Fill in `.env`:
- `MEDIA_DOMAIN`, `ACME_EMAIL`
- `PUBLIC_IP`
- `PRIVATE_IP`: only on AWS/GCP/Azure-style 1:1 NAT, where the public IP is not on an interface (`ip -4 addr` doesn't show it)
- `VEIL_ORIGIN=https://veil.example.com`
- `VEIL_ORIGINS`: every origin that serves VEIL, comma-separated, e.g. also `https://veil-rho-six.vercel.app`
- `TURN_SECRET`

```bash
sudo ./scripts/firewall.sh            # review the rules (dry run)
sudo ./scripts/firewall.sh --apply    # ufw: 22, 80, 443, 8322, 8189 udp+tcp, 3478 udp+tcp, 49160-49200/udp

docker compose config --quiet         # validates .env interpolation
docker compose up -d
docker compose ps                     # all three "healthy" after ~1 min
docker compose logs -f mediamtx       # expect: [RTSPS] listener :8322, [WebRTC] … :8189 (UDP/ICE)
```

**Cloud firewalls:** if the provider also has a network firewall or security group (AWS, GCP, Hetzner Cloud Firewall, Oracle…), open the **same** ports there. ufw alone is not enough.

Self-repair and boot:

```bash
sudo cp systemd/veil-media-health.* /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now veil-media-health.timer
sudo systemctl enable docker          # containers (restart: unless-stopped) come back after reboot
```

- Docker restarts containers that crash.
- The timer restarts containers Docker marks *unhealthy*, which Docker never does by itself. It also checks `https://media.example.com/healthz` from outside.

Check from your workstation:

```bash
curl -s https://media.example.com/healthz                                        # ok
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://media.example.com/cam/whep  # 401 (auth enforced)
curl -s -o /dev/null -w '%{http_code}\n' https://media.example.com/                  # 404 (nothing else exposed)
nc -vz media.example.com 8322                                                     # RTSPS reachable
```

## 5. Raspberry Pi

```bash
git clone <this repository> ~/cn360          # or copy Robot/RaspberryPi/
cd ~/cn360/Robot/RaspberryPi
sudo ./install-publisher.sh
```

The installer:
- installs `ffmpeg python3-picamera2 python3-opencv`;
- creates the `veil-cam` service user (groups `video`, `render`);
- copies the code to `/opt/veil-publisher`;
- creates `/etc/veil-publisher/publisher.env` (mode 640) from the example;
- enables `veil-publisher.service`;
- prints a **hardware probe**.

Edit `/etc/veil-publisher/publisher.env`:

```bash
STREAM_SERVER_URL=rtsps://media.example.com:8322
STREAM_NAME=cam
STREAM_TOKEN_URL=https://veil.example.com/api/stream/publish-token
STREAM_USERNAME=robot-01          # from stream-admin device
STREAM_PASSWORD=…                 # from stream-admin device
CAMERA_TYPE=auto
VIDEO_WIDTH=1280
VIDEO_HEIGHT=720
VIDEO_FPS=30
VIDEO_BITRATE=2M
```

Then start it and watch the log:

```bash
sudo systemctl restart veil-publisher
journalctl -u veil-publisher -f
# INFO publisher: camera ready: CSI imx708 1280x720@30 → VideoCore hardware H.264
# INFO publisher: publishing to rtsps://media.example.com:8322/cam (session 1, first frames after 1.6 s)
```

`python3 -m video_publisher --probe` (run from `/opt/veil-publisher`) reports what this Pi can actually do:
- which cameras libcamera and V4L2 see;
- whether a hardware H.264 encoder works;
- the ffmpeg version, and whether it can verify RTSPS certificates.

**Pi 5 has no H.264 encoder.** The publisher falls back to libx264 automatically. Check CPU with `top` and lower the resolution or fps if it stays above ~70 %.

## 6. End-to-end verification

1. Open `https://veil.example.com/#/watch` → sign in → **Live** within a few seconds. Open *Diagnostics*: the route should be `Direct · UDP`.
2. Run the automated checks from a workstation **on a different network than the VPS** (e.g. a phone hotspot):
   ```bash
   cd UI
   BASE_URL=https://veil.example.com VIEWER_USER=alice VIEWER_PASS='…' \
     CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
     node tests/e2e/stream-e2e.mjs
   ```
   Then repeat with `FORCE_RELAY=1`. This proves the TURN path; it is the one check that could not be done before deployment.
3. Measure glass-to-glass latency with a real camera. Film a millisecond stopwatch on a screen, put the viewer next to it, and photograph both. Repeat on Wi-Fi and 4G.
4. Pull the Pi's network cable for 30 s, then reconnect. The viewer should show *Reconnecting/Offline*, then *Live* again without a reload.
5. Record the results in [test-report.md](test-report.md).

## Updating

| Component | How |
|---|---|
| VEIL / API | Normal Vercel deploy. Env changes (new viewer, rotated secret) need a **redeploy** to take effect. |
| MediaMTX / coturn / Caddy | Change the tag **and** digest in `docker-compose.yml`, run `docker compose pull && docker compose up -d`, then re-run step 6. Read the MediaMTX release notes for config key changes first; `mediamtx.yml` is pinned to 1.21.2. |
| Publisher | `cd ~/cn360 && git pull && sudo Robot/RaspberryPi/install-publisher.sh`. The env file is kept. |
