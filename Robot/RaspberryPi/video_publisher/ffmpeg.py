"""ffmpeg capability probing and command construction.

ffmpeg only does the H.264 encode (when the camera can't) and the RTSP(S) publish.
Capabilities are probed on the actual machine instead of assumed: a Pi 4 has a
hardware H.264 encoder (h264_v4l2m2m), a Pi 5 does not, and ffmpeg < 8 cannot
verify RTSPS certificates at all.
"""
from __future__ import annotations

import logging
import re
import socket
import ssl
import subprocess
from dataclasses import dataclass
from functools import lru_cache
from typing import List, Optional, Tuple
from urllib.parse import quote, urlsplit

from .config import Config

log = logging.getLogger("publisher.ffmpeg")


@dataclass(frozen=True)
class FfmpegInfo:
    version: Tuple[int, int]
    encoders: frozenset
    rtsp_tls_verify: bool  # ffmpeg >= 8.0 verifies RTSPS certificates and accepts -tls_verify


@lru_cache(maxsize=None)
def probe(binary: str) -> FfmpegInfo:
    try:
        out = subprocess.run([binary, "-hide_banner", "-version"], capture_output=True, text=True, timeout=15).stdout
        enc = subprocess.run([binary, "-hide_banner", "-encoders"], capture_output=True, text=True, timeout=15).stdout
    except FileNotFoundError:
        raise RuntimeError(f"ffmpeg not found ({binary}); install it with: sudo apt install ffmpeg") from None
    m = re.search(r"ffmpeg version n?(\d+)\.(\d+)", out)
    version = (int(m.group(1)), int(m.group(2))) if m else (0, 0)
    encoders = frozenset(re.findall(r"^\s*V\S*\s+(\S+)", enc, re.M))
    return FfmpegInfo(version=version, encoders=encoders, rtsp_tls_verify=version >= (8, 0))


@lru_cache(maxsize=None)
def hardware_encoder_works(binary: str) -> bool:
    """h264_v4l2m2m is compiled into Debian's ffmpeg even on a Pi 5, which has no encoder block. Try it."""
    if "h264_v4l2m2m" not in probe(binary).encoders:
        return False
    cmd = [binary, "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=15",
           "-frames:v", "15", "-pix_fmt", "yuv420p", "-c:v", "h264_v4l2m2m", "-b:v", "1M", "-f", "null", "-"]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    except subprocess.TimeoutExpired:
        return False
    if r.returncode != 0:
        log.info("hardware H.264 encoder unavailable: %s", (r.stderr.strip().splitlines() or ["?"])[-1])
    return r.returncode == 0


def choose_encoder(cfg: Config) -> str:
    """Encoder for raw-frame sources. CSI on a Pi ≤ 4 bypasses this and uses the ISP's encoder via Picamera2."""
    info = probe(cfg.ffmpeg)
    if cfg.encoder in ("auto", "hardware") and hardware_encoder_works(cfg.ffmpeg):
        return "h264_v4l2m2m"
    if cfg.encoder == "hardware":
        raise RuntimeError("VIDEO_ENCODER=hardware but no working hardware H.264 encoder was found")
    if "libx264" not in info.encoders:
        raise RuntimeError("ffmpeg has no libx264; install a full ffmpeg build")
    return "libx264"


def encoder_args(cfg: Config, encoder: str) -> List[str]:
    b = str(cfg.bitrate)
    if encoder == "libx264":
        # Baseline + no B-frames: WebRTC in every browser can decode it, and MediaMTX rejects B-frames for WebRTC.
        return ["-c:v", "libx264", "-preset", "ultrafast", "-tune", "zerolatency", "-profile:v", "baseline",
                "-b:v", b, "-maxrate", b, "-bufsize", str(cfg.bitrate // 2), "-g", str(cfg.keyint), "-bf", "0",
                "-x264-params", f"keyint={cfg.keyint}:min-keyint={cfg.keyint}:scenecut=0:repeat-headers=1"]
    return ["-c:v", encoder, "-b:v", b, "-g", str(cfg.keyint), "-bf", "0"]


def publish_url(cfg: Config, user: str = "", password: str = "", token: Optional[str] = None) -> str:
    u = urlsplit(cfg.server_url)
    if token:
        return f"{u.scheme}://{u.netloc}/{cfg.stream_name}?jwt={quote(token, safe='')}"
    auth = f"{quote(user or 'publisher', safe='')}:{quote(password, safe='')}@" if password else ""
    return f"{u.scheme}://{auth}{u.netloc}/{cfg.stream_name}"


def output_args(cfg: Config, url: str) -> List[str]:
    args = ["-an", "-f", "rtsp", "-rtsp_transport", "tcp"]
    if url.startswith("rtsps://") and probe(cfg.ffmpeg).rtsp_tls_verify:
        args += ["-tls_verify", "1" if cfg.tls_verify else "0"]
        if cfg.ca_file:
            args += ["-ca_file", cfg.ca_file]
    return args + [url]


# -progress on stdout lets the supervisor see frames actually reaching the server (not just "ffmpeg is running").
COMMON_IN = ["-hide_banner", "-loglevel", "warning", "-nostats", "-progress", "pipe:1", "-stats_period", "1",
             "-fflags", "+genpts+nobuffer", "-flags", "low_delay"]


def cmd_h264_passthrough(cfg: Config, url: str) -> List[str]:
    """Already-encoded H.264 (Annex B) on stdin → RTSP(S). Used with Picamera2's hardware encoder."""
    return [cfg.ffmpeg, *COMMON_IN, "-use_wallclock_as_timestamps", "1", "-f", "h264", "-i", "pipe:0",
            "-c:v", "copy", *output_args(cfg, url)]


def cmd_rawvideo(cfg: Config, url: str, encoder: str, pix_fmt: str, size: Tuple[int, int]) -> List[str]:
    """Raw frames on stdin → H.264 → RTSP(S). Wall-clock timestamps keep A/V time real even if the camera drops frames."""
    return [cfg.ffmpeg, *COMMON_IN, "-use_wallclock_as_timestamps", "1", "-thread_queue_size", "64",
            "-f", "rawvideo", "-pix_fmt", pix_fmt, "-video_size", f"{size[0]}x{size[1]}", "-i", "pipe:0",
            "-pix_fmt", "yuv420p", *encoder_args(cfg, encoder), *output_args(cfg, url)]


def cmd_v4l2(cfg: Config, url: str, encoder: str, device: str) -> List[str]:
    """USB webcam read by ffmpeg itself (USB_BACKEND=ffmpeg): no Python frame copies, lowest CPU."""
    return [cfg.ffmpeg, *COMMON_IN, "-f", "v4l2", "-input_format", "mjpeg", "-framerate", str(cfg.fps),
            "-video_size", f"{cfg.width}x{cfg.height}", "-i", device,
            "-pix_fmt", "yuv420p", *encoder_args(cfg, encoder), *output_args(cfg, url)]


def redact(cmd: List[str]) -> str:
    return " ".join(re.sub(r"([?&]jwt=)[^&\s]+", r"\1***", re.sub(r"(rtsps?://)[^@/\s]+@", r"\1***@", c)) for c in cmd)


def verify_server_tls(cfg: Config, timeout: float = 10.0) -> Optional[str]:
    """
    ffmpeg < 8 sends RTSPS credentials without checking the server certificate. Before handing it a
    token, check the chain and hostname ourselves with the system trust store (or STREAM_CA_FILE).
    Returns None when OK, otherwise a reason. This narrows, but does not fully close, the MITM window
    (docs/streaming/security.md).
    """
    u = urlsplit(cfg.server_url)
    if u.scheme != "rtsps" or not cfg.tls_verify or probe(cfg.ffmpeg).rtsp_tls_verify:
        return None
    ctx = ssl.create_default_context(cafile=cfg.ca_file or None)
    try:
        with socket.create_connection((u.hostname, u.port or 322), timeout=timeout) as sock:
            with ctx.wrap_socket(sock, server_hostname=u.hostname):
                return None
    except ssl.SSLCertVerificationError as e:
        return f"certificate check failed: {e.verify_message}"
    except OSError as e:
        return f"cannot reach {u.hostname}:{u.port}: {e}"
