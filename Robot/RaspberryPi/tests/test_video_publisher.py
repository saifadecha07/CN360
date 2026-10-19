"""Unit tests for the video publisher. Standard library only, so they run on a bare Pi:

    cd Robot/RaspberryPi && python3 -m unittest discover -s tests -v
"""
from __future__ import annotations

import io
import json
import os
import sys
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from video_publisher import auth, config, ffmpeg  # noqa: E402
from video_publisher.publisher import Backoff, Progress  # noqa: E402
from video_publisher.sources import TestPatternSource  # noqa: E402

BASE = {"STREAM_SERVER_URL": "rtsps://media.example.com:8322", "STREAM_NAME": "cam"}


def cfg(**extra):
    return config.load({**BASE, **extra})


class ConfigTests(unittest.TestCase):
    def test_defaults(self):
        c = cfg()
        self.assertEqual((c.width, c.height, c.fps, c.bitrate, c.keyint), (1280, 720, 30, 2_000_000, 30))
        self.assertTrue(c.tls_verify)

    def test_bitrate_units(self):
        self.assertEqual(cfg(VIDEO_BITRATE="2500k").bitrate, 2_500_000)
        self.assertEqual(cfg(VIDEO_BITRATE="1.5M").bitrate, 1_500_000)
        with self.assertRaises(config.ConfigError):
            cfg(VIDEO_BITRATE="fast")
        with self.assertRaises(config.ConfigError):
            cfg(VIDEO_BITRATE="50k")

    def test_rejects_bad_values(self):
        for bad in ({"STREAM_SERVER_URL": "http://x"}, {"STREAM_SERVER_URL": "rtsps://u:p@x:8322"},
                    {"STREAM_SERVER_URL": "rtsps://x:8322/cam"}, {"STREAM_NAME": "../cam"},
                    {"VIDEO_WIDTH": "1281"}, {"VIDEO_FPS": "0"}, {"CAMERA_TYPE": "webcam"},
                    {"VIDEO_KEYFRAME_INTERVAL": "30"}, {"STREAM_TOKEN_URL": "http://veil.example.com/x"}):
            with self.subTest(bad=bad), self.assertRaises(config.ConfigError):
                config.load({**BASE, **bad})

    def test_no_credentials_over_plain_rtsp_to_remote_hosts(self):
        with self.assertRaises(config.ConfigError):
            config.load({"STREAM_SERVER_URL": "rtsp://media.example.com:8554", "STREAM_PASSWORD": "x"})
        config.load({"STREAM_SERVER_URL": "rtsp://127.0.0.1:8554", "STREAM_PASSWORD": "x"})  # local MediaMTX is fine

    def test_token_mode_needs_device_credentials(self):
        with self.assertRaises(config.ConfigError):
            cfg(STREAM_TOKEN_URL="https://veil.example.com/api/stream/publish-token")

    def test_password_not_in_repr(self):
        self.assertNotIn("hunter2-device-key", repr(cfg(STREAM_PASSWORD="hunter2-device-key")))


class FfmpegArgTests(unittest.TestCase):
    def test_token_goes_in_query_not_userinfo(self):
        # ffmpeg truncates RTSP credentials to 127 bytes; a ~770-byte JWT must travel as ?jwt=
        token = "a" * 700 + ".b.c"
        url = ffmpeg.publish_url(cfg(), token=token)
        self.assertEqual(url, f"rtsps://media.example.com:8322/cam?jwt={token}")

    def test_static_credentials_are_escaped(self):
        self.assertEqual(ffmpeg.publish_url(cfg(), "pi", "p@ss:w/rd"), "rtsps://pi:p%40ss%3Aw%2Frd@media.example.com:8322/cam")

    def test_redaction(self):
        line = ffmpeg.redact(["ffmpeg", "rtsps://pi:secret@host:8322/cam", "rtsps://host:8322/cam?jwt=eyJabc.def.ghi"])
        self.assertNotIn("secret", line)
        self.assertNotIn("eyJabc", line)

    def test_x264_is_browser_safe(self):
        args = ffmpeg.encoder_args(cfg(VIDEO_FPS="25"), "libx264")
        self.assertIn("baseline", args)
        self.assertEqual(args[args.index("-bf") + 1], "0")  # MediaMTX/WebRTC reject B-frames
        self.assertIn("keyint=25:min-keyint=25:scenecut=0:repeat-headers=1", args)


class BackoffTests(unittest.TestCase):
    def test_exponential_capped_with_jitter(self):
        b = Backoff(1, 30, rand=lambda: 0.5)
        self.assertEqual([round(b.next()) for _ in range(8)], [1, 2, 4, 8, 16, 30, 30, 30])
        b.reset()
        self.assertEqual(round(b.next()), 1)
        lo, hi = Backoff(1, 30, rand=lambda: 0.0), Backoff(1, 30, rand=lambda: 1.0)
        self.assertAlmostEqual(lo.next(), 0.8)
        self.assertAlmostEqual(hi.next(), 1.2)


class ProgressTests(unittest.TestCase):
    def test_counts_frames_only_when_they_advance(self):
        p = Progress()
        p.read(io.BytesIO(b"frame=0\ntotal_size=0\nprogress=continue\nframe=12\nprogress=continue\nframe=12\n"))
        self.assertEqual(p.frames, 12)
        self.assertGreater(p.last_advance, 0)


class TestPatternTests(unittest.TestCase):
    def test_timestamp_round_trip(self):
        src = TestPatternSource(cfg(CAMERA_TYPE="test", VIDEO_WIDTH="640", VIDEO_HEIGHT="360"), clock=lambda: 1792480000.123)
        frame = src.read()
        self.assertEqual(len(frame), 640 * 360 * 3 // 2)
        self.assertEqual(TestPatternSource.decode_time(frame[:640], 640), 1792480000123)


class _TokenHandler(BaseHTTPRequestHandler):
    reply = (200, {"token": "eyJ.x.y", "path": "cam"})

    def do_POST(self):
        self.server.seen_auth = self.headers.get("Authorization")
        status, body = self.reply
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(body).encode())

    def log_message(self, *a):
        pass


class AuthTests(unittest.TestCase):
    def setUp(self):
        self.srv = HTTPServer(("127.0.0.1", 0), _TokenHandler)
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()
        self.url = f"http://127.0.0.1:{self.srv.server_port}/api/stream/publish-token"

    def tearDown(self):
        if self.srv:
            self.srv.shutdown()
            self.srv.server_close()

    def c(self, **kw):
        return cfg(STREAM_TOKEN_URL=self.url, STREAM_USERNAME="robot-01", STREAM_PASSWORD="device-key", **kw)

    def test_exchanges_device_key_for_token(self):
        _TokenHandler.reply = (200, {"token": "eyJ.x.y", "path": "cam"})
        creds = auth.credentials(self.c())
        self.assertEqual(creds.token, "eyJ.x.y")
        self.assertTrue(self.srv.seen_auth.startswith("Basic "))

    def test_rejected_device_is_permanent_error(self):
        _TokenHandler.reply = (401, {"error": "invalid_credentials"})
        with self.assertRaises(auth.AuthError):
            auth.credentials(self.c())

    def test_path_mismatch_is_permanent_error(self):
        _TokenHandler.reply = (200, {"token": "eyJ.x.y", "path": "cam2"})
        with self.assertRaises(auth.AuthError):
            auth.credentials(self.c())

    def test_server_error_and_unreachable_are_transient(self):
        _TokenHandler.reply = (503, {"error": "not_configured"})
        with self.assertRaises(auth.TransientAuthError):
            auth.credentials(self.c())
        self.srv.shutdown()
        self.srv.server_close()
        self.srv = None
        with self.assertRaises(auth.TransientAuthError):
            auth.credentials(self.c())

    def test_static_mode_skips_token_service(self):
        creds = auth.credentials(config.load({"STREAM_SERVER_URL": "rtsp://127.0.0.1:8554", "STREAM_USERNAME": "u", "STREAM_PASSWORD": "p"}))
        self.assertEqual((creds.user, creds.password, creds.token), ("u", "p", None))


class CredentialCacheTests(unittest.TestCase):
    def test_reuses_token_until_close_to_expiry(self):
        now = [1000.0]
        calls = []

        def fetch(_cfg):
            calls.append(now[0])
            return auth.Credentials(token=f"t{len(calls)}", expires_at=now[0] + 300)

        cache = auth.CredentialCache(cfg(), fetch=fetch, clock=lambda: now[0])
        self.assertEqual(cache.get().token, "t1")
        now[0] += 200  # 100 s left → still reused
        self.assertEqual(cache.get().token, "t1")
        now[0] += 50   # 50 s left (< 60 s margin) → refreshed
        self.assertEqual(cache.get().token, "t2")
        cache.invalidate()
        self.assertEqual(cache.get().token, "t3")
        self.assertEqual(len(calls), 3)

    def test_static_credentials_are_not_refetched(self):
        calls = []
        cache = auth.CredentialCache(cfg(), fetch=lambda c: calls.append(1) or auth.Credentials("u", "p"))
        cache.get(); cache.get()
        self.assertEqual(len(calls), 1)


if __name__ == "__main__":
    unittest.main()
