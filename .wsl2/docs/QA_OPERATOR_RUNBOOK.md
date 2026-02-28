# QA Operator Runbook

## 1) Configure files

```bash
cp .wsl2/env/.env.edge.example .wsl2/env/.env.edge
cp .wsl2/env/.env.qa.example .wsl2/env/.env.qa
```

Set real values:
- `DOMAIN` (public QA FQDN)
- `JWT_SECRET`
- Mongo and MinIO credentials
- `TRAEFIK_API_INSECURE=true` in `.wsl2/env/.env.edge` (required by current `qa-smoke` dashboard check)
- `PROD_MONGO_ARCHIVE` (path to latest production Mongo archive file)
- `PROD_MINIO_ARCHIVE` (path to latest production MinIO volume archive file)

## 2) Enter QA mode on this host

Stop dev stack first to free shared ports:

```bash
make -f .wsl2/Makefile dev-down
```

Start edge and QA:

```bash
make -f .wsl2/Makefile edge-up
make -f .wsl2/Makefile qa-up
```

## 3) Validate QA

```bash
make -f .wsl2/Makefile qa-ps
make -f .wsl2/Makefile qa-smoke
```

Expected smoke output includes:
- `PASS qa direct`
- `PASS qa traefik http`
- `PASS qa traefik https`
- `PASS edge traefik dashboard/ping`
- `PASS qa minio bucket/public URL`

## 4) Routine operations

```bash
make -f .wsl2/Makefile qa-logs
make -f .wsl2/Makefile qa-down      # preserve QA data
make -f .wsl2/Makefile qa-reset     # delete QA data
```

## 5) Backup/Restore notes

- Mongo backup:
  - `docker compose --env-file .wsl2/env/.env.qa -p kowloon-qa -f .wsl2/compose/docker-compose.qa.yml exec -T mongodb mongodump ...`
- MinIO backup:
  - use `mc mirror` from `qa-minio` bucket to backup target.

## 6) Production mirror refresh into QA

Run on demand:

```bash
make -f .wsl2/Makefile sync-prod-to-qa
```

This will:
- restore QA DB from production Mongo archive (`--drop`)
- restore QA MinIO data from production MinIO archive
- run QA post-sync sanitization
- note: automated scheduling is out of scope for now (manual runbook step)

## 7) Federation prerequisites checklist

- QA FQDN resolves publicly.
- QA has valid HTTPS cert from edge Traefik.
- Production can reach QA over HTTPS.

## 8) Troubleshooting

1. `providerName=docker` in edge logs:
- Ensure Docker daemon access is available from your shell and restart Docker.

2. Host routing fails:
- Verify `DOMAIN` in `.wsl2/env/.env.qa` matches DNS and Traefik router host rule.
- Check `make -f .wsl2/Makefile edge-logs` and `make -f .wsl2/Makefile qa-logs`.

3. MinIO permission errors:
- Confirm `.wsl2/env/.env.qa` S3 credentials match running QA MinIO.
- If needed: `make -f .wsl2/Makefile qa-reset && make -f .wsl2/Makefile qa-up`.
