# deployment/ — media relay VPS

MediaMTX 1.21.2 (RTSPS ingest → WebRTC/WHEP), Caddy 2.11.7 (HTTPS, Let's Encrypt) and coturn 4.18.0 (TURN). They run with Docker Compose on one Linux VPS.

| Path | What |
|---|---|
| `docker-compose.yml` | The three services, host networking, images pinned by digest, health checks, log rotation |
| `.env.example` | Site values (domain, public IP, VEIL origin, TURN secret) → copy to `.env` |
| `mediamtx/mediamtx.yml` | Production MediaMTX config: JWT auth, RTSPS only, WHEP on loopback, TURN, viewer limit |
| `caddy/Caddyfile` | HTTPS front; exposes only `/<path>/whep` |
| `coturn/turnserver.conf` | TURN with time-limited credentials, relaying only to this VPS |
| `scripts/firewall.sh` | ufw rules (dry run by default) |
| `scripts/healthcheck.sh` + `systemd/veil-media-health.*` | Restarts unhealthy containers every minute and checks `/healthz` |

Read in this order:
1. [Docs/streaming/deployment.md](../Docs/streaming/deployment.md): the full setup.
2. [security.md](../Docs/streaming/security.md)
3. [troubleshooting.md](../Docs/streaming/troubleshooting.md)
