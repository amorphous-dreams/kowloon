#!/usr/bin/env bash
set -euo pipefail

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

MONGO_USERNAME="$(env_get MONGO_USERNAME)"
MONGO_PASSWORD="$(env_get MONGO_PASSWORD)"
MONGO_DATABASE="$(env_get MONGO_DATABASE)"
S3_ACCESS_KEY="$(env_get S3_ACCESS_KEY)"
S3_SECRET_KEY="$(env_get S3_SECRET_KEY)"
S3_BUCKET="$(env_get S3_BUCKET)"

MONGO_USERNAME="${MONGO_USERNAME:-kowloon}"
MONGO_PASSWORD="${MONGO_PASSWORD:-kowloon_password}"
MONGO_DATABASE="${MONGO_DATABASE:-kowloon_dev}"
S3_ACCESS_KEY="${S3_ACCESS_KEY:-minioadmin}"
S3_SECRET_KEY="${S3_SECRET_KEY:-minioadmin}"
S3_BUCKET="${S3_BUCKET:-kowloon}"

echo "Starting infrastructure services (mongodb, minio, traefik)..."
"${COMPOSE[@]}" up -d --wait mongodb minio traefik

echo "Waiting for infrastructure to report healthy..."
"${COMPOSE[@]}" ps

echo "Bootstrapping MinIO bucket '${S3_BUCKET}' (idempotent)..."
docker exec kowloon-minio mc alias set local http://localhost:9000 "${S3_ACCESS_KEY}" "${S3_SECRET_KEY}" >/dev/null
docker exec kowloon-minio mc mb "local/${S3_BUCKET}" --ignore-existing >/dev/null
docker exec kowloon-minio mc anonymous set download "local/${S3_BUCKET}" >/dev/null

echo "Verifying MongoDB auth and ensuring DB '${MONGO_DATABASE}' exists..."
"${COMPOSE[@]}" exec -T mongodb mongosh \
  -u "${MONGO_USERNAME}" \
  -p "${MONGO_PASSWORD}" \
  --authenticationDatabase admin \
  --quiet \
  --eval "const d=db.getSiblingDB('${MONGO_DATABASE}'); d.getCollection('_dev_bootstrap').updateOne({_id:'bootstrap'}, {\$set:{updatedAt:new Date()}}, {upsert:true}); printjson(d.runCommand({ ping: 1 }));" >/dev/null

echo "Bootstrap complete."
