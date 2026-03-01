#!/usr/bin/env bash
set -euo pipefail

BASE_REF="${1:-upstream/main}"
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"

if [[ "$CURRENT_BRANCH" == "main" || "$CURRENT_BRANCH" == "ops/wsl2" ]]; then
  echo "FAIL: run PR hygiene from a feature/* branch, not '$CURRENT_BRANCH'."
  exit 1
fi

if ! git rev-parse --verify --quiet "$BASE_REF" >/dev/null; then
  if git rev-parse --verify --quiet origin/main >/dev/null; then
    BASE_REF="origin/main"
  else
    BASE_REF="main"
  fi
fi

echo "PR hygiene base: $BASE_REF"
echo "Current branch: $CURRENT_BRANCH"

BASE_SHA="$(git rev-parse "$BASE_REF")"
MERGE_BASE_SHA="$(git merge-base "$BASE_REF" HEAD)"

if [[ "$MERGE_BASE_SHA" != "$BASE_SHA" ]]; then
  echo "FAIL: branch is not cleanly based on $BASE_REF."
  echo "  merge-base: ${MERGE_BASE_SHA:0:8}"
  echo "  base:       ${BASE_SHA:0:8}"
  exit 1
fi
echo "PASS: ancestry check"

CHANGED="$(git diff --name-only "$BASE_REF"...HEAD || true)"
if [[ -z "$CHANGED" ]]; then
  echo "WARN: no changes detected against $BASE_REF"
fi

declare -a BLOCK_PATTERNS=(
  ".wsl2/env/.env.dev"
  ".wsl2/env/.env.edge"
  ".wsl2/env/.env.qa"
)

BLOCKED=0

while IFS= read -r path; do
  [[ -z "$path" ]] && continue

  for p in "${BLOCK_PATTERNS[@]}"; do
    if [[ "$path" == "$p" ]]; then
      echo "FAIL: forbidden path in PR diff: $path"
      BLOCKED=1
    fi
  done

  if [[ "$path" == .wsl2/env/.env.*.bak.* ]]; then
    echo "FAIL: backup artifact in PR diff: $path"
    BLOCKED=1
  fi

  if [[ "$path" == .wsl2/ops/cron/*.cron ]]; then
    echo "FAIL: host-specific cron file in PR diff: $path"
    BLOCKED=1
  fi
done <<< "$CHANGED"

if [[ "$BLOCKED" -ne 0 ]]; then
  exit 1
fi
echo "PASS: path contamination check"

echo "Changed files against $BASE_REF:"
git diff --name-status "$BASE_REF"...HEAD

echo "PASS: PR hygiene checks complete"
