#!/usr/bin/env bash
# Installs the VEIL camera publisher as a systemd service on Raspberry Pi OS (Bookworm or newer).
#   sudo ./install-publisher.sh
# Re-running upgrades the code and keeps /etc/veil-publisher/publisher.env.
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo "run with sudo"; exit 1; }
here="$(cd "$(dirname "$0")" && pwd)"

echo "→ packages"
apt-get update
apt-get install -y --no-install-recommends python3 ffmpeg python3-picamera2 python3-opencv

echo "→ service user veil-cam (groups: video, render)"
id veil-cam >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin veil-cam
usermod -aG video,render veil-cam

echo "→ code in /opt/veil-publisher"
install -d -m 755 /opt/veil-publisher
rm -rf /opt/veil-publisher/video_publisher
cp -r "$here/video_publisher" /opt/veil-publisher/
install -m 644 "$here/README.md" /opt/veil-publisher/README.md
find /opt/veil-publisher -name '__pycache__' -prune -exec rm -rf {} +

echo "→ configuration /etc/veil-publisher/publisher.env"
install -d -m 750 -o root -g veil-cam /etc/veil-publisher
if [[ ! -f /etc/veil-publisher/publisher.env ]]; then
  install -m 640 -o root -g veil-cam "$here/publisher.env.example" /etc/veil-publisher/publisher.env
  echo "   created from the example — edit it before starting the service"
fi
chown root:veil-cam /etc/veil-publisher/publisher.env
chmod 640 /etc/veil-publisher/publisher.env

echo "→ systemd unit"
install -m 644 "$here/systemd/veil-publisher.service" /etc/systemd/system/veil-publisher.service
systemctl daemon-reload
systemctl enable veil-publisher.service

echo "→ hardware probe"
# Runs as the service user with the service's environment (read by the shell, not passed on argv).
as_service() {
  sudo -u veil-cam bash -c 'set -a; . /etc/veil-publisher/publisher.env; set +a; cd /opt/veil-publisher; exec /usr/bin/python3 -m video_publisher "$@"' _ "$@"
}
as_service --probe || true

if as_service --check-config; then
  systemctl restart veil-publisher.service
  echo "✓ started. Logs: journalctl -u veil-publisher -f"
else
  echo "! configuration incomplete — edit /etc/veil-publisher/publisher.env, then: sudo systemctl restart veil-publisher"
fi
