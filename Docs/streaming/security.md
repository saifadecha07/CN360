# Stream security

## Access model

| Actor | Proves identity with | Receives | Can do |
|---|---|---|---|
| Operator (browser) | user name + password → `POST /api/stream/session` | HttpOnly session cookie (12 h) | ask for read tokens for **their** camera paths |
| Operator's browser, per connection | session cookie → `POST /api/stream/token` | JWT, **2 min**, `[{action: read, path: cam}]` | open one WHEP session on that path |
| Raspberry Pi | device id + device key (HTTP Basic) → `POST /api/stream/publish-token` | JWT, **5 min**, `[{action: publish, path: cam}]` | publish to its own path only |
| MediaMTX | — | public keys from `GET /api/stream/jwks` | verifies signature (RS256), `iss`, `aud`, `exp`, action and path |

Publishing and viewing are separate permissions:
- a read token cannot publish, and a publish token cannot read (both checked, see test-report.md);
- a viewer session cannot mint publish tokens;
- a device key cannot sign in as a viewer.

**What never reaches the browser:**
- the signing key;
- the device key;
- the TURN shared secret;
- any long-lived media credential.

The browser only ever holds a 2-minute token scoped to one path.

TURN credentials are derived per session by MediaMTX (`AUTH_SECRET`, time-limited HMAC). They are only sent after the WHEP `OPTIONS` request has passed JWT authentication; unauthenticated `OPTIONS` gets a 401 with no ICE servers.

**Camera discovery:** the token endpoint returns the same `403` for "path doesn't exist" and "not your path". MediaMTX answers `401` to everything without a valid token. Caddy exposes only `/<path>/whep` and returns 404 for every other URL.

## Where each secret lives

| Secret | Lives in | Never in |
|---|---|---|
| `STREAM_JWT_PRIVATE_KEY` | Vercel env (Production) | git, the browser, the VPS |
| `STREAM_SESSION_SECRET` | Vercel env | git, the browser |
| Viewer passwords | the people; Vercel holds only scrypt hashes (`STREAM_VIEWERS`) | git, logs |
| Device key | Pi `/etc/veil-publisher/publisher.env` (root:veil-cam 640); Vercel holds only its scrypt hash | git, the VPS, logs |
| `TURN_SECRET` | VPS `deployment/.env` (600) | git, the browser |

The publisher redacts credentials and `?jwt=` from every log line it writes. The API logs user names and IPs for failed sign-ins, never passwords or tokens.

## Hardening that is in place

- **RTSPS only for ingest:** plain RTSP (8554), RTMP, HLS, SRT and MoQ are disabled. The publisher refuses to send credentials over plain `rtsp://` to a non-local host.
- **Management surfaces closed:**
  - The MediaMTX control API is off.
  - Metrics are on 127.0.0.1 only, and WHEP is on 127.0.0.1 behind Caddy.
  - The Caddy admin endpoint is on 127.0.0.1.
  - No management port is open in the firewall.
- **CORS:** MediaMTX allows only the configured VEIL origins (`VEIL_ORIGINS`).
- **Sessions and CSRF:**
  - The session cookie is `HttpOnly; Secure; SameSite=Strict; Path=/api/stream`.
  - Every state-changing browser call must carry the deployment's own `Origin`.
  - Removing a viewer from `STREAM_VIEWERS` and redeploying ends their existing sessions immediately.
- **Abuse limits:**
  - **Sign-in:** 10 attempts / 10 min per IP per serverless instance. scrypt makes every attempt deliberately slow, and unknown users cost the same as known ones.
  - **Publish tokens:** 30 / 10 min per IP; the Pi caches its token, so a healthy Pi uses far fewer.
  - **Viewers:** `maxReaders: 20` per camera.
  - **TURN:** `user-quota` / `total-quota`, and it relays **only to the VPS itself** (`denied-peer-ip` all, `allowed-peer-ip` = the VPS). It can't be used as an open proxy.
- **Pi service:** runs as an unprivileged `veil-cam` user with `NoNewPrivileges`, `ProtectSystem=strict`, `ProtectHome` and `PrivateTmp`.
- **Pinned images:** containers are pinned by tag **and** digest.

## Known gaps — and what to do

1. **RTSPS certificate verification by ffmpeg.**
   - ffmpeg < 8.0 never checks the server certificate on `rtsps://` and has no option to; Raspberry Pi OS ships 5.1 / 7.1.
   - The publisher therefore verifies the chain and hostname itself with Python's `ssl` (system CAs, or `STREAM_CA_FILE`) right before every connection.
   - This blocks a misconfigured or impersonated server. A sophisticated on-path attacker could still intercept only ffmpeg's connection and capture a publish token, which is valid for ≤ 5 minutes and only for that camera path.
   - To close the gap: install ffmpeg ≥ 8 on the Pi (the publisher then passes `-tls_verify 1` automatically), or run the Pi→VPS leg inside WireGuard.
2. **Token in the RTSPS URL.**
   - ffmpeg truncates RTSP passwords at 127 bytes, so the JWT travels as `?jwt=`, inside TLS.
   - It is visible in the Pi's process list to local users, so keep the Pi single-purpose.
3. **Sign-in rate limit is per instance.** Vercel can run several instances, so add a global limit: Vercel → Firewall → Rules → *Rate limit*, path starts with `/api/stream/`, e.g. 30 requests / 60 s per IP.
4. **MediaMTX debug logging prints ICE passwords and TURN credentials.** Keep `logLevel: info` in production.
5. **No MFA or SSO.** If the team later adopts an identity provider, replace `sessionRoute`; the token and JWKS part stays the same.

## Rotating credentials

| Secret | Steps | Impact |
|---|---|---|
| Viewer password | `stream-admin viewer <user>` → replace the hash in `STREAM_VIEWERS` → redeploy | That user's sessions end; others are unaffected |
| Remove a viewer | Delete their entry → redeploy | They can't sign in or get new tokens; a stream that is already open keeps playing until it disconnects (MediaMTX checks tokens only at connect) |
| Device key (Pi) | `stream-admin device <id>` → new hash in `STREAM_PUBLISHERS` → redeploy → new key in the Pi env → `systemctl restart veil-publisher` | Publishing pauses for the minutes between the two steps |
| `STREAM_SESSION_SECRET` | Generate (`stream-admin keys`, take that line) → set → redeploy | Everyone signs in again |
| `TURN_SECRET` | `stream-admin turn-secret` → VPS `.env` → `docker compose up -d` | Relayed viewers reconnect (automatic) |
| **Signing key** | See below | None if done in this order |

### Rotating the signing key (zero downtime)

MediaMTX 1.21 downloads the JWKS **once** and does not refetch it when it meets an unknown key ID (verified, see test-report.md). So the new public key must be published, and MediaMTX restarted, **before** VEIL signs with it.

1. `node tools/stream-admin.mjs keys` → keep the new `STREAM_JWT_PRIVATE_KEY` aside, and put its `PUBLIC_KEY` into `STREAM_JWT_EXTRA_PUBLIC_KEYS` → redeploy VEIL. The JWKS now lists the old and new keys.
2. On the VPS: `docker compose restart mediamtx`. MediaMTX now trusts both keys.
3. Set `STREAM_JWT_PRIVATE_KEY` to the new key, and put the **old** public key in `STREAM_JWT_EXTRA_PUBLIC_KEYS` → redeploy. New tokens are signed with the new key; tokens already issued with the old key stay valid for their last ≤ 5 minutes.
4. After 10 minutes: clear `STREAM_JWT_EXTRA_PUBLIC_KEYS` → redeploy → `docker compose restart mediamtx`.

If the old key **leaked**:
1. Set the new key directly as `STREAM_JWT_PRIVATE_KEY`, with no extra keys.
2. Redeploy.
3. Restart MediaMTX at once.

Streams pause for the restart, and every token signed with the leaked key stops working immediately.

## How the Pi authenticates to the media server

1. Before every connection, the publisher sends `POST https://<veil>/api/stream/publish-token`.
   - It authenticates with HTTP Basic `STREAM_USERNAME:STREAM_PASSWORD` (its device id and key).
   - The request uses TLS verified against the system CAs.
2. VEIL checks the key against the scrypt hash in `STREAM_PUBLISHERS` and returns a JWT allowing `publish` on that device's path for 5 minutes.
3. The publisher caches the token and reuses it until 60 s before expiry. It fetches a new one sooner only if the server refused it.
4. The publisher checks the VPS certificate. ffmpeg then connects to `rtsps://media…:8322/<path>?jwt=<token>`.
5. MediaMTX verifies the token against the cached JWKS. MediaMTX checks it only when the session starts, so a stream outlives its token.

For a lab or LAN without VEIL, leave `STREAM_TOKEN_URL` empty. `STREAM_USERNAME`/`STREAM_PASSWORD` are then sent as plain RTSP credentials. The config allows that only over `rtsps://`, or to `localhost`.
