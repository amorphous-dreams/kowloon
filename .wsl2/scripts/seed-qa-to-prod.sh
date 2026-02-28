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

QA_MONGO_USERNAME="${QA_MONGO_USERNAME:-kowloon}"
QA_MONGO_PASSWORD="${QA_MONGO_PASSWORD:-kowloon_password}"
QA_MONGO_DATABASE="${QA_MONGO_DATABASE:-kowloon_qa}"
QA_S3_BUCKET="${QA_S3_BUCKET:-kowloon-qa}"

EDGE_NETWORK="${EDGE_NETWORK:-kowloon-edge}"
QA_MINIO_VOLUME="kowloon-qa_qa_minio_data"

ensure_edge_network "$EDGE_NETWORK"

echo "Starting QA data services..."
"${QA_COMPOSE[@]}" up -d --wait mongodb minio

ts="$(date +%Y%m%d-%H%M%S)"
out_dir="exports/qa-seed-${ts}"
mkdir -p "$out_dir"

mongo_archive="${out_dir}/qa-mongo-${QA_MONGO_DATABASE}.archive.gz"
minio_archive="${out_dir}/qa-minio-volume-${QA_S3_BUCKET}.tar.gz"
manifest="${out_dir}/manifest.txt"

echo "Exporting QA MongoDB database '${QA_MONGO_DATABASE}' to ${mongo_archive}..."
"${QA_COMPOSE[@]}" exec -T mongodb mongodump \
  -u "${QA_MONGO_USERNAME}" \
  -p "${QA_MONGO_PASSWORD}" \
  --authenticationDatabase admin \
  --db "${QA_MONGO_DATABASE}" \
  --archive \
  --gzip > "${mongo_archive}"

echo "Exporting QA MinIO volume '${QA_MINIO_VOLUME}' to ${minio_archive}..."
docker run --rm \
  -v "${QA_MINIO_VOLUME}:/data" \
  -v "$(pwd)/${out_dir}:/backup" \
  alpine sh -lc "tar czf /backup/$(basename "${minio_archive}") -C /data ."

cat > "${manifest}" <<EOF
qa_seed_created_at=${ts}
qa_mongo_database=${QA_MONGO_DATABASE}
qa_s3_bucket=${QA_S3_BUCKET}
mongo_archive=${mongo_archive}
minio_volume_archive=${minio_archive}
notes=Use these artifacts for initial external production deployment import.
EOF

echo "QA seed export complete:"
echo "  - ${mongo_archive}"
echo "  - ${minio_archive}"
echo "  - ${manifest}"
