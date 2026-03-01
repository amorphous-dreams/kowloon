.PHONY: help wsl2-init compare-main compare-upstream \
	dev-up dev-up-preserve dev-down dev-logs dev-ps dev-smoke dev-reset \
	edge-up edge-down edge-logs edge-ps \
	qa-up qa-down qa-logs qa-ps qa-smoke qa-reset qa-bootstrap \
	seed-qa-to-prod sync-prod-to-qa \
	branch-status feature-branch pr-hygiene

WSL2_ROOT := .wsl2
WSL2_ENV_DIR := $(WSL2_ROOT)/env
WSL2_COMPOSE_DIR := $(WSL2_ROOT)/compose
WSL2_SCRIPT_DIR := $(WSL2_ROOT)/scripts

DEV_ENV := $(WSL2_ENV_DIR)/.env.dev
EDGE_ENV := $(WSL2_ENV_DIR)/.env.edge
QA_ENV := $(WSL2_ENV_DIR)/.env.qa

DEV_COMPOSE = docker compose --env-file $(DEV_ENV) -f docker-compose.yml -f $(WSL2_COMPOSE_DIR)/docker-compose.dev.yml
EDGE_COMPOSE = docker compose --env-file $(EDGE_ENV) -p kowloon-edge -f $(WSL2_COMPOSE_DIR)/docker-compose.edge.yml
QA_COMPOSE = docker compose --env-file $(QA_ENV) -p kowloon-qa -f $(WSL2_COMPOSE_DIR)/docker-compose.qa.yml

help: ## Show this help message
	@echo "Kowloon WSL2 Dev/QA Commands"
	@echo "================================"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-22s\033[0m %s\n", $$1, $$2}'

wsl2-init: ## Create local WSL2 env files from templates
	@test -f "$(DEV_ENV)" || cp "$(WSL2_ENV_DIR)/.env.dev.example" "$(DEV_ENV)"
	@test -f "$(EDGE_ENV)" || cp "$(WSL2_ENV_DIR)/.env.edge.example" "$(EDGE_ENV)"
	@test -f "$(QA_ENV)" || cp "$(WSL2_ENV_DIR)/.env.qa.example" "$(QA_ENV)"
	@echo "WSL2 env files ready in $(WSL2_ENV_DIR)/"

compare-main: ## Show full repo diff against upstream main
	@git diff --name-status main -- .

compare-upstream: ## Show diff against upstream/main (fallback: origin/main)
	@BASE=upstream/main; \
	if ! git rev-parse --verify --quiet $$BASE >/dev/null; then BASE=origin/main; fi; \
	echo "Using base: $$BASE"; \
	git diff --name-status $$BASE -- .

branch-status: ## Show commit alignment for main/feature branches
	@echo "Current branch: $$(git rev-parse --abbrev-ref HEAD)"; \
	echo "HEAD: $$(git rev-parse --short HEAD)"; \
	echo "main: $$(git rev-parse --short main)"; \
	if git rev-parse --verify --quiet origin/main >/dev/null; then echo "origin/main: $$(git rev-parse --short origin/main)"; fi; \
	if git rev-parse --verify --quiet upstream/main >/dev/null; then echo "upstream/main: $$(git rev-parse --short upstream/main)"; else echo "upstream/main: (not fetched)"; fi

feature-branch: ## Create feature/<name> from upstream/main (fallback: origin/main). Use NAME=<name>
	@test -n "$(NAME)" || (echo "Usage: make -f .wsl2/Makefile feature-branch NAME=<name>" && exit 1)
	@BASE=upstream/main; \
	if ! git rev-parse --verify --quiet $$BASE >/dev/null; then BASE=origin/main; fi; \
	echo "Creating feature/$(NAME) from $$BASE"; \
	git switch -c feature/$(NAME) $$BASE

pr-hygiene: ## Run upstream PR hygiene checks for current branch
	@.wsl2/scripts/pr-hygiene.sh

# Dev commands
dev-up: ## Start dev server (reset + bootstrap + app)
	@$(MAKE) -f $(WSL2_ROOT)/Makefile dev-reset
	@$(MAKE) -f $(WSL2_ROOT)/Makefile dev-up-preserve

dev-up-preserve: ## Start dev server preserving data
	@$(WSL2_SCRIPT_DIR)/dev-bootstrap.sh
	@$(DEV_COMPOSE) up -d --build kowloon-dev
	@echo "Dev server started"

dev-down: ## Stop dev stack (preserve data)
	@$(DEV_COMPOSE) down
	@echo "Dev stack stopped (data preserved)"

dev-reset: ## Stop dev stack and delete volumes/data
	@$(DEV_COMPOSE) down -v
	@echo "Dev stack reset (data deleted)"

dev-logs: ## Tail logs for dev stack
	@$(DEV_COMPOSE) logs -f

dev-ps: ## Show dev stack status
	@$(DEV_COMPOSE) ps

dev-smoke: ## Run dev smoke checks (routing/storage/health)
	@$(WSL2_SCRIPT_DIR)/dev-smoke.sh

# Shared edge commands
edge-up: ## Start shared edge Traefik stack
	@docker network inspect kowloon-edge >/dev/null 2>&1 || docker network create kowloon-edge
	@$(EDGE_COMPOSE) up -d
	@echo "Edge proxy started"

edge-down: ## Stop shared edge Traefik stack
	@$(EDGE_COMPOSE) down
	@echo "Edge proxy stopped"

edge-logs: ## Tail edge proxy logs
	@$(EDGE_COMPOSE) logs -f

edge-ps: ## Show edge stack status
	@$(EDGE_COMPOSE) ps

# QA commands
qa-bootstrap: ## Bootstrap QA services and storage/db checks
	@$(WSL2_SCRIPT_DIR)/qa-bootstrap.sh

qa-up: ## Start QA stack
	@$(WSL2_SCRIPT_DIR)/qa-bootstrap.sh
	@$(QA_COMPOSE) up -d --build kowloon
	@echo "QA stack started"

qa-down: ## Stop QA stack (preserve data)
	@$(QA_COMPOSE) down
	@echo "QA stack stopped (data preserved)"

qa-reset: ## Reset QA stack (delete all QA data)
	@$(QA_COMPOSE) down -v
	@echo "QA stack reset (data deleted)"

qa-logs: ## Tail QA logs
	@$(QA_COMPOSE) logs -f

qa-ps: ## Show QA status
	@$(QA_COMPOSE) ps

qa-smoke: ## Run QA smoke checks
	@$(WSL2_SCRIPT_DIR)/qa-smoke.sh

# Data movement workflows
seed-qa-to-prod: ## Export QA seed artifacts for external production deployment
	@$(WSL2_SCRIPT_DIR)/seed-qa-to-prod.sh

sync-prod-to-qa: ## Import production backup artifacts into QA + sanitization
	@$(WSL2_SCRIPT_DIR)/sync-prod-to-qa.sh
