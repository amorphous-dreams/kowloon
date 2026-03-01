# Branching Strategy: Fork + Ops Isolation

## Branch model

- `upstream/main`: canonical source of truth.
- `origin/main`: mirror of `upstream/main` (fast-forward only, no local commits).
- `origin/ops/wsl2`: long-lived fork-only ops branch for `.wsl2` infra/runbook workflow.
- `origin/feature/*`: short-lived product branches intended for upstream PRs; always created from `upstream/main` (fallback `origin/main` when upstream ref is unavailable locally).

## Baseline in this repo

- Ops baseline commit: `f4825df` (`check in WSL2 dev/qa setup`).
- Historical branch `feature/bsky-login` remains as anchor.
- Active ops branch should be `ops/wsl2`.

## Rules

1. Do not commit to `main`.
2. Do not create upstream product PRs from `ops/wsl2`.
3. Create product branches from `upstream/main` only.
4. Cherry-pick product-only commits if work started elsewhere.
5. Rebase product branches on latest upstream before opening PR.

## Commands

```bash
# Refresh refs
git fetch --all --prune

# Create / switch ops branch from baseline
git switch -c ops/wsl2 f4825df   # first time only
git switch ops/wsl2               # subsequent use

# Keep local main aligned to upstream (when upstream/main exists locally)
git switch main
git merge --ff-only upstream/main
git push origin main

# Start upstream-intended feature work
git switch -c feature/<name> upstream/main

# Hygiene check before PR
make -f .wsl2/Makefile pr-hygiene
```

## If `upstream/main` is not available locally

- Run `git fetch upstream`.
- If network is temporarily unavailable, you can base feature branches on `origin/main`, then rebase to `upstream/main` before opening PR.
