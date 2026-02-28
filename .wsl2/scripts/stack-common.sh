#!/usr/bin/env bash
set -euo pipefail

ensure_file() {
  local f="$1"
  if [[ ! -f "$f" ]]; then
    echo "Missing $f"
    exit 1
  fi
}

env_get() {
  local file="$1"
  local key="$2"
  local value
  value="$(awk -F= -v k="$key" '$1==k {sub(/^[^=]*=/, "", $0); print $0; exit}' "$file")"
  echo "${value}"
}

ensure_edge_network() {
  local net="${1:-kowloon-edge}"
  docker network inspect "$net" >/dev/null 2>&1 || docker network create "$net" >/dev/null
}

wait_for_http() {
  local url="$1"
  local max_attempts="${2:-30}"
  local delay_s="${3:-1}"
  local extra_args="${4:-}"
  local i
  for i in $(seq 1 "$max_attempts"); do
    if curl -fsS ${extra_args} "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep "$delay_s"
  done
  return 1
}
