# Upstream PR Hygiene Checklist

Run this checklist on every `feature/*` branch before opening a PR to `upstream/main`.

## 1) Branch ancestry

```bash
make -f .wsl2/Makefile branch-status
make -f .wsl2/Makefile pr-hygiene
```

Expected:
- `pr-hygiene` passes ancestry check against `upstream/main` (or approved fallback base).

## 2) Diff scope

```bash
git diff --name-status upstream/main...HEAD
```

Expected:
- Only intended product files are present.
- No local ops or secret artifacts.

## 3) Forbidden paths

Must not appear in upstream PRs:
- `.wsl2/env/.env.dev`
- `.wsl2/env/.env.edge`
- `.wsl2/env/.env.qa`
- `.wsl2/env/.env.*.bak.*`
- `.wsl2/ops/cron/*.cron` (host-specific schedules)

## 4) Functional validation

Run tests/smoke relevant to touched components.

Examples:
- `npm test`
- `make -f .wsl2/Makefile dev-smoke`

## 5) Rebase freshness

```bash
git fetch upstream
git rebase upstream/main
```

Expected:
- PR branch is current against upstream head before opening PR.

## 6) PR description quality

Include:
- What changed.
- What was intentionally excluded (especially local ops/environment changes).
- Test evidence and known caveats.
