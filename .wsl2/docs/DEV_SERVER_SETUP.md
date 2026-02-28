# WSL2 Dev Server Setup (Kowloon + Docker)

This workflow runs the local development stack using `docker-compose.yml + .wsl2/compose/docker-compose.dev.yml`.
Run commands from the repository root.

## 0) Select runtime mode on this host

On a single WSL2 host, run either:
- `dev` stack (`make -f .wsl2/Makefile dev-up`) for coding, or
- `edge + qa` stacks (`make -f .wsl2/Makefile edge-up && make -f .wsl2/Makefile qa-up`) for operator/federation proofing.

Do not run both modes at once. They share host ports (`80`, `443`, `8080`, `3000`).

## 1) Create local env file

```bash
cp .wsl2/env/.env.dev.example .wsl2/env/.env.dev
```

`.wsl2/env/.env.dev` is local-only and untracked. Keep secrets out of git.

## 2) Validate compose config

```bash
docker compose --env-file .wsl2/env/.env.dev -f docker-compose.yml -f .wsl2/compose/docker-compose.dev.yml config >/dev/null
```

Expected: command exits `0` with no config errors.

## 3) Bootstrap infra (idempotent)

```bash
./.wsl2/scripts/dev-bootstrap.sh
```

What it does:
- Starts `mongodb`, `minio`, `traefik`
- Creates/verifies MinIO bucket (`S3_BUCKET`) and dev anonymous download policy
- Authenticates to MongoDB and creates/verifies target DB (`MONGO_DATABASE`)

## 4) Start app

```bash
docker compose --env-file .wsl2/env/.env.dev -f docker-compose.yml -f .wsl2/compose/docker-compose.dev.yml up -d --build kowloon-dev
```

## 5) Run smoke validation gate

```bash
./.wsl2/scripts/dev-smoke.sh
```

Expected checks:
- Direct app health: `http://localhost:3000/__health`
- Traefik HTTP host route: `Host: kowloon.localhost` to `/__health`
- Traefik HTTPS host route: same with `curl -k`
- Traefik ping + dashboard API on `:8080`
- MinIO bucket exists and `S3_PUBLIC_URL` is reachable

Expected output includes:
- `PASS direct`
- `PASS traefik http`
- `PASS traefik https`
- `PASS traefik dashboard/ping`
- `PASS minio bucket/public URL`
- `Smoke test passed.`

## 6) Daily operations

```bash
make -f .wsl2/Makefile dev-up      # reset data + bootstrap + app up
make -f .wsl2/Makefile dev-up-preserve  # bootstrap + app up without reset
make -f .wsl2/Makefile dev-ps      # show status
make -f .wsl2/Makefile dev-logs    # tail logs
make -f .wsl2/Makefile dev-smoke   # run validation gate
make -f .wsl2/Makefile dev-down    # stop (preserve data)
make -f .wsl2/Makefile dev-reset   # stop + delete volumes/data
make -f .wsl2/Makefile edge-down && make -f .wsl2/Makefile qa-down  # switch from QA mode back to dev mode
```

## Endpoints

- App direct: `http://localhost:3000`
- App via Traefik HTTP: `http://kowloon.localhost`
- Traefik dashboard: `http://localhost:8080`
- MinIO console: `http://localhost:9001`
- MongoDB host port: `mongodb://localhost:${MONGO_HOST_PORT:-27017}`

## Troubleshooting (WSL2 + Docker Desktop)

1. Docker socket/provider errors in Traefik
- Symptom: Traefik logs show `providerName=docker` errors.
- Check Docker Desktop WSL integration is enabled for your distro.
- Restart Docker Desktop, then run `make -f .wsl2/Makefile dev-up`.

2. Port conflicts (`80`, `443`, `3000`, `8080`, `9000`, `9001`, `27017`)
- Symptom: container fails to bind port.
- Change host ports in `.wsl2/env/.env.dev` where supported (`MONGO_HOST_PORT`, `MINIO_*_PORT`) or free the port.

3. Hostname route fails for `kowloon.localhost`
- Use `curl -H 'Host: kowloon.localhost' http://localhost/__health` to verify host rule even without browser DNS caching effects.

4. MinIO auth errors during bootstrap
- Ensure `.wsl2/env/.env.dev` `S3_ACCESS_KEY` / `S3_SECRET_KEY` match running MinIO.
- If credentials changed after first boot, run `make -f .wsl2/Makefile dev-reset` and bootstrap again.

## Ready-for-feature-work checklist

- [ ] `docker compose ... ps` shows all services healthy.
- [ ] `make -f .wsl2/Makefile dev-smoke` passes.
- [ ] App health returns `{"ok":true,"readyState":1}`.
- [ ] MinIO bucket exists and `S3_PUBLIC_URL` resolves.
- [ ] This runbook works from a clean clone on WSL2.

## Environment progression

For lifecycle docs (`dev` + local `qa`, external `production`) and operator runbooks:
- [ENVIRONMENTS.md](ENVIRONMENTS.md)
- [QA_OPERATOR_RUNBOOK.md](QA_OPERATOR_RUNBOOK.md)
- [PROD_OPERATOR_RUNBOOK.md](PROD_OPERATOR_RUNBOOK.md)
