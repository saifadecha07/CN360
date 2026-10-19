"""Camera sources.

Three shapes, so each camera uses its cheapest path to H.264:
  mode "h264"   CSI camera + VideoCore hardware encoder (Pi ≤ 4) via Picamera2 → ffmpeg copies it
  mode "raw"    raw frames from Python (Picamera2 on Pi 5, OpenCV USB, test pattern) → ffmpeg encodes
  mode "ffmpeg" USB camera opened by ffmpeg itself (USB_BACKEND=ffmpeg) → no Python frame copies

Every source is opened per publishing session and always closed in a finally block,
so the camera is released on errors, reconnects and shutdown.
"""
from __future__ import annotations

import glob
import logging
import os
import threading
import time
from typing import Callable, List, Optional, Tuple

from .config import Config

log = logging.getLogger("publisher.camera")


class CameraError(RuntimeError):
    pass


class Source:
    mode = "raw"
    description = ""
    pix_fmt = "yuv420p"
    size: Tuple[int, int] = (0, 0)
    device = ""

    def open(self) -> None: ...
    def close(self) -> None: ...
    def read(self) -> bytes: raise NotImplementedError
    def start_encoder(self, sink) -> None: raise NotImplementedError


# ─── detection ───────────────────────────────────────────────────────────────

def _picamera2():
    try:
        from picamera2 import Picamera2  # apt: python3-picamera2
        return Picamera2
    except Exception:  # ImportError, or libcamera errors on non-Pi hardware
        return None


def csi_cameras() -> List[dict]:
    P = _picamera2()
    if not P:
        return []
    try:
        return list(P.global_camera_info())
    except Exception as e:
        log.warning("libcamera could not enumerate cameras: %s", e)
        return []


def usb_cameras() -> List[str]:
    """V4L2 capture devices on the USB bus. Excludes the Pi's ISP/codec/CSI nodes (/dev/video10+…)."""
    out = []
    for dev in sorted(glob.glob("/dev/video*"), key=lambda p: int(p[10:]) if p[10:].isdigit() else 999):
        node = os.path.basename(dev)
        try:
            real = os.path.realpath(f"/sys/class/video4linux/{node}/device")
            index = open(f"/sys/class/video4linux/{node}/index").read().strip()
        except OSError:
            continue
        if "/usb" in real and index == "0":  # index 0 = the capture node; 1+ are metadata nodes
            out.append(dev)
    return out


def has_hw_h264_for_picamera2() -> bool:
    """Picamera2's H264Encoder needs the bcm2835 V4L2 encoder at /dev/video11 (Pi Zero 2 – Pi 4; not Pi 5)."""
    try:
        return "enc" in open("/sys/class/video4linux/video11/name").read()
    except OSError:
        return False


def pi_model() -> str:
    try:
        return open("/proc/device-tree/model").read().strip("\x00\n ")
    except OSError:
        return "not a Raspberry Pi"


def open_source(cfg: Config) -> Source:
    kind = cfg.camera_type
    if kind == "auto":
        if csi_cameras():
            kind = "csi"
        elif usb_cameras():
            kind = "usb"
        else:
            raise CameraError("No camera found: no CSI camera via libcamera and no USB V4L2 camera")
    if kind == "test":
        return TestPatternSource(cfg)
    if kind == "csi":
        return CsiSource(cfg)
    if cfg.usb_backend == "ffmpeg":
        return FfmpegV4l2Source(cfg)
    return OpenCvSource(cfg)


# ─── CSI (Picamera2) ─────────────────────────────────────────────────────────

class CsiSource(Source):
    def __init__(self, cfg: Config):
        self.cfg = cfg
        self.index = int(cfg.camera_device or 0)
        self.picam2 = None
        self.encoder = None
        self.mode = "h264" if cfg.encoder != "software" and has_hw_h264_for_picamera2() else "raw"

    def open(self) -> None:
        P = _picamera2()
        if not P:
            raise CameraError("Picamera2 is not installed (sudo apt install python3-picamera2)")
        cams = csi_cameras()
        if self.index >= len(cams):
            raise CameraError(f"CSI camera {self.index} not found ({len(cams)} detected)")
        try:
            self.picam2 = P(camera_num=self.index)
            conf = self.picam2.create_video_configuration(
                main={"size": (self.cfg.width, self.cfg.height), "format": "YUV420"},
                controls={"FrameRate": float(self.cfg.fps)},
                buffer_count=4,
            )
            self.picam2.align_configuration(conf)
            self.picam2.configure(conf)
            main = self.picam2.camera_configuration()["main"]
            self.size = tuple(main["size"])
            self.stride = int(main.get("stride") or self.size[0])
        except Exception as e:
            self.close()
            raise CameraError(f"CSI camera init failed: {e}") from e
        model = cams[self.index].get("Model", "?")
        if self.size != (self.cfg.width, self.cfg.height):
            log.warning("camera adjusted %dx%d → %dx%d (sensor/ISP alignment)", self.cfg.width, self.cfg.height, *self.size)
        enc = "VideoCore hardware H.264" if self.mode == "h264" else "ffmpeg encoder (no hardware H.264 on this Pi)"
        self.description = f"CSI {model} {self.size[0]}x{self.size[1]}@{self.cfg.fps} → {enc}"
        if self.mode == "raw":
            self.picam2.start()

    def start_encoder(self, sink) -> None:
        from picamera2.encoders import H264Encoder
        from picamera2.outputs import FileOutput
        kw = dict(bitrate=self.cfg.bitrate, repeat=True, iperiod=self.cfg.keyint)
        try:
            # repeat=True puts SPS/PPS before every keyframe so viewers can join mid-stream.
            self.encoder = H264Encoder(profile="baseline", **kw)
        except TypeError:  # older Picamera2 without the profile argument
            self.encoder = H264Encoder(**kw)
        try:
            self.picam2.start_recording(self.encoder, FileOutput(sink))
        except Exception as e:
            raise CameraError(f"hardware encoder failed to start: {e}") from e

    def read(self) -> bytes:
        try:
            arr = self.picam2.capture_array("main")
        except Exception as e:
            raise CameraError(f"capture failed: {e}") from e
        w, h = self.size
        s = self.stride
        if s == w:
            return arr.tobytes()
        import numpy as np  # strip row padding plane by plane
        buf = arr.reshape(-1)
        y = buf[: h * s].reshape(h, s)[:, :w]
        u = buf[h * s: h * s + (h // 2) * (s // 2)].reshape(h // 2, s // 2)[:, : w // 2]
        v = buf[h * s + (h // 2) * (s // 2): h * s + 2 * (h // 2) * (s // 2)].reshape(h // 2, s // 2)[:, : w // 2]
        return np.concatenate([y.reshape(-1), u.reshape(-1), v.reshape(-1)]).tobytes()

    def close(self) -> None:
        cam, self.picam2 = self.picam2, None
        if not cam:
            return
        for step in (cam.stop_recording if self.encoder else cam.stop, cam.close):
            try:
                step()
            except Exception as e:
                log.debug("camera cleanup: %s", e)
        self.encoder = None


# ─── USB (OpenCV) ────────────────────────────────────────────────────────────

class OpenCvSource(Source):
    pix_fmt = "bgr24"

    def __init__(self, cfg: Config):
        self.cfg = cfg
        self.cap = None

    def _device(self):
        dev = self.cfg.camera_device or (usb_cameras() or [""])[0]
        if not dev:
            raise CameraError("No USB camera found (set CAMERA_DEVICE=/dev/videoN)")
        return dev

    def open(self) -> None:
        try:
            import cv2  # apt: python3-opencv
        except ImportError:
            raise CameraError("OpenCV is not installed (sudo apt install python3-opencv) — or set USB_BACKEND=ffmpeg") from None
        dev = self._device()
        target = int(dev) if dev.isdigit() else dev
        self.cap = cv2.VideoCapture(target, cv2.CAP_V4L2) if hasattr(cv2, "CAP_V4L2") else cv2.VideoCapture(target)
        if not self.cap.isOpened():
            self.close()
            raise CameraError(f"cannot open {dev} (in use by another process, or no permission — is the user in the 'video' group?)")
        self.cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*"MJPG"))  # USB 2.0 can't carry 720p30 uncompressed
        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.cfg.width)
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.cfg.height)
        self.cap.set(cv2.CAP_PROP_FPS, self.cfg.fps)
        self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)  # latest frame, not a queue of old ones
        ok, frame = self.cap.read()
        if not ok or frame is None:
            self.close()
            raise CameraError(f"{dev} opened but returned no frame")
        self.size = (frame.shape[1], frame.shape[0])
        self._first = frame
        if self.size != (self.cfg.width, self.cfg.height):
            log.warning("camera does not support %dx%d; using %dx%d", self.cfg.width, self.cfg.height, *self.size)
        self.description = f"USB {dev} {self.size[0]}x{self.size[1]} (OpenCV, reports {self.cap.get(cv2.CAP_PROP_FPS):.0f} fps)"

    def read(self) -> bytes:
        if self._first is not None:
            f, self._first = self._first, None
            return f.tobytes()
        ok, frame = self.cap.read()
        if not ok or frame is None:
            raise CameraError("USB camera stopped delivering frames (unplugged?)")
        return frame.tobytes()

    def close(self) -> None:
        if self.cap is not None:
            try:
                self.cap.release()
            except Exception:
                pass
        self.cap = None
        self._first = None


class FfmpegV4l2Source(OpenCvSource):
    mode = "ffmpeg"

    def open(self) -> None:
        self.device = self._device()
        if not os.access(self.device, os.R_OK | os.W_OK):
            raise CameraError(f"no access to {self.device} (add the service user to the 'video' group)")
        self.size = (self.cfg.width, self.cfg.height)
        self.description = f"USB {self.device} {self.cfg.width}x{self.cfg.height}@{self.cfg.fps} MJPEG (ffmpeg v4l2)"

    def close(self) -> None:
        pass


# ─── Test pattern ────────────────────────────────────────────────────────────

class TestPatternSource(Source):
    """
    Synthetic YUV420 frames for testing without a camera: a moving bar plus the capture
    time (Unix ms) encoded as 44 black/white blocks across the top. A browser on the same
    clock can decode the blocks and measure publish→playback latency exactly
    (UI/tests/e2e/stream-e2e.mjs). Labelled as a test source everywhere it is logged.
    """
    BITS = 44
    BAND = 48

    def __init__(self, cfg: Config, clock: Callable[[], float] = time.time):
        self.cfg = cfg
        self.clock = clock
        self.size = (cfg.width, cfg.height)
        self.description = f"TEST PATTERN {cfg.width}x{cfg.height}@{cfg.fps} (no camera)"
        w, h = self.size
        self._bg = bytearray(b"\x40" * (w * h)) + bytearray(b"\x80" * (w * h // 2))
        self._n = 0
        self._next = 0.0
        self._lock = threading.Lock()

    def encode_time(self, ms: int) -> bytes:
        w = self.size[0]
        bw = w // self.BITS
        row = b"".join((b"\xeb" if (ms >> (self.BITS - 1 - i)) & 1 else b"\x10") * bw for i in range(self.BITS))
        return row + b"\x10" * (w - len(row))

    def read(self) -> bytes:
        with self._lock:
            now = time.monotonic()
            if self._next == 0.0:
                self._next = now
            if self._next > now:
                time.sleep(self._next - now)
            self._next = max(self._next + 1.0 / self.cfg.fps, time.monotonic() - 1.0)
            w, h = self.size
            f = bytearray(self._bg)
            row = self.encode_time(int(self.clock() * 1000))
            for y in range(self.BAND):
                f[y * w:(y + 1) * w] = row
            x = (self._n * 8) % (w - 24)
            bar = b"\xc0" * 24
            for y in range(self.BAND + 8, h):
                f[y * w + x: y * w + x + 24] = bar
            self._n += 1
            return bytes(f)

    @classmethod
    def decode_time(cls, y_row: bytes, width: int) -> int:
        bw = width // cls.BITS
        ms = 0
        for i in range(cls.BITS):
            ms = (ms << 1) | (1 if y_row[i * bw + bw // 2] > 128 else 0)
        return ms
