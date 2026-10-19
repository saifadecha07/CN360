#!/usr/bin/env bash
# Host firewall for the VEIL media VPS (Ubuntu/Debian, ufw). Run as root: sudo ./scripts/firewall.sh --apply
# Without --apply it only prints the rules.
#
# WebRTC media does NOT go through 443. 443 only carries the WHEP handshake (HTTPS);
# the video itself needs 8189/udp (or 8189/tcp), or TURN on 3478 + the relay range.
set -euo pipefail

RULES=(
  "22/tcp      SSH (consider restricting to your admin IPs: ufw allow from <ip> to any port 22)"
  "80/tcp      HTTP → Let's Encrypt HTTP-01 challenge + redirect to HTTPS (Caddy)"
  "443/tcp     HTTPS → WHEP signalling (Caddy → MediaMTX 127.0.0.1:8889)"
  "443/udp     HTTP/3 (Caddy, optional)"
  "8322/tcp    RTSPS → Raspberry Pi publishes here"
  "8189/udp    WebRTC media (ICE, preferred)"
  "8189/tcp    WebRTC media over TCP (fallback when UDP is blocked)"
  "3478/udp    TURN"
  "3478/tcp    TURN over TCP"
  "49160:49200/udp  TURN relay ports (coturn min-port..max-port)"
)
# Deliberately NOT opened: 8889 (WHEP, loopback only), 9997 (API, disabled), 9998 (metrics, loopback),
# 8554 (plain RTSP, disabled), 1935/8888/8890 (RTMP/HLS/SRT, disabled), 2019 (Caddy admin, loopback).

for r in "${RULES[@]}"; do echo "allow ${r}"; done
[[ "${1:-}" == "--apply" ]] || { echo; echo "Dry run. Re-run with --apply (as root) to configure ufw."; exit 0; }

command -v ufw >/dev/null || { apt-get update && apt-get install -y ufw; }
ufw default deny incoming
ufw default allow outgoing
for r in "${RULES[@]}"; do ufw allow "${r%% *}"; done
ufw --force enable
ufw status verbose
