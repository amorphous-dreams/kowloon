#!/usr/bin/env bash
set -euo pipefail

source ./.wsl2/scripts/stack-common.sh

ENV_FILE=".wsl2/env/.env.dev"
COMPOSE=(docker compose --env-file "$ENV_FILE" -f docker-compose.yml -f .wsl2/compose/docker-compose.dev.yml)

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE. Copy .wsl2/env/.env.dev.example to $ENV_FILE first."
  exit 1
fi

env_get() {
  local key="$1"
  local value
  value="$(awk -F= -v k="$key" '$1==k {sub(/^[^=]*=/, "", $0); print $0; exit}' "$ENV_FILE")"
  echo "${value}"
}

DEV_DOMAIN="$(env_get DEV_DOMAIN)"
S3_BUCKET="$(env_get S3_BUCKET)"
S3_ACCESS_KEY="$(env_get S3_ACCESS_KEY)"
S3_SECRET_KEY="$(env_get S3_SECRET_KEY)"
S3_PUBLIC_URL="$(env_get S3_PUBLIC_URL)"

DEV_DOMAIN="${DEV_DOMAIN:-kowloon.localhost}"
S3_BUCKET="${S3_BUCKET:-kowloon}"
S3_ACCESS_KEY="${S3_ACCESS_KEY:-minioadmin}"
S3_SECRET_KEY="${S3_SECRET_KEY:-minioadmin}"
S3_PUBLIC_URL="${S3_PUBLIC_URL:-http://localhost:9000/kowloon}"

echo "Checking container health..."
"${COMPOSE[@]}" ps

echo "Waiting for direct app health endpoint..."
wait_for_http "http://localhost:3000/__health" 45 1 || {
  echo "FAIL: app health endpoint did not become ready in time"
  exit 1
}

echo "Checking direct app health..."
direct="$(curl -fsS http://localhost:3000/__health)"
echo "${direct}" | grep -Eq '"ok"[[:space:]]*:[[:space:]]*true'
echo "PASS direct: ${direct}"

echo "Checking Traefik HTTP host-route..."
http_route="$(curl -fsS -H "Host: ${DEV_DOMAIN}" http://localhost/__health)"
echo "${http_route}" | grep -Eq '"ok"[[:space:]]*:[[:space:]]*true'
echo "PASS traefik http: ${http_route}"

echo "Checking Traefik HTTPS host-route..."
https_route="$(curl -kfsS -H "Host: ${DEV_DOMAIN}" https://localhost/__health)"
echo "${https_route}" | grep -Eq '"ok"[[:space:]]*:[[:space:]]*true'
echo "PASS traefik https: ${https_route}"

echo "Checking Traefik ping and dashboard..."
curl -fsS http://localhost:8080/ping >/dev/null
curl -fsS http://localhost:8080/api/overview >/dev/null
echo "PASS traefik dashboard/ping"

echo "Checking MinIO bucket and public URL..."
docker exec kowloon-minio mc alias set local http://localhost:9000 "${S3_ACCESS_KEY}" "${S3_SECRET_KEY}" >/dev/null
docker exec kowloon-minio mc ls "local/${S3_BUCKET}" >/dev/null
status_code="$(curl -s -o /dev/null -w "%{http_code}" "${S3_PUBLIC_URL}/")"
if [[ "${status_code}" == "000" ]]; then
  echo "FAIL: S3_PUBLIC_URL not reachable: ${S3_PUBLIC_URL}/"
  exit 1
fi
echo "PASS minio bucket/public URL (status ${status_code})"

echo "Smoke test passed."
