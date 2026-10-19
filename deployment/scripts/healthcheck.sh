#!/usr/bin/env bash
# Restarts unhealthy containers (Docker's restart policy only covers crashes, not "unhealthy")
# and checks the public HTTPS endpoint end to end. Run every minute by veil-media-health.timer.
set -uo pipefail
cd "$(dirname "$0")/.."
# shellcheck disable=SC1091
source .env

status=0
for svc in caddy mediamtx coturn; do
  id=$(docker compose ps -q "$svc")
  if [[ -z "$id" ]]; then
    echo "veil-media: $svc is not running — starting it"
    docker compose up -d "$svc"; status=1; continue
  fi
  health=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$id")
  if [[ "$health" == "unhealthy" ]]; then
    echo "veil-media: $svc is unhealthy — restarting"
    docker compose restart "$svc"; status=1
  fi
done

if ! curl -fsS --max-time 10 "https://${MEDIA_DOMAIN}/healthz" >/dev/null; then
  echo "veil-media: https://${MEDIA_DOMAIN}/healthz failed (DNS, certificate or Caddy problem)"
  status=1
fi
exit $status
