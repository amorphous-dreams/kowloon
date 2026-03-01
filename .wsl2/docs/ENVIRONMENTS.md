# Environment Lifecycle (`dev` -> `qa` -> `production`)

This repository is now intentionally split between:
- local host environments: `dev` and `qa`
- external/cloud environment: `production` (not run on this host)

## `dev`

- Purpose: fast local coding and debugging.
- Persistence: not expected between sessions.
- Default behavior: `make -f .wsl2/Makefile dev-up` runs a data reset, then starts services.
- Preserve option: `make -f .wsl2/Makefile dev-up-preserve`.

## `qa`

- Purpose: persistent local-infra/live-example environment for admin/operator validation.
- Reachability: local intranet hostname (recommended: `kowloon.local`) via mDNS/local DNS/hosts.
- Setup guide: [MDNS_AVAHI_SETUP.md](MDNS_AVAHI_SETUP.md).
- TLS mode: intranet/local TLS is expected for `.local`; public ACME certificates are not expected for mDNS-only names.
- Data policy: import Production backup artifacts into QA, then sanitize.
- Command surface:
  - `make -f .wsl2/Makefile qa-up`
  - `make -f .wsl2/Makefile qa-smoke`
  - `make -f .wsl2/Makefile qa-down`
  - `make -f .wsl2/Makefile qa-reset`

## `production`

- Purpose: public, persistent deployment in a separate cloud host.
- Local host policy: do not run production stack on the local dev/qa host.
- Seed policy: export QA seed artifacts (`make -f .wsl2/Makefile seed-qa-to-prod`) and import externally.
- Ongoing sync policy: obtain production backup artifacts externally, then import to QA (`make -f .wsl2/Makefile sync-prod-to-qa`).

## Stack Topology

- Same host, isolated local stacks:
  - Edge proxy project: `kowloon-edge`
  - QA project: `kowloon-qa`
- Shared external docker network for routing: `kowloon-edge`
- Isolated data stores per environment:
  - QA: `qa_mongodb_data`, `qa_minio_data`

## Host Port Ownership

- `dev` mode binds host ports through local Traefik and app:
  - `80`, `443`, `8080`, `3000` (+ MinIO/Mongo ports from `.wsl2/env/.env.dev`)
- `qa` mode binds host ports through edge Traefik:
  - `80`, `443`, `8080`

Because of these overlaps, run one mode at a time on the same host.

Switching workflow:
- dev -> qa:
  - `make -f .wsl2/Makefile dev-down`
  - `make -f .wsl2/Makefile edge-up && make -f .wsl2/Makefile qa-up`
- qa -> dev:
  - `make -f .wsl2/Makefile qa-down && make -f .wsl2/Makefile edge-down`
  - `make -f .wsl2/Makefile dev-up`

## Compose and Env Mapping

- Edge:
  - Compose: `.wsl2/compose/docker-compose.edge.yml`
  - Env: `.wsl2/env/.env.edge`
- QA:
  - Compose: `.wsl2/compose/docker-compose.qa.yml`
  - Env: `.wsl2/env/.env.qa`
- Dev:
  - Compose: `docker-compose.yml` + `.wsl2/compose/docker-compose.dev.yml`
  - Env: `.wsl2/env/.env.dev`

## Production Artifacts on Local Host

- QA export for initial production seed:
  - `make -f .wsl2/Makefile seed-qa-to-prod`
  - outputs Mongo archive + MinIO volume archive under `exports/`
- Production backup import into QA:
  - `make -f .wsl2/Makefile sync-prod-to-qa`
  - reads `PROD_MONGO_ARCHIVE` + `PROD_MINIO_ARCHIVE` from `.wsl2/env/.env.qa` (or script args)

## Roadmap Note

- Automated Production -> QA sync scheduling is out of scope for now.
- Keep sync as a manual operator workflow until a dedicated data-sync roadmap is implemented.
