"""Publishing supervisor: camera → ffmpeg → MediaMTX, forever, with recovery.

One session = credentials → open camera → start ffmpeg → pump frames until something
breaks (network, server restart, camera unplugged, stall). Then everything is torn
down, and the next session starts after an exponential backoff (with jitter, capped
at RECONNECT_MAX_DELAY). A session that stayed up for a while resets the backoff.
"""
from __future__ import annotations

import logging
import random
import re
import subprocess
import threading
import time
from collections import deque
from typing import Optional

from . import auth, ffmpeg
from .config import Config
from .sdnotify import notify
from .sources import CameraError, Source, open_source

log = logging.getLogger("publisher")

STABLE_AFTER_S = 30.0


class Backoff:
    def __init__(self, base: float = 1.0, cap: float = 30.0, rand=random.random):
        self.base, self.cap, self.rand, self.n = base, cap, rand, 0

    def next(self) -> float:
        d = min(self.cap, self.base * 2 ** min(self.n, 16))
        self.n += 1
        return d * (0.8 + 0.4 * self.rand())

    def reset(self) -> None:
        self.n = 0


class SessionEnded(Exception):
    pass


class PipeSink:
    """File-like ffmpeg stdin that records when data last went through (stall detection)."""

    def __init__(self, proc: subprocess.Popen):
        self.proc = proc
        self.last_write = time.monotonic()
        self.bytes = 0
        self.broken = threading.Event()
        self.blocked_since = 0.0  # >0 while a write is stuck: ffmpeg isn't draining its input

    def write(self, data) -> int:
        if self.broken.is_set():
            raise SessionEnded("ffmpeg input closed")
        self.blocked_since = time.monotonic()
        try:
            n = self.proc.stdin.write(data)
            self.proc.stdin.flush()
        except (BrokenPipeError, ValueError, OSError) as e:
            self.broken.set()
            raise SessionEnded(f"ffmpeg input closed: {e}") from None
        finally:
            self.blocked_since = 0.0
        self.last_write = time.monotonic()
        self.bytes += len(data)
        return n if n is not None else len(data)

    def flush(self) -> None:
        pass


class Progress:
    """Parses ffmpeg -progress key=value blocks; frames only advance once the muxer is writing to the server."""

    def __init__(self):
        self.frames = 0
        self.last_advance = 0.0

    def read(self, stream) -> None:
        for raw in iter(stream.readline, b""):
            key, _, value = raw.decode(errors="replace").strip().partition("=")
            if key == "frame" and value.isdigit() and int(value) > self.frames:
                self.frames = int(value)
                self.last_advance = time.monotonic()


class Publisher:
    def __init__(self, cfg: Config):
        self.cfg = cfg
        self.stop_event = threading.Event()
        self.backoff = Backoff(1.0, float(cfg.reconnect_max_delay))
        self.sessions = 0
        self.state = "starting"
        self.creds = auth.CredentialCache(cfg)
        self._encoder: Optional[str] = None

    # ── lifecycle ────────────────────────────────────────────────────────

    def stop(self) -> None:
        self.stop_event.set()

    def run(self) -> None:
        notify("READY=1", f"STATUS=starting; target {self.cfg.publish_url_redacted}")
        watchdog = threading.Thread(target=self._watchdog_loop, name="sd-watchdog", daemon=True)
        watchdog.start()
        while not self.stop_event.is_set():
            started = time.monotonic()
            reason = self._one_session()
            if self.stop_event.is_set():
                break
            if time.monotonic() - started >= STABLE_AFTER_S:
                self.backoff.reset()
            delay = self.backoff.next()
            if isinstance(reason, auth.AuthError):
                delay = max(delay, float(self.cfg.reconnect_max_delay))
            if isinstance(reason, auth.TransientAuthError) and reason.retry_after:
                delay = max(delay, reason.retry_after)
            self.state = "waiting"
            notify(f"STATUS=disconnected: {reason}; retry in {delay:.0f}s")
            log.warning("stream down (%s) — retrying in %.1f s", reason, delay)
            self.stop_event.wait(delay)
        notify("STOPPING=1")
        log.info("publisher stopped")

    def _watchdog_loop(self) -> None:
        # Pings systemd while the supervisor thread is alive; a deadlock stops the pings → systemd restarts us.
        while not self.stop_event.wait(10):
            notify("WATCHDOG=1")

    # ── one publishing session ───────────────────────────────────────────

    def _one_session(self):
        self.sessions += 1
        source: Optional[Source] = None
        proc: Optional[subprocess.Popen] = None
        try:
            self.state = "authenticating"
            tls_problem = ffmpeg.verify_server_tls(self.cfg)
            if tls_problem:
                return f"TLS pre-check: {tls_problem}"
            creds = self.creds.get()

            self.state = "opening camera"
            source = open_source(self.cfg)
            source.open()
            log.info("camera ready: %s", source.description)

            url = ffmpeg.publish_url(self.cfg, creds.user, creds.password, creds.token)
            if source.mode == "h264":
                cmd = ffmpeg.cmd_h264_passthrough(self.cfg, url)
            else:
                self._encoder = self._encoder or ffmpeg.choose_encoder(self.cfg)
                if source.mode == "ffmpeg":
                    cmd = ffmpeg.cmd_v4l2(self.cfg, url, self._encoder, source.device)
                else:
                    cmd = ffmpeg.cmd_rawvideo(self.cfg, url, self._encoder, source.pix_fmt, source.size)
            log.debug("ffmpeg: %s", ffmpeg.redact(cmd))

            self.state = "connecting"
            proc = subprocess.Popen(cmd, stdin=subprocess.PIPE if source.mode != "ffmpeg" else subprocess.DEVNULL,
                                    stdout=subprocess.PIPE, stderr=subprocess.PIPE, bufsize=0)
            errors: deque = deque(maxlen=20)
            progress = Progress()
            threading.Thread(target=self._drain_stderr, args=(proc, errors), daemon=True).start()
            threading.Thread(target=progress.read, args=(proc.stdout,), daemon=True).start()
            result = self._pump(source, proc, errors, progress)
            if progress.frames == 0 and any(re.search(r"\b(401|403)\b|Unauthorized|Forbidden", e) for e in errors):
                # The server refused our credentials (expired, revoked, key rotated): fetch a fresh token next time.
                self.creds.invalidate()
            return result
        except (auth.AuthError, auth.TransientAuthError) as e:
            log.error("%s", e)
            return e
        except CameraError as e:
            log.error("camera error: %s", e)
            return f"camera error: {e}"
        except Exception as e:  # never let one bad session kill the supervisor
            log.exception("unexpected error in session")
            return f"unexpected error: {e}"
        finally:
            self._stop_ffmpeg(proc)
            if source is not None:
                source.close()
                log.debug("camera released")

    def _pump(self, source: Source, proc: subprocess.Popen, errors: deque, progress: "Progress") -> str:
        sink = PipeSink(proc) if proc.stdin else None
        failure: list = []

        def feed():
            try:
                if source.mode == "h264":
                    source.start_encoder(sink)
                    return  # Picamera2's encoder thread writes into sink from here on
                while not self.stop_event.is_set() and not sink.broken.is_set():
                    sink.write(source.read())
            except (SessionEnded, CameraError) as e:
                failure.append(str(e))
            except Exception as e:
                failure.append(f"frame loop: {e}")

        if sink:
            threading.Thread(target=feed, name="frames", daemon=True).start()

        live_logged = False
        started = time.monotonic()
        while not self.stop_event.wait(0.5):
            if proc.poll() is not None:
                detail = errors[-1] if errors else "no error output"
                return f"ffmpeg exited ({proc.returncode}): {detail}"
            if failure:
                return failure[0]
            now = time.monotonic()
            if sink and now - sink.last_write > self.cfg.stall_timeout:
                if sink.blocked_since:
                    return f"ffmpeg stopped accepting frames for {self.cfg.stall_timeout}s (network stalled or server unresponsive)"
                return f"camera delivered no frames for {self.cfg.stall_timeout}s"
            # Frames muxed to the server are the only proof of publishing; a blocked TCP send stops them.
            if now - max(progress.last_advance, started) > self.cfg.stall_timeout + 5:
                return f"no frames reached the server for {self.cfg.stall_timeout + 5}s (network stalled or server not accepting)"
            if not live_logged and progress.frames > 0:
                live_logged = True
                self.state = "publishing"
                notify(f"STATUS=publishing {self.cfg.publish_url_redacted}")
                log.info("publishing to %s (session %d, first frames after %.1f s)",
                         self.cfg.publish_url_redacted, self.sessions, now - started)
        return "shutdown"

    @staticmethod
    def _drain_stderr(proc: subprocess.Popen, errors: deque) -> None:
        last_logged = 0.0
        for raw in iter(proc.stderr.readline, b""):
            line = raw.decode(errors="replace").strip()
            if not line:
                continue
            line = ffmpeg.redact([line])
            errors.append(line)
            # ffmpeg can repeat a warning per frame; keep the journal readable.
            if time.monotonic() - last_logged > 5:
                last_logged = time.monotonic()
                log.warning("ffmpeg: %s", line)

    @staticmethod
    def _stop_ffmpeg(proc: Optional[subprocess.Popen]) -> None:
        if proc is None or proc.poll() is not None:
            return
        try:
            if proc.stdin:
                proc.stdin.close()  # lets ffmpeg flush and send RTSP TEARDOWN
        except OSError:
            pass
        try:
            proc.wait(timeout=3)
        except subprocess.TimeoutExpired:
            proc.terminate()
            try:
                proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait()
