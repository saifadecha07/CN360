# Remote camera streaming

The live robot camera can now be watched from anywhere, not only from the robot's Wi-Fi.
The Raspberry Pi publishes to a MediaMTX server on a VPS. VEIL on Vercel plays the stream over WebRTC after the operator signs in.

The original LAN setup still works unchanged. In that setup the Pi serves VEIL and MediaMTX on one origin and VEIL plays `/cam/whep`.

| Document | For |
|---|---|
| [deployment.md](deployment.md) | Setting up the VPS, DNS/HTTPS, Vercel and the Pi, in order |
| [security.md](security.md) | Who can publish and watch, secrets, and how to rotate each one |
| [troubleshooting.md](troubleshooting.md) | Symptom → cause → fix |
| [test-report.md](test-report.md) | What was verified, with numbers, and what still needs real hardware |

## Architecture

```text
 Raspberry Pi                         VPS (Docker, host network)                    Browser
┌──────────────────────┐   RTSPS     ┌──────────────────────────────┐   WebRTC   ┌──────────────────┐
│ camera (CSI / USB)   │  :8322/tcp  │ MediaMTX 1.21.2              │ :8189/udp  │ VEIL  #/watch    │
│ veil-publisher       │────────────▶│  RTSPS ingest ─▶ WebRTC out  │═══════════▶│ (and Command     │
│  Picamera2 / OpenCV  │  ?jwt=…     │  WHEP on 127.0.0.1:8889      │ or 8189/tcp│  Center, Lobby,  │
│  → H.264 → ffmpeg    │             │        ▲                     │ or TURN    │  Live view)      │
└─────────┬────────────┘             │ Caddy :443 ── /<cam>/whep    │◀───────────│ WHEP POST + JWT  │
          │ device key               │ coturn :3478 (+49160-49200)  │   HTTPS    └────────┬─────────┘
          ▼                          └──────────────┬───────────────┘                     │ sign-in
 ┌──────────────────────────────────────────────────┴──────────────────────────────────────┴─────┐
 │ Vercel: VEIL static site + /api/stream/*   session · token · publish-token · jwks             │
 │ Issues short-lived JWTs; MediaMTX checks them against /api/stream/jwks. No video passes here. │
 └───────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Path of one stream:**
1. The Pi exchanges its device key for a 5-minute **publish** token from `/api/stream/publish-token`.
2. It opens the camera and encodes H.264. On a Pi Zero 2 to Pi 4 it uses the VideoCore hardware encoder; elsewhere it uses libx264.
3. It publishes with ffmpeg over **RTSPS** to `rtsps://media…:8322/cam?jwt=…`.
4. The operator signs in on VEIL and gets an HttpOnly session cookie.
5. For each connection attempt, VEIL fetches a 2-minute **read** token from `/api/stream/token`.
6. VEIL asks MediaMTX for ICE servers (`OPTIONS`), then sends a WHEP offer to `https://media…/cam/whep` with `Authorization: Bearer <token>`.
7. MediaMTX verifies the JWT (signature, issuer, audience, expiry, action, path) and answers.
8. Media flows peer-to-peer between the browser and MediaMTX on 8189/UDP. It falls back to 8189/TCP, then to the TURN relay.

MediaMTX fans the stream out: the Pi always sends **one** stream, however many people watch.

## HTTPS is not where the video goes

Port 443 (HTTPS, via Caddy) carries only the **signalling**: a few kilobytes of SDP offer and answer, once per connection.

The video itself is WebRTC media, which is always DTLS-SRTP encrypted and travels on separate ports:

| Port | Protocol | Carries | Needed by |
|---|---|---|---|
| 443/tcp | HTTPS | WHEP signalling (Caddy → MediaMTX) | viewers |
| 8189/udp | ICE/SRTP | **the video** (preferred path) | viewers |
| 8189/tcp | ICE/SRTP over TCP | the video when UDP is blocked | viewers |
| 3478/udp+tcp, 49160–49200/udp | TURN | the video, relayed, when the above are blocked | viewers on restrictive networks |
| 8322/tcp | RTSPS | the Pi's upload | the Pi only |
| 80/tcp | HTTP | Let's Encrypt challenge + redirect | Caddy |

If only 443 is open, sign-in and signalling succeed but no picture ever arrives. VEIL then shows *"Connected, but no video arrived — media ports (UDP/TCP 8189) or TURN may be blocked"*.

## What the operator sees

- `#/watch` (**Live camera**, linked from the landing page): the video alone, with a status pill showing one of *Connecting · Live · Reconnecting · Offline · Sign-in required · Unsupported · Error*.
  - A spinner shows while connecting, and there is a **Retry now** button.
  - A *Tap to play* prompt appears if autoplay is blocked.
  - A Diagnostics panel shows resolution, fps, bitrate, jitter buffer, RTT, packet loss, and the route (direct or TURN).
- The Command Center, the Setup Lobby and the Live immersive view use the same stream client. On the Vercel deployment they use the remote stream automatically.
- `LIVE` appears only after video data has actually arrived. A negotiated-but-empty connection never shows as live; this rule is enforced by a unit test.

### How VEIL picks the source

- **Remote:** `GET /api/stream/session` on the page's own origin answers with JSON (the Vercel deployment). VEIL then uses the media server and sign-in.
- **Direct:** the Pi's static server answers 404, so VEIL uses `/cam/whep` with no sign-in.
- **Override:** `?whep=<url>` or `?robot=<host>` always forces direct mode.

## Recovery behaviour (all measured, see test-report.md)

| Event | Publisher (Pi) | Viewer (browser) |
|---|---|---|
| Media server restarts | Reconnects with backoff (1 s → 30 s cap, ±20 % jitter) | *Reconnecting* → live again (~5 s in tests) |
| Media server hangs (TCP open, nothing moves) | Detects "ffmpeg stopped accepting frames" after `STALL_TIMEOUT`, reconnects | ICE times out → *Reconnecting* → live after recovery |
| Camera stops publishing | — | *Offline* (server reachable, no stream); keeps checking |
| Brief Wi-Fi drop | ffmpeg/TCP usually rides it out; otherwise reconnects | 4 s grace for ICE to recover before renegotiating |
| Camera unplugged / stalls | Logs a camera error, closes and re-opens the camera with backoff | *Reconnecting* / *Offline* |
| Vercel unreachable | Reuses the cached publish token (valid 5 min) | Existing streams keep playing; new sign-ins and reconnects fail until it's back |
| Pi reboots | systemd starts the publisher after `network-online.target` | Recovers like a server restart |

## Bandwidth and capacity (planning numbers)

These figures are computed from the configured bitrate; they were not measured on a real camera feed.

- **Per viewer:** about `VIDEO_BITRATE × 1.05` (RTP/SRTP/UDP overhead). At the default 2 Mbit/s that is **≈ 2.1 Mbit/s** per viewer, about 0.95 GB per viewer-hour.
- **Pi upload:** one stream, ≈ 2.1 Mbit/s, whatever the number of viewers.
- **VPS egress:** viewers × 2.1 Mbit/s. A TURN-relayed viewer costs the VPS about twice that (in and out through coturn).
- **Viewer cap:** `maxReaders: 20` per camera (in mediamtx.yml). Viewer 21 sees *"Viewer limit reached on the media server — waiting for a free slot"*. Raise it only after measuring VPS CPU and bandwidth.

| Profile | `VIDEO_*` | Bitrate | Use when |
|---|---|---|---|
| Default | 1280×720 @ 30 | 2 M | Good uplink (≥ 4 Mbit/s spare) |
| Constrained | 1280×720 @ 15 | 1.2 M | Pi on 4G / weak Wi-Fi |
| Minimum | 854×480 @ 15 | 600k | Very poor links |

`VIDEO_KEYFRAME_INTERVAL` (default 1 s) bounds how long a joining or recovering viewer waits for the first picture. Longer intervals save a little bandwidth but make recovery slower.

## Known limitations

- **No hardware, VPS or cross-network test has been done yet.** Every result in test-report.md comes from one machine running the real MediaMTX, coturn, publisher and Chrome. The list of tests still to run is there.
- **TURN relay playback is unverified end-to-end.** The pieces work individually, but a full relayed session could not be completed on a single machine. Test it on the VPS with `FORCE_RELAY=1` (deployment.md, step 6).
- **RTSPS certificate checking needs ffmpeg ≥ 8.** Raspberry Pi OS ships 5.1 (Bookworm) or 7.1 (Trixie), whose RTSP client cannot verify certificates. The publisher therefore verifies the server certificate itself before every connection (security.md).
- **Sign-in rate limiting is per serverless instance.** Add a Vercel Firewall rule for a global limit (security.md).
- **MediaMTX reads the JWKS once.** Rotating the signing key needs a MediaMTX restart, in the order given in security.md.
- **Single VPS, single region.** Viewers far from the VPS get extra latency. Scaling beyond one server means more MediaMTX instances behind per-region DNS, or a dedicated SFU; that is not built.
- **No recording and no audio.** The path is video-only, and recording is disabled.
