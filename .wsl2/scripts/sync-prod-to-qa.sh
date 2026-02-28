#!/usr/bin/env bash
set -euo pipefail

source ./.wsl2/scripts/stack-common.sh

QA_ENV=".wsl2/env/.env.qa"
ensure_file "$QA_ENV"

QA_COMPOSE=(docker compose --env-file "$QA_ENV" -p kowloon-qa -f .wsl2/compose/docker-compose.qa.yml)

QA_MONGO_USERNAME="$(env_get "$QA_ENV" MONGO_USERNAME)"
QA_MONGO_PASSWORD="$(env_get "$QA_ENV" MONGO_PASSWORD)"
QA_MONGO_DATABASE="$(env_get "$QA_ENV" MONGO_DATABASE)"
QA_S3_BUCKET="$(env_get "$QA_ENV" S3_BUCKET)"
EDGE_NETWORK="$(env_get "$QA_ENV" EDGE_NETWORK)"
PROD_MONGO_ARCHIVE_DEFAULT="$(env_get "$QA_ENV" PROD_MONGO_ARCHIVE)"
PROD_MINIO_ARCHIVE_DEFAULT="$(env_get "$QA_ENV" PROD_MINIO_ARCHIVE)"

QA_MONGO_USERNAME="${QA_MONGO_USERNAME:-kowloon}"
QA_MONGO_PASSWORD="${QA_MONGO_PASSWORD:-kowloon_password}"
QA_MONGO_DATABASE="${QA_MONGO_DATABASE:-kowloon_qa}"
QA_S3_BUCKET="${QA_S3_BUCKET:-kowloon-qa}"

EDGE_NETWORK="${EDGE_NETWORK:-kowloon-edge}"
QA_MINIO_VOLUME="kowloon-qa_qa_minio_data"

PROD_MONGO_ARCHIVE="${1:-${PROD_MONGO_ARCHIVE_DEFAULT:-}}"
PROD_MINIO_ARCHIVE="${2:-${PROD_MINIO_ARCHIVE_DEFAULT:-}}"

if [[ -z "${PROD_MONGO_ARCHIVE}" || -z "${PROD_MINIO_ARCHIVE}" ]]; then
  echo "Usage: ./.wsl2/scripts/sync-prod-to-qa.sh <prod-mongo-archive.gz> <prod-minio-volume.tar.gz>"
  echo "Or set PROD_MONGO_ARCHIVE and PROD_MINIO_ARCHIVE in .wsl2/env/.env.qa"
  exit 1
fi
if [[ ! -f "${PROD_MONGO_ARCHIVE}" ]]; then
  echo "Missing production Mongo archive: ${PROD_MONGO_ARCHIVE}"
  exit 1
fi
if [[ ! -f "${PROD_MINIO_ARCHIVE}" ]]; then
  echo "Missing production MinIO archive: ${PROD_MINIO_ARCHIVE}"
  exit 1
fi

ensure_edge_network "$EDGE_NETWORK"

echo "Starting QA services needed for sync..."
"${QA_COMPOSE[@]}" up -d --wait mongodb minio kowloon

echo "Restoring Production Mongo archive into QA database '${QA_MONGO_DATABASE}'..."
cat "${PROD_MONGO_ARCHIVE}" | "${QA_COMPOSE[@]}" exec -T mongodb mongorestore \
  -u "${QA_MONGO_USERNAME}" \
  -p "${QA_MONGO_PASSWORD}" \
  --authenticationDatabase admin \
  --drop \
  --archive \
  --gzip >/dev/null

echo "Restoring Production MinIO volume archive into QA volume '${QA_MINIO_VOLUME}'..."
"${QA_COMPOSE[@]}" stop minio >/dev/null
docker run --rm -v "${QA_MINIO_VOLUME}:/data" alpine sh -lc "rm -rf /data/*"
docker run --rm \
  -v "${QA_MINIO_VOLUME}:/data" \
  -v "$(dirname "${PROD_MINIO_ARCHIVE}"):/backup" \
  alpine sh -lc "tar xzf /backup/$(basename "${PROD_MINIO_ARCHIVE}") -C /data"
"${QA_COMPOSE[@]}" up -d --wait minio >/dev/null

echo "Running QA post-sync sanitization..."
"${QA_COMPOSE[@]}" exec -T kowloon node /app/.wsl2/scripts/sanitize-qa-after-sync.mjs

echo "Production -> QA sync complete."
