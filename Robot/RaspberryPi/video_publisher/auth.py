"""Publisher credentials.

With STREAM_TOKEN_URL set (production): the device id/key are exchanged for a
short-lived, path-scoped MediaMTX JWT before every connection. The JWT goes in the
RTSPS URL query (?jwt=), which MediaMTX supports for RTSP; it cannot be the RTSP
password because ffmpeg truncates credentials to 127 bytes (rtsp.h: char auth[128]).
The long-lived device key never reaches the media server.

Without it (LAN/lab): STREAM_USERNAME/STREAM_PASSWORD are used as RTSP credentials as-is.
"""
from __future__ import annotations

import base64
import json
import logging
import ssl
import time
import urllib.error
import urllib.request
from typing import NamedTuple, Optional

from .config import Config

log = logging.getLogger("publisher.auth")


class Credentials(NamedTuple):
    user: str = ""
    password: str = ""
    token: Optional[str] = None  # MediaMTX JWT; sent as ?jwt= (ffmpeg truncates RTSP passwords at 127 bytes)
    expires_at: float = 0.0      # unix seconds; MediaMTX checks the token only when a session starts


class AuthError(RuntimeError):
    """Credentials were rejected. Retrying quickly won't help."""


class TransientAuthError(RuntimeError):
    """Token service unreachable or failing. Retry with backoff."""

    def __init__(self, message: str, retry_after: float = 0.0):
        super().__init__(message)
        self.retry_after = retry_after


def credentials(cfg: Config, timeout: float = 10.0) -> Credentials:
    if not cfg.token_url:
        return Credentials(cfg.username, cfg.password)
    basic = base64.b64encode(f"{cfg.username}:{cfg.password}".encode()).decode()
    req = urllib.request.Request(cfg.token_url, method="POST", data=b"", headers={
        "Authorization": f"Basic {basic}", "User-Agent": "veil-publisher/1", "Accept": "application/json",
    })
    # System trust store on purpose: STREAM_CA_FILE is for the media server, the token service is a public site.
    ctx = ssl.create_default_context() if cfg.token_url.startswith("https") else None
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=ctx) as res:
            body = json.load(res)
    except urllib.error.HTTPError as e:
        if e.code in (401, 403):
            raise AuthError(f"token service rejected device '{cfg.username}' (HTTP {e.code}) — check STREAM_USERNAME/STREAM_PASSWORD") from None
        retry_after = e.headers.get("Retry-After", "") if e.headers else ""
        raise TransientAuthError(f"token service HTTP {e.code}", float(retry_after) if retry_after.isdigit() else 0.0) from None
    except (urllib.error.URLError, OSError, ValueError) as e:
        raise TransientAuthError(f"token service unreachable: {getattr(e, 'reason', e)}") from None
    token, path = body.get("token"), body.get("path")
    if not isinstance(token, str) or not token:
        raise TransientAuthError("token service returned no token")
    if path and path != cfg.stream_name:
        raise AuthError(f"device is allowed to publish to '{path}', but STREAM_NAME is '{cfg.stream_name}'")
    expires = body.get("expiresAt")
    return Credentials(token=token, expires_at=float(expires) / 1000 if isinstance(expires, (int, float)) else time.time() + 60)


class CredentialCache:
    """Reuses a publish token across reconnects until shortly before it expires, so a long outage
    doesn't turn into one token request per retry (the token endpoint is rate limited)."""

    MARGIN_S = 60.0

    def __init__(self, cfg: Config, fetch=credentials, clock=time.time):
        self.cfg, self.fetch, self.clock = cfg, fetch, clock
        self.current: Optional[Credentials] = None

    def get(self) -> Credentials:
        c = self.current
        if c is None or (c.token and c.expires_at - self.clock() < self.MARGIN_S):
            c = self.current = self.fetch(self.cfg)
        return c

    def invalidate(self) -> None:
        self.current = None
