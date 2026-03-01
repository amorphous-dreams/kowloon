#!/usr/bin/env bash
set -euo pipefail

source ./.wsl2/scripts/stack-common.sh

ENV_FILE=".wsl2/env/.env.qa"
QA_COMPOSE=(docker compose --env-file "$ENV_FILE" -p kowloon-qa -f .wsl2/compose/docker-compose.qa.yml)

ensure_file "$ENV_FILE"

DOMAIN="$(env_get "$ENV_FILE" DOMAIN)"
S3_BUCKET="$(env_get "$ENV_FILE" S3_BUCKET)"
S3_ACCESS_KEY="$(env_get "$ENV_FILE" S3_ACCESS_KEY)"
S3_SECRET_KEY="$(env_get "$ENV_FILE" S3_SECRET_KEY)"
S3_PUBLIC_URL="$(env_get "$ENV_FILE" S3_PUBLIC_URL)"

DOMAIN="${DOMAIN:-kowloon.local}"
S3_BUCKET="${S3_BUCKET:-kowloon-qa}"

echo "Checking QA container health..."
"${QA_COMPOSE[@]}" ps

echo "Waiting for QA app readiness..."
for i in $(seq 1 45); do
  if "${QA_COMPOSE[@]}" exec -T kowloon curl -fsS http://localhost:3000/__health >/dev/null 2>&1; then
    break
  fi
  sleep 1
  if [[ "$i" == "45" ]]; then
    echo "FAIL: QA app did not become ready in time"
    exit 1
  fi
done

echo "Checking QA direct app health..."
direct="$("${QA_COMPOSE[@]}" exec -T kowloon curl -fsS http://localhost:3000/__health)"
echo "$direct" | grep -Eq '"ok"[[:space:]]*:[[:space:]]*true'
echo "PASS qa direct: $direct"

echo "Checking QA Traefik HTTP host-route..."
http_status="$(curl -s -o /tmp/kowloon-qa-http-route.out -w "%{http_code}" -H "Host: ${DOMAIN}" http://localhost/__health)"
if [[ "$http_status" == "301" || "$http_status" == "302" || "$http_status" == "307" || "$http_status" == "308" ]]; then
  echo "PASS qa traefik http: redirect status ${http_status}"
elif [[ "$http_status" == "200" ]]; then
  http_route="$(cat /tmp/kowloon-qa-http-route.out)"
  echo "$http_route" | grep -Eq '"ok"[[:space:]]*:[[:space:]]*true'
  echo "PASS qa traefik http: $http_route"
else
  echo "FAIL: qa traefik http returned status ${http_status}"
  exit 1
fi

echo "Checking QA Traefik HTTPS host-route..."
https_route="$(curl -kfsS -H "Host: ${DOMAIN}" https://localhost/__health)"
echo "$https_route" | grep -Eq '"ok"[[:space:]]*:[[:space:]]*true'
echo "PASS qa traefik https: $https_route"

echo "Checking edge Traefik dashboard/ping..."
curl -fsS http://localhost:8080/ping >/dev/null
curl -fsS http://localhost:8080/api/overview >/dev/null
echo "PASS edge traefik dashboard/ping"

echo "Checking QA MinIO bucket and public URL..."
"${QA_COMPOSE[@]}" exec -T minio sh -lc \
  "mc alias set local http://localhost:9000 '${S3_ACCESS_KEY}' '${S3_SECRET_KEY}' >/dev/null && mc ls local/'${S3_BUCKET}' >/dev/null"
status_code="$(curl -k -s -o /dev/null -w "%{http_code}" "${S3_PUBLIC_URL}/")"
if [[ "$status_code" == "000" ]]; then
  echo "FAIL: QA S3_PUBLIC_URL not reachable: ${S3_PUBLIC_URL}/"
  exit 1
fi

# Accepted:
# - 200: public listing/object endpoint works
# - 3xx: endpoint redirects (edge/proxy behavior)
# - 403: reachable but listing denied (still proves routing is correct)
case "$status_code" in
  200|301|302|307|308|403)
    echo "PASS qa minio bucket/public URL (status $status_code)"
    ;;
  *)
    echo "FAIL: QA S3_PUBLIC_URL returned unexpected status $status_code: ${S3_PUBLIC_URL}/"
    echo "Expected one of: 200, 301, 302, 307, 308, 403"
    exit 1
    ;;
esac

echo "QA smoke test passed."
