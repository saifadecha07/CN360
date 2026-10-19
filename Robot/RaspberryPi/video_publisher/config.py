"""Publisher configuration from environment variables (systemd EnvironmentFile).

Every value is validated up front so a typo fails loudly at start-up instead of
producing a half-working stream. Secrets are kept out of repr() and logs.
"""
from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from typing import Mapping, Optional
from urllib.parse import urlsplit


class ConfigError(ValueError):
    pass


CAMERA_TYPES = ("auto", "csi", "usb", "test")
ENCODERS = ("auto", "hardware", "software")
USB_BACKENDS = ("opencv", "ffmpeg")
_PATH_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$")


def _bitrate(value: str) -> int:
    """Accepts 2000000, 2000k, 2.5M."""
    m = re.fullmatch(r"\s*(\d+(?:\.\d+)?)\s*([kKmM]?)\s*", value)
    if not m:
        raise ConfigError(f"VIDEO_BITRATE: cannot parse {value!r} (use e.g. 2000000, 2500k or 2M)")
    n = float(m.group(1)) * {"": 1, "k": 1e3, "m": 1e6}[m.group(2).lower()]
    if not 100_000 <= n <= 25_000_000:
        raise ConfigError("VIDEO_BITRATE must be between 100k and 25M bit/s")
    return int(n)


def _int(env: Mapping[str, str], key: str, default: int, lo: int, hi: int) -> int:
    raw = env.get(key, "").strip()
    if not raw:
        return default
    try:
        v = int(raw)
    except ValueError:
        raise ConfigError(f"{key} must be an integer, got {raw!r}") from None
    if not lo <= v <= hi:
        raise ConfigError(f"{key} must be between {lo} and {hi}, got {v}")
    return v


def _choice(env: Mapping[str, str], key: str, default: str, options: tuple) -> str:
    v = env.get(key, "").strip().lower() or default
    if v not in options:
        raise ConfigError(f"{key} must be one of {', '.join(options)}, got {v!r}")
    return v


@dataclass(frozen=True)
class Config:
    server_url: str               # rtsps://media.example.com:8322 or rtsp://127.0.0.1:8554
    stream_name: str              # MediaMTX path, e.g. "cam"
    username: str = ""
    password: str = field(default="", repr=False)
    token_url: str = ""           # https://<veil>/api/stream/publish-token → JWT used as RTSP password
    camera_type: str = "auto"
    camera_device: str = ""       # CSI index ("0") or V4L2 device ("/dev/video0")
    width: int = 1280
    height: int = 720
    fps: int = 30
    bitrate: int = 2_000_000
    keyframe_interval_s: float = 1.0
    encoder: str = "auto"
    usb_backend: str = "opencv"
    reconnect_max_delay: int = 30
    stall_timeout: int = 10
    tls_verify: bool = True
    ca_file: str = ""
    ffmpeg: str = "ffmpeg"
    log_level: str = "INFO"

    @property
    def keyint(self) -> int:
        """GOP length in frames. A viewer can only start decoding at a keyframe."""
        return max(1, round(self.fps * self.keyframe_interval_s))

    @property
    def publish_url_redacted(self) -> str:
        return f"{self.server_url.rstrip('/')}/{self.stream_name}"


def load(env: Optional[Mapping[str, str]] = None) -> Config:
    env = os.environ if env is None else env
    server = env.get("STREAM_SERVER_URL", "").strip()
    if not server:
        raise ConfigError("STREAM_SERVER_URL is required (e.g. rtsps://media.example.com:8322)")
    u = urlsplit(server)
    if u.scheme not in ("rtsp", "rtsps") or not u.hostname:
        raise ConfigError("STREAM_SERVER_URL must be rtsp://host:port or rtsps://host:port")
    if u.username or u.password or (u.path not in ("", "/")):
        raise ConfigError("STREAM_SERVER_URL must not contain credentials or a path; use STREAM_USERNAME/STREAM_PASSWORD and STREAM_NAME")

    name = env.get("STREAM_NAME", "cam").strip()
    if not _PATH_RE.match(name):
        raise ConfigError("STREAM_NAME must be lowercase letters, digits, '-' or '_' (max 64)")

    token_url = env.get("STREAM_TOKEN_URL", "").strip()
    user = env.get("STREAM_USERNAME", "").strip()
    password = env.get("STREAM_PASSWORD", "")
    if token_url:
        t = urlsplit(token_url)
        if t.scheme != "https" and t.hostname not in ("localhost", "127.0.0.1"):
            raise ConfigError("STREAM_TOKEN_URL must use https://")
        if not user or not password:
            raise ConfigError("STREAM_TOKEN_URL needs STREAM_USERNAME (device id) and STREAM_PASSWORD (device key)")
    if (token_url or password) and u.scheme == "rtsp" and u.hostname not in ("localhost", "127.0.0.1", "::1"):
        raise ConfigError("Refusing to send credentials over plain rtsp:// to a remote host; use rtsps://")

    width = _int(env, "VIDEO_WIDTH", 1280, 160, 3840)
    height = _int(env, "VIDEO_HEIGHT", 720, 120, 2160)
    if width % 2 or height % 2:
        raise ConfigError("VIDEO_WIDTH and VIDEO_HEIGHT must be even (H.264 4:2:0)")

    try:
        keyframe = float(env.get("VIDEO_KEYFRAME_INTERVAL", "1") or "1")
    except ValueError:
        raise ConfigError("VIDEO_KEYFRAME_INTERVAL must be a number of seconds") from None
    if not 0.2 <= keyframe <= 10:
        raise ConfigError("VIDEO_KEYFRAME_INTERVAL must be between 0.2 and 10 seconds")

    ca_file = env.get("STREAM_CA_FILE", "").strip()
    if ca_file and not os.path.isfile(ca_file):
        raise ConfigError(f"STREAM_CA_FILE does not exist: {ca_file}")

    level = env.get("LOG_LEVEL", "INFO").strip().upper()
    if level not in ("DEBUG", "INFO", "WARNING", "ERROR"):
        raise ConfigError("LOG_LEVEL must be DEBUG, INFO, WARNING or ERROR")

    return Config(
        server_url=server.rstrip("/"),
        stream_name=name,
        username=user,
        password=password,
        token_url=token_url,
        camera_type=_choice(env, "CAMERA_TYPE", "auto", CAMERA_TYPES),
        camera_device=env.get("CAMERA_DEVICE", "").strip(),
        width=width,
        height=height,
        fps=_int(env, "VIDEO_FPS", 30, 1, 120),
        bitrate=_bitrate(env.get("VIDEO_BITRATE", "2000000")),
        keyframe_interval_s=keyframe,
        encoder=_choice(env, "VIDEO_ENCODER", "auto", ENCODERS),
        usb_backend=_choice(env, "USB_BACKEND", "opencv", USB_BACKENDS),
        reconnect_max_delay=_int(env, "RECONNECT_MAX_DELAY", 30, 2, 600),
        stall_timeout=_int(env, "STALL_TIMEOUT", 10, 3, 120),
        tls_verify=env.get("STREAM_TLS_VERIFY", "1").strip() not in ("0", "false", "no"),
        ca_file=ca_file,
        ffmpeg=env.get("FFMPEG_PATH", "ffmpeg").strip() or "ffmpeg",
        log_level=level,
    )
