"""Entry point: python3 -m video_publisher [--probe | --check-config]"""
from __future__ import annotations

import argparse
import logging
import signal
import sys

from . import __version__, config, ffmpeg, sources
from .publisher import Publisher


def probe(cfg_ok: bool) -> int:
    """Report what this machine can actually do. Nothing is published."""
    print(f"veil-publisher {__version__}")
    print(f"board:         {sources.pi_model()}")
    csi = sources.csi_cameras()
    print(f"CSI cameras:   {', '.join(c.get('Model', '?') for c in csi) or 'none (or python3-picamera2 missing)'}")
    print(f"USB cameras:   {', '.join(sources.usb_cameras()) or 'none'}")
    print(f"Picamera2 HW H.264 (/dev/video11): {'yes' if sources.has_hw_h264_for_picamera2() else 'no'}")
    binary = "ffmpeg"
    try:
        cfg = config.load()
        binary = cfg.ffmpeg
    except config.ConfigError:
        pass
    try:
        info = ffmpeg.probe(binary)
        print(f"ffmpeg:        {info.version[0]}.{info.version[1]}  libx264={'libx264' in info.encoders}"
              f"  h264_v4l2m2m works={ffmpeg.hardware_encoder_works(binary)}")
        print(f"RTSPS cert verification by ffmpeg: {'yes' if info.rtsp_tls_verify else 'no (ffmpeg < 8; publisher pre-checks TLS itself)'}")
    except RuntimeError as e:
        print(f"ffmpeg:        {e}")
        return 1
    return 0 if cfg_ok else 1


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="video_publisher", description=__doc__)
    ap.add_argument("--probe", action="store_true", help="list cameras/encoders and exit")
    ap.add_argument("--check-config", action="store_true", help="validate environment configuration and exit")
    args = ap.parse_args(argv)

    try:
        cfg = config.load()
    except config.ConfigError as e:
        if args.probe:
            print(f"config:        INVALID — {e}")
            return probe(False)
        print(f"configuration error: {e}", file=sys.stderr)
        return 2
    if args.probe:
        return probe(True)
    if args.check_config:
        print(f"OK: {cfg.camera_type} camera, {cfg.width}x{cfg.height}@{cfg.fps}, {cfg.bitrate // 1000} kbit/s,"
              f" keyframe every {cfg.keyint} frames → {cfg.publish_url_redacted}"
              f" ({'token service' if cfg.token_url else 'static credentials' if cfg.password else 'no auth'})")
        return 0

    logging.basicConfig(level=cfg.log_level, format="%(levelname)s %(name)s: %(message)s")
    pub = Publisher(cfg)

    def on_signal(signum, _frame):
        logging.getLogger("publisher").info("received %s, shutting down", signal.Signals(signum).name)
        pub.stop()

    signal.signal(signal.SIGTERM, on_signal)
    signal.signal(signal.SIGINT, on_signal)
    pub.run()
    return 0


if __name__ == "__main__":
    sys.exit(main())
