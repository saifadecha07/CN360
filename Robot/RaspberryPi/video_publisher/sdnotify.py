"""Minimal sd_notify(3) without dependencies. No-op when not started by systemd (Type=notify)."""
from __future__ import annotations

import os
import socket


def notify(*messages: str) -> None:
    addr = os.environ.get("NOTIFY_SOCKET")
    if not addr:
        return
    if addr.startswith("@"):
        addr = "\0" + addr[1:]
    try:
        with socket.socket(socket.AF_UNIX, socket.SOCK_DGRAM) as s:
            s.sendto("\n".join(messages).encode(), addr)
    except OSError:
        pass
