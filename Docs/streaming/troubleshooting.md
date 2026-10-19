# Troubleshooting remote streaming

Start by finding **which leg** is broken:

```text
Pi ──RTSPS──▶ MediaMTX ──WebRTC──▶ browser
 journalctl -u veil-publisher   docker compose logs mediamtx   VEIL #/watch → Diagnostics
```

MediaMTX logs one line per event:
- `is publishing to path 'cam'`: the Pi side works.
- `is reading from path 'cam'`: the viewer side works.

## Viewer (VEIL `#/watch`)

| What you see | Likely cause | Fix |
|---|---|---|
| **Sign-in required** after signing in | Cookie blocked (third-party/strict privacy mode), or `STREAM_SESSION_SECRET` changed | Use the site's own domain (not an iframe); sign in again |
| "Remote streaming is not configured on this deployment." | A `STREAM_*` variable is missing or invalid on Vercel | Vercel → Logs → look for `[stream] configuration error: …` (names the variable); fix → redeploy |
| "Wrong user name or password." | As stated | `stream-admin viewer` to reset; hash → `STREAM_VIEWERS` → redeploy |
| "Too many sign-in attempts" | Rate limit (10 / 10 min per IP per instance) | Wait 10 minutes |
| "Your account cannot view this camera" | The viewer's `paths` doesn't include this camera | Add the path to their entry in `STREAM_VIEWERS` |
| **Offline** — "The camera is not publishing right now" | MediaMTX is up, but nothing is publishing to that path | Check the Pi (below). The viewer reconnects by itself once the Pi publishes |
| **Reconnecting** — "Media server unreachable" | DNS, Caddy down, 443 blocked, or the VPS is down | `curl https://media…/healthz`; `docker compose ps` |
| "Media server rejected the access token" | Issuer/audience mismatch between Vercel and VPS, or the signing key rotated without restarting MediaMTX | `STREAM_JWT_ISSUER` must equal `VEIL_ORIGIN/api/stream`; see the MediaMTX log line `failed to authenticate: …` (table below) |
| "Connected, but no video arrived — media ports (UDP/TCP 8189) or TURN may be blocked" | Signalling works but media can't flow | Open 8189/udp + 8189/tcp in **both** ufw and the cloud firewall; confirm `PUBLIC_IP` is correct; test TURN (`FORCE_RELAY=1`) |
| "Viewer limit reached on the media server" | `maxReaders` (20) reached | Wait, or raise `maxReaders` in mediamtx.yml after checking VPS bandwidth |
| **Tap to play** button | Browser blocked autoplay (low-power mode, site settings) | Tap it; the video is muted, so one tap is enough |
| **Unsupported** | No WebRTC (very old browser, some in-app web views) | Use current Chrome, Edge, Firefox or Safari |
| Plays, then freezes for seconds | Packet loss on the viewer's or the Pi's link | Diagnostics → Packets lost / Bitrate. Lower `VIDEO_BITRATE` / `VIDEO_FPS` on the Pi |
| Takes several seconds to show a picture | The viewer waits for the next keyframe | Lower `VIDEO_KEYFRAME_INTERVAL` (default 1 s) |
| Diagnostics → Route = **TURN relay** | Direct path blocked on that network | Normal fallback; costs extra VPS bandwidth and a little latency |

## MediaMTX log messages

| Message | Meaning |
|---|---|
| `failed to authenticate: token is unverifiable: … key not found: kid "…"` | Token signed with a key MediaMTX doesn't know → signing key rotated without a restart. `docker compose restart mediamtx` (security.md has the right order) |
| `failed to authenticate: Get "https://…/api/stream/jwks": …` | MediaMTX can't fetch the JWKS: wrong `VEIL_ORIGIN`, VEIL down, or a protected preview URL. Self-heals on the next request once reachable |
| `token has invalid claims: token is expired` | Clock skew on the VPS (check `timedatectl`), or a very slow client |
| `token has invalid claims: … issuer` / `audience` | `STREAM_JWT_ISSUER` ≠ `authJWTIssuer`, or `STREAM_JWT_AUDIENCE` ≠ `mediamtx` |
| `user doesn't have permission to perform action` | Right key, wrong action or path (e.g. a read token used to publish, or a Pi publishing to a path its device isn't allowed) |
| `token is malformed: … invalid number of segments` | The JWT was truncated. Happens if a JWT is put in the RTSP **password** (ffmpeg cuts at 127 bytes). The publisher sends it as `?jwt=`; check you're running its current version |
| `closed: deadline exceeded while waiting connection` | The browser's ICE checks never arrived: firewall on 8189, wrong `PUBLIC_IP` / `PRIVATE_IP`, or TURN not working |
| `RTP packets are too big (1460 > 1430), remuxing them` | Harmless; MediaMTX repacketises ffmpeg's RTP for WebRTC |
| `maximum reader count reached` | `maxReaders` limit |

## Raspberry Pi publisher (`journalctl -u veil-publisher -f`)

| Log | Cause | Fix |
|---|---|---|
| `configuration error: …` (service won't start) | Invalid `/etc/veil-publisher/publisher.env` | The message names the variable; `python3 -m video_publisher --check-config` |
| `No camera found` | Ribbon cable, camera not enabled, or no UVC device | `rpicam-hello --list-cameras`, `v4l2-ctl --list-devices`; `--probe` |
| `CSI camera init failed: … Device or resource busy` | Another process (rpicam-vid, a local MediaMTX `rpiCamera` source) holds the camera | Stop the other user; only one process can own a CSI camera |
| `cannot open /dev/videoN (… is the user in the 'video' group?)` | Permissions | The installer adds `veil-cam` to `video`; re-run it |
| `token service rejected device 'robot-01' (HTTP 401)` | Wrong device key, or `STREAM_PUBLISHERS` not redeployed | Re-issue with `stream-admin device`; retries are slowed to `RECONNECT_MAX_DELAY` |
| `token service HTTP 429` | Rate limit on publish tokens | The publisher honours `Retry-After`; check that only one Pi uses this IP and device |
| `token service unreachable` | No internet / DNS on the Pi | `ping`, `curl -I https://veil…` |
| `TLS pre-check: certificate check failed` | The server presents a certificate the Pi doesn't trust (wrong host, self-signed, expired, or interception) | Check `MEDIA_DOMAIN` DNS and Caddy's certificate; for a private CA set `STREAM_CA_FILE` |
| `ffmpeg: method ANNOUNCE failed: 401 (Unauthorized)` | MediaMTX refused the token | See the MediaMTX log for the reason; the next attempt fetches a fresh token |
| `ffmpeg stopped accepting frames … (network stalled or server unresponsive)` | Upload blocked mid-stream | Recovers automatically; if frequent, lower the bitrate or check the uplink |
| `camera delivered no frames for 10s` | Camera hung or unplugged | Recovers by re-opening; persistent → power/cable (Pi under-voltage: `vcgencmd get_throttled`) |
| `hardware H.264 encoder unavailable` (then libx264) | Pi 5, or the codec driver is missing | Expected on Pi 5; watch CPU in `top` |
| systemd: `Watchdog timeout` | Supervisor deadlocked | systemd restarts it; please file the preceding log lines as a bug |

## VPS

| Check | Command |
|---|---|
| Containers and health | `docker compose ps` |
| Certificate issued | `docker compose logs caddy \| grep -i certificate`; port 80 must be open and DNS must point here |
| Ports actually listening | `sudo ss -lntup \| grep -E ':(443|8322|8189|3478)'` |
| Reachable from outside | from another network: `nc -vz media… 8322`, `nc -vzu media… 8189`, `curl https://media…/healthz` |
| TURN works | see below |
| Self-repair timer | `systemctl list-timers veil-media-health.timer`, `journalctl -u veil-media-health` |

TURN self-test (any machine with the coturn tools, e.g. `apt install coturn` or `brew install coturn`; `TURN_SECRET` from the VPS `.env`):

```bash
U="$(( $(date +%s) + 600 )):check"
P=$(printf %s "$U" | openssl dgst -sha1 -hmac "$TURN_SECRET" -binary | base64)
turnutils_uclient -u "$U" -w "$P" -y media.example.com     # expect "Total lost packets 0"
```
