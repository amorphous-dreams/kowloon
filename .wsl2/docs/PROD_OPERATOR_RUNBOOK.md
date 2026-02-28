# Production Operator Runbook

Production is not run on the local dev/qa host.
Use this runbook for external/cloud deployment and QA sync-back coordination.

There are intentionally no local `make prod-*` targets in this branch.

## 1) Initial seed from local QA

Generate seed artifacts from local QA host:

```bash
make -f .wsl2/Makefile seed-qa-to-prod
```

Output directory: `exports/qa-seed-<timestamp>/`
- Mongo archive (`*.archive.gz`)
- MinIO volume archive (`*.tar.gz`)
- `manifest.txt`

Import these artifacts in your cloud production environment using the platform-specific process.

## 2) External production operations

- Deploy production on its own host/service.
- Keep production backups scheduled (Mongo + MinIO).
- Ensure production is reachable over HTTPS if federation with QA is required.

## 3) Production -> QA sync-back

On the local QA host, place latest production backup artifacts somewhere accessible.
Set paths in `.wsl2/env/.env.qa`:
- `PROD_MONGO_ARCHIVE=/path/to/prod-mongo.archive.gz`
- `PROD_MINIO_ARCHIVE=/path/to/prod-minio-volume.tar.gz`

```bash
make -f .wsl2/Makefile sync-prod-to-qa
```

## 4) Sync policy

- Direction: Production -> QA (nightly).
- QA is overwritten with a mirrored snapshot.
- QA sanitization runs after each sync to remove/replace sensitive material and ensure QA operator access.

## 5) Roadmap Note

Automated Production -> QA scheduling (cron/CI job) is intentionally out of scope for now.
Plan this as a dedicated roadmap item after base QA operations are stable.
