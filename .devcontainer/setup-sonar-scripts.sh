#!/usr/bin/env bash
set -euo pipefail

# ══════════════════════════════════════════════════════════════════════════════
# SonarQube Scripts Initializer
# ══════════════════════════════════════════════════════════════════════════════
# Deploys SonarQube analysis scripts into the current project.
# Can be run from any .NET project workspace.
#
# Usage:
#   setup-sonar-scripts [--target-dir ./scripts] [--force]
#
# What it does:
#   1. Copies the generic sonar-analyze.sh to the project's scripts/ directory
#   2. Optionally creates a project-local docker-compose.sonarqube.yml
#   3. Creates a .env.sonar template for storing the token
#   4. Adds sonarqube/ and .env.sonar to .gitignore if present
# ══════════════════════════════════════════════════════════════════════════════

SCRIPT_SOURCE="/usr/local/share/sonarqube"
TARGET_DIR="./scripts"
FORCE=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --target-dir) TARGET_DIR="$2"; shift 2 ;;
        --force)      FORCE=true; shift ;;
        --help|-h)
            echo "Usage: $(basename "$0") [--target-dir ./scripts] [--force]"
            echo ""
            echo "Deploys SonarQube analysis scripts into the current project."
            echo ""
            echo "Options:"
            echo "  --target-dir    Directory for scripts (default: ./scripts)"
            echo "  --force         Overwrite existing files"
            exit 0 ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

log_info()    { printf "\033[1;34m[SETUP]\033[0m  %s\n" "$*"; }
log_success() { printf "\033[1;32m[SETUP]\033[0m  %s\n" "$*"; }
log_warn()    { printf "\033[1;33m[SETUP]\033[0m  %s\n" "$*"; }

# ── Copy analysis script ────────────────────────────────────────────────────
log_info "Setting up SonarQube scripts in: $TARGET_DIR"
mkdir -p "$TARGET_DIR"

ANALYZE_SRC="$SCRIPT_SOURCE/sonar-analyze.sh"
ANALYZE_DST="$TARGET_DIR/sonar-analyze.sh"

if [[ -f "$ANALYZE_DST" && "$FORCE" != true ]]; then
    log_warn "$ANALYZE_DST already exists. Use --force to overwrite."
else
    cp "$ANALYZE_SRC" "$ANALYZE_DST"
    chmod +x "$ANALYZE_DST"
    log_success "Copied sonar-analyze.sh -> $ANALYZE_DST"
fi

# ── Copy docker-compose.sonarqube.yml to project root ───────────────────────
COMPOSE_SRC="$SCRIPT_SOURCE/docker-compose.sonarqube.yml"
COMPOSE_DST="./docker-compose.sonarqube.yml"

if [[ -f "$COMPOSE_DST" && "$FORCE" != true ]]; then
    log_warn "$COMPOSE_DST already exists. Use --force to overwrite."
else
    cp "$COMPOSE_SRC" "$COMPOSE_DST"
    log_success "Copied docker-compose.sonarqube.yml -> $COMPOSE_DST"
fi

# ── Create .env.sonar template ──────────────────────────────────────────────
ENV_FILE=".env.sonar"
if [[ -f "$ENV_FILE" && "$FORCE" != true ]]; then
    log_warn "$ENV_FILE already exists. Use --force to overwrite."
else
    cat > "$ENV_FILE" <<'EOF'
# SonarQube Configuration
# Source this file before running analysis:
#   source .env.sonar && bash scripts/sonar-analyze.sh

# Authentication token (generate from SonarQube UI > My Account > Security)
# If using the auto-generated token from init-sonarqube.sh:
#   source ~/.sonar-token
export SONAR_TOKEN=""

# SonarQube server URL (default: http://localhost:9000)
# export SONAR_HOST_URL="http://localhost:9000"

# Project key (default: auto-detected from .sln filename)
# export SONAR_PROJECT_KEY="MyProject"
EOF
    log_success "Created $ENV_FILE template"
fi

# ── Update .gitignore ───────────────────────────────────────────────────────
GITIGNORE=".gitignore"
if [[ -f "$GITIGNORE" ]]; then
    ENTRIES=("sonarqube/" ".env.sonar" "coverage/" ".sonarqube/")
    ADDED=0
    for entry in "${ENTRIES[@]}"; do
        if ! grep -qxF "$entry" "$GITIGNORE" 2>/dev/null; then
            echo "$entry" >> "$GITIGNORE"
            ADDED=1
        fi
    done
    if [[ $ADDED -eq 1 ]]; then
        log_success "Updated .gitignore with SonarQube entries"
    else
        log_info ".gitignore already contains SonarQube entries"
    fi
else
    log_warn "No .gitignore found — consider creating one"
fi

# ── Create sonarqube report directory ────────────────────────────────────────
mkdir -p sonarqube
log_success "Created sonarqube/ report directory"

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
log_info "============================================================"
log_info "SonarQube scripts deployed successfully!"
log_info "============================================================"
echo ""
log_info "Files created:"
log_info "  $ANALYZE_DST           — Analysis & report script"
log_info "  $COMPOSE_DST  — Docker Compose for SonarQube"
log_info "  $ENV_FILE                     — Token config template"
log_info "  sonarqube/                    — Report output directory"
echo ""
log_info "Quick start:"
log_info "  1. Start SonarQube (if not already running):"
log_info "       docker compose -f docker-compose.sonarqube.yml up -d"
log_info ""
log_info "  2. Set your token:"
log_info "       source ~/.sonar-token    # (auto-generated)"
log_info "       # or edit .env.sonar and: source .env.sonar"
log_info ""
log_info "  3. Run analysis:"
log_info "       bash $ANALYZE_DST"
log_info ""
log_info "  4. View report:"
log_info "       cat sonarqube/sonarqube-report-*.md"
log_info "============================================================"
