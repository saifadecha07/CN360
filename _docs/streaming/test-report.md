# Remote streaming — test report

**Date:** 2026-10-19
**Status:** *implemented and verified on one machine and on a Vercel preview; not yet run on a Raspberry Pi, a VPS, or across real networks.*
It is **not** production-ready until the "Not yet tested" items below pass.

## Test environment

| Component | What was used |
|---|---|
| Media server | **MediaMTX v1.21.2** release binary (darwin/arm64, checksum verified) running the **production** `deployment/mediamtx/mediamtx.yml`, with site values injected through the same `MTX_*` variables Compose uses |
| TURN | coturn **4.18.0** (same version as the pinned image) with the production `turnserver.conf` |
| Vercel API | The real `api/stream/*.js` files, (a) through `UI/tools/stream-dev-server.mjs` locally, (b) on a **Vercel preview deployment** of the `veil` project |
| Publisher | The real `video_publisher` package with `CAMERA_TYPE=test` (synthetic 1280×720 frames carrying their capture time), libx264, RTSPS with certificate verification |
| Viewer | Google Chrome (headless, via Playwright) loading the real built VEIL `#/watch` screen |
| Host | Apple-silicon Mac, macOS, everything on one machine (loopback / LAN IP) |

No Raspberry Pi, camera, VPS, public DNS name or second network was available.

## Verified

### Automated suites (all passing)

| Suite | Result | Command |
|---|---|---|
| VEIL unit + integration (incl. 12 stream-auth server tests, 14 WHEP client tests) | **75/75** | `cd UI && npm test` |
| Typecheck + production build | clean | `npm run build` |
| UI smoke: every screen × desktop/phone + axe WCAG 2.1 AA (now including the Live camera viewer, offline and sign-in states) | **44/44** | `node tests/e2e/smoke.mjs` |
| Publisher unit tests (config, ffmpeg args, backoff, token client, token cache, test pattern) | **20/20** | `cd Robot/RaspberryPi && python3 -m unittest discover -s tests` |
| Browser end-to-end over real MediaMTX (sign-in → token → WHEP → playback → recovery) | **15/15** | `node tests/e2e/stream-e2e.mjs` (see testing notes below) |

### Configuration validation

| Item | How | Result |
|---|---|---|
| `mediamtx.yml` | Loaded by the v1.21.2 binary | Loads; only RTSPS :8322, ICE :8189 udp/tcp, WHEP 127.0.0.1:8889, metrics 127.0.0.1:9998 listen; RTMP/HLS/SRT/MoQ/API off |
| Env overrides incl. comma lists | `MTX_WEBRTCALLOWORIGINS=a,b`, `MTX_WEBRTCADDITIONALHOSTS=ip,ip` | Both origins allowed, a third refused |
| `Caddyfile` | `caddy validate` (Caddy 2.11.7) | Valid |
| `docker-compose.yml` | `docker compose config` (Compose 5.6) with and without `PRIVATE_IP` | Valid, values interpolate as intended |
| `turnserver.conf` | Started coturn 4.18.0 with it | Starts; removed `no-cli` (deprecated in 4.18) |
| Image pins | Docker Hub API | Tags + digests resolve; amd64 and arm64 available |
| MediaMTX `-ffmpeg` image has `wget` for the health check | Upstream Dockerfile at v1.21.2 | Based on `alpine:3.24` |

### Authentication and authorization (MediaMTX v1.21.2 + real JWTs)

| Case | Expected | Result |
|---|---|---|
| WHEP without token | 401 | 401 |
| WHEP `OPTIONS` without token (would leak TURN credentials) | 401, no `Link` | 401, no `Link` |
| Publish token used to read | refused | 401 |
| Read token for another path | refused | 401 |
| Expired token | refused | 401, "token is expired" |
| Token signed by an unknown key | refused | 401, "key not found" |
| Valid read token | accepted | accepted (reached SDP parsing) |
| Read token used to publish over RTSPS | refused | refused, "doesn't have permission" |
| Publish token for `cam` used on `cam2` | refused | refused |
| Valid publish token over RTSPS | accepted | "is publishing to path 'cam'" |
| CORS from an unlisted origin | no ACAO header | none |
| Sign-in with wrong password / unknown user | identical 401 | identical |
| Cross-origin sign-in or token request (CSRF) | 403 | 403 (local and on Vercel) |
| Session cookie flags | HttpOnly, Secure, SameSite=Strict | confirmed on Vercel; not readable from `document.cookie` |
| Token request before sign-in / after sign-out | 401 | 401 |
| No WHEP request is made before sign-in | 0 | 0 |
| Sign-in rate limit | 429 after 10 | triggered (tests had to restart the API to continue) |

**On the real Vercel preview deployment:**
- the JWKS is served;
- session 401 / login 200 / wrong password 401 / cross-origin 403;
- view token = read on `cam`, 2-minute TTL;
- publish token works, and a wrong device key gets 401;
- unknown `/api/*` paths return 404.

### Behaviour findings that changed the implementation

1. **ffmpeg truncates RTSP passwords at 127 bytes** (`char auth[128]` in `rtsp.h`), so a JWT can't be the RTSP password. MediaMTX's `?jwt=` query parameter for RTSP works and is what the publisher uses.
2. **ffmpeg < 8.0 never verifies RTSPS certificates** (checked in the FFmpeg source at n5.1.6 and n7.1.1). The publisher therefore pre-verifies the server itself, and uses `-tls_verify 1` on ffmpeg ≥ 8.
3. **MediaMTX caches the JWKS and does not refetch it for an unknown key ID.**
   - A restart picks up new keys.
   - If the JWKS is unreachable at start, it retries on the next request and recovers on its own.
   - This led to `STREAM_JWT_EXTRA_PUBLIC_KEYS` and the rotation order in security.md.
4. **MediaMTX hot-reloads its TLS certificate** when the files change ("certificate reloaded after change"; the new fingerprint was served without a restart). Caddy's renewals therefore reach RTSPS automatically.
5. **`ontrack` fires before any media arrives.** The first client version reported LIVE when ICE could not connect. It now requires decoded video or received RTP packets, and a regression test enforces this.
6. **The publisher fetched a token on every reconnect**, and a long outage hit the rate limit (429). Tokens are now cached and refreshed only near expiry or after a 401/403. Measured: **0 token requests** during a 60 s server outage (previously 9).

### Playback, latency, recovery (single machine)

| Measurement | Result |
|---|---|
| Sign-in → first decoded frame | 0.4–2.4 s across runs |
| Publish → displayed frame latency (test-pattern timestamp decoded in the browser, same clock) | Run 1: median **60 ms**, p95 84 ms, max 214 ms (n=244); run 3: median 93 ms, p95 278 ms, max 295 ms (n=232); final run: median 58 ms, p95 89 ms, max 94 ms (n=247) |
| Publisher: first frames at the server after start | 1.5 s |
| Viewer recovery after publisher restart | *Reconnecting* → Live in 5.0–6.9 s |
| Viewer recovery after MediaMTX restart | *Reconnecting* → Live in 5.0–7.2 s |
| MediaMTX frozen 25 s (SIGSTOP) | Viewer *Reconnecting* → Live 0.2 s after resume |
| MediaMTX frozen 40–60 s | Publisher detected "ffmpeg stopped accepting frames", backed off 0.8 → 2 → 4 s, publishing again 1.5 s after resume |
| Publisher SIGTERM | "received SIGTERM, shutting down" → "publisher stopped", ffmpeg and camera released |
| Leaving the viewer screen | WebRTC session released (no `srcObject`, server session closed) |
| 10 concurrent viewers | **10/10 live**; MediaMTX avg 9 % of one core, peak RSS 70 MB |
| `maxReaders` enforcement (lowered to 3, 5 viewers) | 3 live, 2 told "Viewer limit reached …" and retrying |
| Phone (390 px) and desktop layouts | No horizontal overflow; screenshots reviewed |

**What the latency number covers:** frame generation → libx264 → RTSPS → MediaMTX → WebRTC → Chrome decode → display, all on loopback.

**What it excludes:**
- camera exposure and ISP processing;
- the Pi's encoder;
- real network RTT and jitter;
- a display's own lag.

It is a floor for the software path, **not** a glass-to-glass figure.

**Resource numbers come from the Mac, not a Pi:**
- publisher: Python ≈ 5 % CPU, 28 MB; ffmpeg + libx264 at 720p ≈ 24 % of one core, 40 MB;
- the test pattern is mostly static, so the encoded bitrate was only 0.3–0.6 Mbit/s, which is not representative of a camera at 2 Mbit/s.

### TURN (partially verified)

| Piece | Result |
|---|---|
| MediaMTX `AUTH_SECRET` credentials accepted by coturn | ✓ allocation + data, 0 % loss (`turnutils_uclient` with the exact credentials MediaMTX handed to the browser) |
| Chrome gathers relay candidates with them | ✓ (2 relay candidates, UDP and TCP TURN) |
| coturn relays to a peer on its own IP | ✓ 0 % loss |
| coturn peer restriction (`denied-peer-ip` all + `allowed-peer-ip` VPS) accepts the VPS | ✓ permission created for the allowed IP |
| **Full relayed playback in a browser** | ✗ **not achieved on one machine.** ICE packets crossed the relay in both directions, but the session did not complete with browser, TURN and media server sharing one host. VEIL correctly showed *Reconnecting*, not LIVE. **Must be tested on the VPS** (deployment.md, step 6, `FORCE_RELAY=1`). |

## Not yet tested (needs hardware, a VPS, DNS or other networks)

| # | Test | Why not done | How to do it |
|---|---|---|---|
| 1 | Camera detection: CSI (Camera Module 2/3) and USB webcam | No Pi or camera | `--probe` on the Pi; start the service; expect "camera ready: …" |
| 2 | Hardware H.264 path (Picamera2 `H264Encoder` → ffmpeg copy) on Pi 4 | No Pi | Pi 4 + CSI; MediaMTX must say "1 track (H264)", and the viewer plays |
| 3 | Pi 5 software encoding at 720p30: CPU, temperature, achieved fps | No Pi 5 | `top`, `vcgencmd measure_temp`, Diagnostics → Frame rate |
| 4 | OpenCV USB path and `USB_BACKEND=ffmpeg` | No webcam on a Pi | As 1 |
| 5 | systemd unit: start at boot, watchdog, hardening (camera access under `ProtectSystem=strict`) | No Pi | Reboot; `systemctl status veil-publisher`; if camera init fails only under systemd, relax the hardening as noted in the unit |
| 6 | `install-publisher.sh` on a fresh Raspberry Pi OS | No Pi | Fresh image, run the script |
| 7 | VPS deployment with Docker, Let's Encrypt, ufw and the cloud firewall | No VPS / domain | deployment.md §3–4 |
| 8 | MediaMTX reading Caddy's renewed certificate through the bind mount | Docker not available locally (hot reload itself verified) | `docker compose exec caddy caddy reload` after a forced renewal, or wait for the renewal; MediaMTX logs "certificate reloaded" |
| 9 | Health timer restarting an unhealthy container | No VPS | `docker compose pause mediamtx` → within ~2 min the timer restarts it |
| 10 | Cross-network WebRTC (viewer on 4G / another ISP) | Single machine | `stream-e2e.mjs` from a phone hotspot |
| 11 | TURN relay end-to-end | See above | `FORCE_RELAY=1 node tests/e2e/stream-e2e.mjs` against the deployment |
| 12 | Real glass-to-glass latency | No camera | Stopwatch method (deployment.md §6) on Wi-Fi and 4G |
| 13 | Mobile Safari (iOS) and Android Chrome playback, autoplay prompt | No devices driven | Open `#/watch` on each; record the result here |
| 14 | PICO 4 browser playback of the remote stream | No headset | `#/watch`, then the Live view |
| 15 | Network loss on the Pi side (cable pull, Wi-Fi drop) | No Pi | deployment.md §6 step 4 |
| 16 | Concurrent viewers at the real bitrate, VPS CPU/bandwidth | No VPS | Open N viewers; `docker stats`; `vnstat`. Raise `maxReaders` only after this |
| 17 | Vercel production deploy with real env vars | Left to the team (shared project, no VPS yet) | deployment.md §2 |

## Reproducing the local tests

Everything ran from this repository. The local stack:
1. Generate throwaway secrets with `UI/tools/stream-admin.mjs`.
2. Run `node UI/tools/stream-dev-server.mjs` with the `STREAM_*` env (loopback WHEP base allowed).
3. Run `mediamtx deployment/mediamtx/mediamtx.yml` with `MTX_AUTHJWTJWKS=http://127.0.0.1:8787/api/stream/jwks`, a self-signed cert, and the `MTX_*` overrides.
4. Run the publisher with `CAMERA_TYPE=test`, `STREAM_TOKEN_URL=http://127.0.0.1:8787/api/stream/publish-token`, `STREAM_CA_FILE=<self-signed cert>`.
5. Run `VIEWER_PASS=… CHROME_PATH=… node UI/tests/e2e/stream-e2e.mjs`, optionally with `RESTART_PUBLISHER_CMD` / `RESTART_SERVER_CMD`.

Note: Playwright's bundled Chromium may lack H.264 on some platforms; use Google Chrome via `CHROME_PATH`.
