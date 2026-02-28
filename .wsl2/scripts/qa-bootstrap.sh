#!/usr/bin/env bash
set -euo pipefail

source ./.wsl2/scripts/stack-common.sh

ENV_FILE=".wsl2/env/.env.qa"
COMPOSE=(docker compose --env-file "$ENV_FILE" -p kowloon-qa -f .wsl2/compose/docker-compose.qa.yml)

ensure_file "$ENV_FILE"
EDGE_NETWORK="$(env_get "$ENV_FILE" EDGE_NETWORK)"
EDGE_NETWORK="${EDGE_NETWORK:-kowloon-edge}"
ensure_edge_network "$EDGE_NETWORK"

MONGO_USERNAME="$(env_get "$ENV_FILE" MONGO_USERNAME)"
MONGO_PASSWORD="$(env_get "$ENV_FILE" MONGO_PASSWORD)"
MONGO_DATABASE="$(env_get "$ENV_FILE" MONGO_DATABASE)"
S3_ACCESS_KEY="$(env_get "$ENV_FILE" S3_ACCESS_KEY)"
S3_SECRET_KEY="$(env_get "$ENV_FILE" S3_SECRET_KEY)"
S3_BUCKET="$(env_get "$ENV_FILE" S3_BUCKET)"

MONGO_USERNAME="${MONGO_USERNAME:-kowloon}"
MONGO_PASSWORD="${MONGO_PASSWORD:-kowloon_password}"
MONGO_DATABASE="${MONGO_DATABASE:-kowloon_qa}"
S3_ACCESS_KEY="${S3_ACCESS_KEY:-minioadmin}"
S3_SECRET_KEY="${S3_SECRET_KEY:-minioadmin}"
S3_BUCKET="${S3_BUCKET:-kowloon-qa}"

echo "Starting QA data plane services..."
"${COMPOSE[@]}" up -d --wait mongodb minio

echo "Bootstrapping QA MinIO bucket '${S3_BUCKET}'..."
"${COMPOSE[@]}" exec -T minio sh -lc \
  "mc alias set local http://localhost:9000 '${S3_ACCESS_KEY}' '${S3_SECRET_KEY}' >/dev/null && \
   mc mb local/'${S3_BUCKET}' --ignore-existing >/dev/null && \
   mc anonymous set download local/'${S3_BUCKET}' >/dev/null"

echo "Verifying QA MongoDB and ensuring DB '${MONGO_DATABASE}' exists..."
"${COMPOSE[@]}" exec -T mongodb mongosh \
  -u "${MONGO_USERNAME}" \
  -p "${MONGO_PASSWORD}" \
  --authenticationDatabase admin \
  --quiet \
  --eval "const d=db.getSiblingDB('${MONGO_DATABASE}'); d.getCollection('_qa_bootstrap').updateOne({_id:'bootstrap'}, {\$set:{updatedAt:new Date()}}, {upsert:true}); printjson(d.runCommand({ ping: 1 }));" >/dev/null

echo "QA bootstrap complete."
