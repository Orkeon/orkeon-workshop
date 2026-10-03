#!/bin/bash
set -euo pipefail

# ══════════════════════════════════════════════════════════════════════════════
# SonarQube Initialization Script for Claude Code devcontainer
# ══════════════════════════════════════════════════════════════════════════════
# Starts SonarQube via Docker Compose against whichever Docker the container is
# configured for. In DinD mode SonarQube runs inside the container and is reachable
# at localhost:9000. In host-socket mode it runs as a SIBLING on the host daemon; the
# entrypoint forwards 127.0.0.1:9000 -> host.docker.internal:9000 so SONAR_HOST_URL
# stays http://localhost:9000 in both modes. Waits until the service is healthy, then
# optionally creates a default project and token.
#
# This script is called automatically at container startup via postStartCommand.
# ══════════════════════════════════════════════════════════════════════════════

COMPOSE_FILE="/usr/local/share/sonarqube/docker-compose.sonarqube.yml"
SONAR_HOST="${SONAR_HOST_URL:-http://localhost:9000}"
SONAR_DEFAULT_USER="admin"
SONAR_DEFAULT_PASS="admin"
SONARQUBE_WAIT_TIMEOUT=300  # 5 minutes

log_info()    { printf "\033[1;34m[SONAR-INIT]\033[0m  %s\n" "$*"; }
log_success() { printf "\033[1;32m[SONAR-INIT]\033[0m  %s\n" "$*"; }
log_warn()    { printf "\033[1;33m[SONAR-INIT]\033[0m  %s\n" "$*"; }
log_error()   { printf "\033[1;31m[SONAR-INIT]\033[0m  %s\n" "$*" >&2; }

# ── Check if Docker socket is available ──────────────────────────────────────
check_docker() {
    if [ ! -S /var/run/docker.sock ]; then
        log_warn "Docker socket not found at /var/run/docker.sock"
        log_warn "SonarQube auto-start skipped. Mount the Docker socket to enable."
        log_warn "You can start SonarQube manually later with:"
        log_warn "  docker compose -f $COMPOSE_FILE up -d"
        exit 0
    fi

    if ! docker info &>/dev/null; then
        log_warn "Docker daemon not reachable. SonarQube auto-start skipped."
        log_warn "Ensure the Docker socket is correctly mounted."
        exit 0
    fi

    log_info "Docker is available"
}

# ── Start SonarQube if not already running ───────────────────────────────────
start_sonarqube() {
    local status
    status=$(curl -sf "$SONAR_HOST/api/system/status" 2>/dev/null \
        | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4 || true)

    if [ "$status" = "UP" ]; then
        log_success "SonarQube is already running at $SONAR_HOST"
        return 0
    fi

    log_info "Starting SonarQube via Docker Compose..."
    docker compose -f "$COMPOSE_FILE" up -d

    log_info "Waiting for SonarQube to be ready at $SONAR_HOST ..."
    local elapsed=0
    local interval=10

    while [ $elapsed -lt $SONARQUBE_WAIT_TIMEOUT ]; do
        status=$(curl -sf "$SONAR_HOST/api/system/status" 2>/dev/null \
            | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4 || true)

        if [ "$status" = "UP" ]; then
            log_success "SonarQube is ready!"
            return 0
        fi

        printf "."
        sleep "$interval"
        elapsed=$((elapsed + interval))
    done

    printf "\n"
    log_error "SonarQube did not become ready within ${SONARQUBE_WAIT_TIMEOUT}s"
    log_warn "You can check logs with: docker compose -f $COMPOSE_FILE logs"
    # Don't exit 1 — let the container start anyway
    return 0
}

# ── Resolve the project key ──────────────────────────────────────────────────
# SONAR_PROJECT_KEY if set, otherwise the name of the workspace .sln / .slnx (same rule
# as sonar-analyze.sh). Empty when neither exists.
resolve_project_key() {
    if [ -n "${SONAR_PROJECT_KEY:-}" ]; then
        printf '%s' "$SONAR_PROJECT_KEY"
        return 0
    fi

    local solution
    solution=$(find /workspace -maxdepth 3 \( -name "*.sln" -o -name "*.slnx" \) -type f 2>/dev/null | head -1 || true)
    if [ -n "$solution" ]; then
        solution=$(basename "$solution")
        solution="${solution%.slnx}"
        printf '%s\n' "${solution%.sln}"
    fi
}

# ── Create default project if it doesn't exist ──────────────────────────────
setup_default_project() {
    local project_key
    project_key=$(resolve_project_key)

    if [ -z "$project_key" ]; then
        log_info "No SONAR_PROJECT_KEY and no .sln/.slnx in /workspace — default project not created"
        log_info "(SonarQube creates the project on the first analysis)"
        return 0
    fi

    # Check if project exists
    local project_exists
    project_exists=$(curl -sf -u "${SONAR_DEFAULT_USER}:${SONAR_DEFAULT_PASS}" \
        "$SONAR_HOST/api/projects/search?projects=$project_key" 2>/dev/null \
        | grep -o '"total":[0-9]*' | cut -d: -f2 || echo "0")

    if [ "$project_exists" = "0" ]; then
        log_info "Creating SonarQube project '$project_key'..."
        curl -sf -u "${SONAR_DEFAULT_USER}:${SONAR_DEFAULT_PASS}" \
            -X POST "$SONAR_HOST/api/projects/create" \
            -d "name=$project_key&project=$project_key" >/dev/null 2>&1 || {
            log_warn "Could not create project. You may need to create it manually."
        }
    else
        log_info "SonarQube project '$project_key' already exists"
    fi
}

# ── Activate the Creedengo (eco-design) quality profile for C# ───────────────
# The Creedengo SonarQube plugin (https://github.com/green-code-initiative/
# creedengo-csharp-sonarqube) ships a built-in quality profile that contains
# the eco-design rules (GCIxx). We set it as the default profile for C# so
# every scan automatically reports those issues.
#
# Notes:
#   - Detection of issues at scan-time additionally requires the "Creedengo"
#     NuGet package in the analysed .csproj — see SONARQUBE.md.
#   - The profile name shipped by Creedengo is "Creedengo way" but we match
#     on "creedengo" (case-insensitive) to be resilient to renames.
setup_creedengo_profile() {
    local language="cs"

    # Fetch the list of C# profiles, then extract the one whose name contains
    # "creedengo" (case-insensitive) via jq.
    local profiles_json
    profiles_json=$(curl -sf -u "${SONAR_DEFAULT_USER}:${SONAR_DEFAULT_PASS}" \
        "$SONAR_HOST/api/qualityprofiles/search?language=$language" 2>/dev/null || true)

    if [ -z "$profiles_json" ]; then
        log_warn "Could not list quality profiles. Skipping Creedengo activation."
        log_warn "You can set it manually in $SONAR_HOST -> Quality Profiles (C#)."
        return 0
    fi

    # Pick the first profile whose name contains "creedengo" (case-insensitive).
    # jq is preinstalled in the devcontainer image.
    local profile_name
    profile_name=$(printf '%s' "$profiles_json" | jq -r \
        '.profiles[]? | select((.name // "") | ascii_downcase | contains("creedengo")) | .name' \
        2>/dev/null | head -n1 || true)

    if [ -z "$profile_name" ]; then
        log_warn "No Creedengo quality profile found for C#."
        log_warn "Is the creedengo-csharp-sonarqube plugin actually installed?"
        log_warn "Check $SONAR_HOST/admin/marketplace -> Installed."
        return 0
    fi

    log_info "Setting '$profile_name' as the default C# quality profile..."
    if curl -sf -u "${SONAR_DEFAULT_USER}:${SONAR_DEFAULT_PASS}" \
        -X POST "$SONAR_HOST/api/qualityprofiles/set_default" \
        --data-urlencode "language=$language" \
        --data-urlencode "qualityProfile=$profile_name" >/dev/null 2>&1; then
        log_success "Default C# quality profile is now '$profile_name'"
    else
        log_warn "Could not set '$profile_name' as default. Configure manually via UI."
    fi
}

# ── Generate a user token if SONAR_TOKEN is not already set ──────────────────
setup_token() {
    if [ -n "${SONAR_TOKEN:-}" ]; then
        log_info "SONAR_TOKEN already set — skipping token generation"
        return 0
    fi

    local token_name="claude-code-token"

    log_info "Generating SonarQube token '$token_name'..."
    local token_response
    token_response=$(curl -sf -u "${SONAR_DEFAULT_USER}:${SONAR_DEFAULT_PASS}" \
        -X POST "$SONAR_HOST/api/user_tokens/generate" \
        -d "name=$token_name" 2>/dev/null || echo "")

    if [ -n "$token_response" ]; then
        local token_value
        token_value=$(echo "$token_response" | grep -o '"token":"[^"]*"' | cut -d'"' -f4 || true)

        if [ -n "$token_value" ]; then
            # Write the token to node's home, mode 600. It is a token of this local instance
            # (admin/admin until changed, reachable from this machine only) - the one credential
            # the image writes to disk; SONARQUBE.md says so. postStartCommand runs as node.
            local token_file="/home/node/.sonar-token"
            echo "export SONAR_TOKEN=\"$token_value\"" > "$token_file"
            chown node:node "$token_file"
            chmod 600 "$token_file"

            log_success "SonarQube token generated and saved to $token_file"
            log_info "Source it with: source $token_file"
            log_info "Or add to your shell profile: echo 'source $token_file' >> ~/.zshrc"
        else
            log_warn "Token generation returned but no token value found (token may already exist)"
            log_warn "Use the SonarQube UI at $SONAR_HOST to manage tokens (admin/admin)"
        fi
    else
        log_warn "Could not generate token. Use the SonarQube UI at $SONAR_HOST (admin/admin)"
    fi
}

# ── Display summary ──────────────────────────────────────────────────────────
print_summary() {
    local project_key
    project_key=$(resolve_project_key)

    log_info "═══════════════════════════════════════════════════════"
    log_info "SonarQube Setup Summary"
    log_info "═══════════════════════════════════════════════════════"
    log_info "  URL:          $SONAR_HOST"
    log_info "  Credentials:  admin / admin (change on first login)"
    log_info "  Project:      ${project_key:-created on first analysis}"
    log_info "  Eco-design:   Creedengo C# plugin (GCIxx rules) — see SONARQUBE.md"
    log_info ""
    log_info "  Run analysis:"
    log_info "    source ~/.sonar-token  # if not already exported"
    log_info "    bash scripts/sonar-analyze.sh"
    log_info ""
    log_info "  Docker Compose:"
    log_info "    docker compose -f $COMPOSE_FILE logs    # View logs"
    log_info "    docker compose -f $COMPOSE_FILE down    # Stop"
    log_info "    docker compose -f $COMPOSE_FILE up -d   # Start"
    log_info "═══════════════════════════════════════════════════════"
}

# ── Main ─────────────────────────────────────────────────────────────────────
main() {
    log_info "Initializing SonarQube environment..."

    check_docker
    start_sonarqube
    setup_default_project
    setup_creedengo_profile
    setup_token
    print_summary

    log_success "SonarQube initialization complete"
}

main "$@"
