#!/usr/bin/env bash
set -euo pipefail

# ══════════════════════════════════════════════════════════════════════════════
# SonarQube Analysis Script — Generic .NET Projects
# ══════════════════════════════════════════════════════════════════════════════
# Performs a full SonarQube analysis with code coverage and generates a
# Markdown report. Project-agnostic: auto-detects solution, projects, and
# test directories.
#
# Usage:
#   export SONAR_TOKEN="<your-token>"
#   bash sonar-analyze.sh [--solution path/to.sln|.slnx] [--project-key MyProject]
#
# Environment variables:
#   SONAR_TOKEN        (required) Authentication token for SonarQube
#   SONAR_HOST_URL     (optional) SonarQube server URL  (default: http://localhost:9000)
#   SONAR_PROJECT_KEY  (optional) Project key            (default: auto-detected from the solution name)
#   SONAR_SOLUTION     (optional) Path to .sln/.slnx     (default: auto-detected)
# ══════════════════════════════════════════════════════════════════════════════

# ── Parse CLI arguments ─────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
    case "$1" in
        --solution)    SONAR_SOLUTION="$2"; shift 2 ;;
        --project-key) SONAR_PROJECT_KEY="$2"; shift 2 ;;
        --host)        SONAR_HOST_URL="$2"; shift 2 ;;
        --help|-h)
            echo "Usage: $(basename "$0") [--solution path/to.sln|.slnx] [--project-key Key] [--host url]"
            echo ""
            echo "Options:"
            echo "  --solution      Path to the .sln or .slnx file (default: auto-detect)"
            echo "  --project-key   SonarQube project key (default: solution filename)"
            echo "  --host          SonarQube host URL (default: http://localhost:9000)"
            echo ""
            echo "Environment:"
            echo "  SONAR_TOKEN     (required) Authentication token"
            echo "  SONAR_HOST_URL  SonarQube server URL"
            echo "  SONAR_PROJECT_KEY  Project key"
            exit 0 ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

# ── Configuration ─────────────────────────────────────────────────────────────
SONAR_HOST="${SONAR_HOST_URL:-http://localhost:9000}"
SONAR_TOKEN="${SONAR_TOKEN:?SONAR_TOKEN is required. Export it before running this script.}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(pwd)"

# Auto-detect solution file if not provided
if [[ -z "${SONAR_SOLUTION:-}" ]]; then
    SONAR_SOLUTION=$(find "$PROJECT_ROOT" -maxdepth 3 \( -name "*.sln" -o -name "*.slnx" \) -type f | head -1 || true)
    if [[ -z "$SONAR_SOLUTION" ]]; then
        echo "[ERROR] No .sln or .slnx file found. Use --solution to specify one."
        exit 1
    fi
    # Make relative to PROJECT_ROOT
    SONAR_SOLUTION="${SONAR_SOLUTION#"$PROJECT_ROOT/"}"
fi

# Auto-detect project key from solution name if not provided
if [[ -z "${SONAR_PROJECT_KEY:-}" ]]; then
    SONAR_PROJECT_KEY=$(basename "$SONAR_SOLUTION")
    SONAR_PROJECT_KEY="${SONAR_PROJECT_KEY%.slnx}"
    SONAR_PROJECT_KEY="${SONAR_PROJECT_KEY%.sln}"
fi

SOLUTION_PATH="$SONAR_SOLUTION"
COVERAGE_DIR="./coverage"
REPORT_DIR="./sonarqube"
SONAR_PROPS_FILE="$PROJECT_ROOT/sonar-project.properties"
SONAR_PROPS_BACKUP=""
SONARQUBE_WAIT_TIMEOUT=300  # 5 minutes
CE_TASK_WAIT_TIMEOUT=300    # 5 minutes
COMPOSE_FILE="/usr/local/share/sonarqube/docker-compose.sonarqube.yml"

# ── Logging utilities ─────────────────────────────────────────────────────────
log_info()    { printf "\033[1;34m[INFO]\033[0m  %s\n" "$*"; }
log_success() { printf "\033[1;32m[OK]\033[0m    %s\n" "$*"; }
log_warn()    { printf "\033[1;33m[WARN]\033[0m  %s\n" "$*"; }
log_error()   { printf "\033[1;31m[ERROR]\033[0m %s\n" "$*" >&2; }

# ── Cleanup trap ──────────────────────────────────────────────────────────────
cleanup() {
    local exit_code=$?
    if [[ -n "$SONAR_PROPS_BACKUP" && -f "$SONAR_PROPS_BACKUP" ]]; then
        mv "$SONAR_PROPS_BACKUP" "$SONAR_PROPS_FILE"
        log_info "Restored sonar-project.properties"
    fi
    if [[ $exit_code -ne 0 ]]; then
        log_error "Script failed with exit code $exit_code"
    fi
}
trap cleanup EXIT

# ── Auto-detect source & test projects ────────────────────────────────────────
detect_projects() {
    log_info "Auto-detecting project structure..."

    local sln_dir
    sln_dir=$(dirname "$SOLUTION_PATH")

    # Detect source projects (directories containing .csproj but not test projects)
    SRC_PROJECTS=()
    while IFS= read -r csproj; do
        local proj_dir
        proj_dir=$(dirname "$csproj")
        proj_dir="${proj_dir#"$PROJECT_ROOT/"}"
        # Skip test projects
        if [[ "$proj_dir" != *Test* && "$proj_dir" != *test* && "$proj_dir" != *spec* ]]; then
            SRC_PROJECTS+=("$proj_dir")
        fi
    done < <(find "$PROJECT_ROOT" -maxdepth 4 -name "*.csproj" -not -path "*/bin/*" -not -path "*/obj/*" -type f 2>/dev/null | sort)

    # Detect test projects
    TEST_PROJECTS=()
    while IFS= read -r csproj; do
        local proj_dir
        proj_dir=$(dirname "$csproj")
        proj_dir="${proj_dir#"$PROJECT_ROOT/"}"
        if [[ "$proj_dir" == *Test* || "$proj_dir" == *test* || "$proj_dir" == *spec* ]]; then
            TEST_PROJECTS+=("$proj_dir")
        fi
    done < <(find "$PROJECT_ROOT" -maxdepth 4 -name "*.csproj" -not -path "*/bin/*" -not -path "*/obj/*" -type f 2>/dev/null | sort)

    log_info "  Solution:      $SOLUTION_PATH"
    log_info "  Source projects (${#SRC_PROJECTS[@]}):"
    for p in "${SRC_PROJECTS[@]}"; do log_info "    - $p"; done
    log_info "  Test projects  (${#TEST_PROJECTS[@]}):"
    for p in "${TEST_PROJECTS[@]}"; do log_info "    - $p"; done
}

# ── Prerequisites check ──────────────────────────────────────────────────────
check_prerequisites() {
    log_info "Checking prerequisites..."

    if [[ -d "$HOME/.dotnet/tools" ]] && [[ ":$PATH:" != *":$HOME/.dotnet/tools:"* ]]; then
        export PATH="$PATH:$HOME/.dotnet/tools"
    fi

    if ! command -v dotnet &>/dev/null; then
        log_error "'dotnet' CLI not found. Install .NET SDK first."
        exit 1
    fi

    if ! command -v dotnet-sonarscanner &>/dev/null; then
        if dotnet tool list -g 2>/dev/null | grep -qi "dotnet-sonarscanner"; then
            log_warn "'dotnet-sonarscanner' installed but not in PATH. Check ~/.dotnet/tools/"
        else
            log_warn "'dotnet-sonarscanner' not found globally. Installing..."
            dotnet tool install --global dotnet-sonarscanner
        fi
    fi

    if ! command -v curl &>/dev/null; then
        log_error "'curl' not found. It is required for SonarQube health checks."
        exit 1
    fi

    if ! command -v jq &>/dev/null; then
        log_warn "'jq' not found. Markdown report generation will be skipped."
        log_warn "Install jq: sudo apt-get install jq"
    fi

    log_success "Prerequisites OK"
}

# ── Handle sonar-project.properties ──────────────────────────────────────────
handle_sonar_properties() {
    if [[ -f "$SONAR_PROPS_FILE" ]]; then
        SONAR_PROPS_BACKUP="${SONAR_PROPS_FILE}.bak"
        log_warn "Found sonar-project.properties — renaming to .bak to avoid conflict with CLI parameters"
        mv "$SONAR_PROPS_FILE" "$SONAR_PROPS_BACKUP"
    fi
}

# ── Wait for SonarQube to be ready ───────────────────────────────────────────
wait_for_sonarqube() {
    log_info "Waiting for SonarQube to be ready at $SONAR_HOST ..."
    local elapsed=0
    local interval=5

    while [[ $elapsed -lt $SONARQUBE_WAIT_TIMEOUT ]]; do
        local status
        status=$(curl -sf "$SONAR_HOST/api/system/status" 2>/dev/null | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4 || true)

        if [[ "$status" == "UP" ]]; then
            log_success "SonarQube is ready"
            return 0
        fi

        printf "."
        sleep "$interval"
        elapsed=$((elapsed + interval))
    done

    printf "\n"
    log_error "SonarQube did not become ready within ${SONARQUBE_WAIT_TIMEOUT}s"
    exit 1
}

# ── Start SonarQube if not running ───────────────────────────────────────────
ensure_sonarqube_running() {
    local status
    status=$(curl -sf "$SONAR_HOST/api/system/status" 2>/dev/null | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4 || true)

    if [[ "$status" == "UP" ]]; then
        log_success "SonarQube is already running"
        return 0
    fi

    log_info "SonarQube not reachable. Attempting to start via Docker Compose..."

    # Try built-in compose file first, then project-local
    local compose=""
    if [[ -f "$COMPOSE_FILE" ]]; then
        compose="$COMPOSE_FILE"
    elif [[ -f "$PROJECT_ROOT/docker-compose.sonarqube.yml" ]]; then
        compose="$PROJECT_ROOT/docker-compose.sonarqube.yml"
    fi

    if [[ -z "$compose" ]]; then
        log_error "No docker-compose.sonarqube.yml found."
        log_error "Start SonarQube manually or set SONAR_HOST_URL to an existing instance."
        exit 1
    fi

    local docker_output
    if ! docker_output=$(docker compose -f "$compose" up -d 2>&1); then
        if echo "$docker_output" | grep -qi "whiteout"; then
            log_error "Docker pull failed due to overlayfs whiteout file issue (common in WSL2/DinD)."
            log_error "Workaround: Switch Docker storage driver to vfs."
            exit 1
        fi
        log_error "Failed to start SonarQube via Docker Compose:"
        echo "$docker_output" >&2
        exit 1
    fi

    wait_for_sonarqube
}

# ── Wait for Compute Engine task to finish ───────────────────────────────────
wait_for_ce_task() {
    if ! command -v jq &>/dev/null; then
        log_warn "jq not available — skipping CE task wait"
        sleep 10
        return 0
    fi

    log_info "Waiting for SonarQube background task to complete..."
    local elapsed=0
    local interval=5

    while [[ $elapsed -lt $CE_TASK_WAIT_TIMEOUT ]]; do
        local response
        response=$(curl -sf -u "$SONAR_TOKEN:" "$SONAR_HOST/api/ce/component?component=$SONAR_PROJECT_KEY" 2>/dev/null || true)

        if [[ -z "$response" ]]; then
            sleep "$interval"
            elapsed=$((elapsed + interval))
            continue
        fi

        local task_status
        task_status=$(echo "$response" | jq -r '.current.status // .queue[0].status // "NONE"' 2>/dev/null || echo "UNKNOWN")

        case "$task_status" in
            SUCCESS)
                log_success "Background analysis completed successfully"
                return 0
                ;;
            FAILED|CANCELED)
                log_error "Background analysis task $task_status"
                return 1
                ;;
        esac

        printf "."
        sleep "$interval"
        elapsed=$((elapsed + interval))
    done

    printf "\n"
    log_warn "CE task did not complete within ${CE_TASK_WAIT_TIMEOUT}s — report may be incomplete"
}

# ── SonarQube API helper ──────────────────────────────────────────────────────
sonar_api() {
    curl -sf -u "$SONAR_TOKEN:" "$SONAR_HOST$1" 2>/dev/null || echo '{}'
}

# ── Fetch all issues with pagination ─────────────────────────────────────────
fetch_all_issues() {
    local query="$1"
    local page=1
    local page_size=500
    local all_issues="/tmp/sonar_all_issues.json"
    local page_file="/tmp/sonar_page_issues.json"

    echo '[]' > "$all_issues"

    while true; do
        local response
        response=$(curl -s -u "$SONAR_TOKEN:" "$SONAR_HOST/api/issues/search?${query}&ps=${page_size}&p=${page}" 2>/dev/null || echo '{}')
        local count
        count=$(echo "$response" | jq '.issues | length' 2>/dev/null || echo "0")

        if [[ "$count" -eq 0 ]]; then
            break
        fi

        echo "$response" | jq '[.issues[]]' > "$page_file"
        jq -s '.[0] + .[1]' "$all_issues" "$page_file" > "${all_issues}.tmp"
        mv "${all_issues}.tmp" "$all_issues"

        local total
        total=$(echo "$response" | jq '.paging.total // 0')
        local fetched=$((page * page_size))
        if [[ $fetched -ge $total ]]; then
            break
        fi
        page=$((page + 1))
    done

    cat "$all_issues"
    rm -f "$page_file"
}

# ── Generate Markdown report ─────────────────────────────────────────────────
generate_markdown_report() {
    if ! command -v jq &>/dev/null; then
        log_warn "jq not installed — skipping Markdown report generation"
        return 0
    fi

    log_info "Generating Markdown report..."

    mkdir -p "$REPORT_DIR"
    local report_date
    report_date=$(date +%Y-%m-%d)
    local report_file="$REPORT_DIR/sonarqube-report-${report_date}.md"
    local pk="$SONAR_PROJECT_KEY"

    # ── jq helpers ──
    local get_metric='def get(k): .component.measures[]? | select(.metric == k) | .value // "-"'
    local rating_map='def rating(v): if v == "1.0" or v == "1" then "A" elif v == "2.0" or v == "2" then "B" elif v == "3.0" or v == "3" then "C" elif v == "4.0" or v == "4" then "D" elif v == "5.0" or v == "5" then "E" else v end'

    # ── Fetch data ──
    log_info "  Fetching Quality Gate..."
    local qg_response
    qg_response=$(sonar_api "/api/qualitygates/project_status?projectKey=$pk")

    log_info "  Fetching global metrics..."
    local measures_response
    measures_response=$(sonar_api "/api/measures/component?component=$pk&metricKeys=bugs,vulnerabilities,code_smells,coverage,duplicated_lines_density,ncloc,sqale_index,sqale_debt_ratio,reliability_rating,security_rating,sqale_rating,security_hotspots,cognitive_complexity")

    log_info "  Fetching issues facets..."
    local issues_facets_response
    issues_facets_response=$(sonar_api "/api/issues/search?componentKeys=$pk&ps=1&facets=severities,types&resolved=false")

    log_info "  Fetching all issues (paginated)..."
    local all_issues
    all_issues=$(fetch_all_issues "componentKeys=$pk&resolved=false")
    local total_issues
    total_issues=$(echo "$all_issues" | jq 'length')
    log_info "  Fetched $total_issues issues"

    log_info "  Fetching security hotspots..."
    local hotspots_response
    hotspots_response=$(sonar_api "/api/hotspots/search?projectKey=$pk&ps=500")

    log_info "  Fetching per-project metrics..."
    declare -A project_metrics
    for proj in "${SRC_PROJECTS[@]}"; do
        project_metrics["$proj"]=$(sonar_api "/api/measures/component?component=$pk:$proj&metricKeys=coverage,ncloc,bugs,vulnerabilities,code_smells,duplicated_lines_density,cognitive_complexity")
    done

    log_info "  Fetching per-directory coverage..."
    local dir_metrics
    dir_metrics=$(sonar_api "/api/measures/component_tree?component=$pk&metricKeys=coverage,ncloc,bugs,code_smells&qualifier=DIR&ps=500&s=path")

    # ══════════════════════════════════════════════════════════════════════════
    # Build report
    # ══════════════════════════════════════════════════════════════════════════

    # ── Quality Gate ──
    local qg_status
    qg_status=$(echo "$qg_response" | jq -r '.projectStatus.status // "UNKNOWN"')
    local qg_icon="?"
    [[ "$qg_status" == "OK" ]] && qg_icon="PASS"
    [[ "$qg_status" == "ERROR" ]] && qg_icon="FAIL"

    cat > "$report_file" <<HEADER
# SonarQube Analysis Report — ${pk}

**Date** : ${report_date}  |  **Dashboard** : [Open SonarQube](${SONAR_HOST}/dashboard?id=${pk})

---

## Quality Gate : ${qg_icon} ${qg_status}

| Condition | Status | Value | Threshold |
|-----------|--------|-------|-----------|
HEADER

    echo "$qg_response" | jq -r '
        .projectStatus.conditions[]? |
        "| \(.metricKey) | \(.status) | \(.actualValue) | \(.errorThreshold // "-") |"
    ' >> "$report_file" 2>/dev/null || echo "| _No conditions available_ | - | - | - |" >> "$report_file"

    # ── Global Metrics ──
    cat >> "$report_file" <<'SECTION'

---

## Global Metrics

| Metric | Value |
|--------|-------|
SECTION

    echo "$measures_response" | jq -r "
        $get_metric;
        \"| Lines of code | \(get(\"ncloc\")) |\",
        \"| Bugs | \(get(\"bugs\")) |\",
        \"| Vulnerabilities | \(get(\"vulnerabilities\")) |\",
        \"| Code Smells | \(get(\"code_smells\")) |\",
        \"| Coverage | \(get(\"coverage\"))% |\",
        \"| Duplication | \(get(\"duplicated_lines_density\"))% |\",
        \"| Technical debt (min) | \(get(\"sqale_index\")) |\",
        \"| Debt ratio | \(get(\"sqale_debt_ratio\"))% |\",
        \"| Security hotspots | \(get(\"security_hotspots\")) |\",
        \"| Cognitive complexity | \(get(\"cognitive_complexity\")) |\"
    " >> "$report_file" 2>/dev/null || echo "| _Metrics not available_ | - |" >> "$report_file"

    cat >> "$report_file" <<'SECTION'

### Ratings

| Category | Rating |
|----------|--------|
SECTION

    echo "$measures_response" | jq -r "
        $get_metric; $rating_map;
        \"| Reliability | \(get(\"reliability_rating\") | rating) |\",
        \"| Security | \(get(\"security_rating\") | rating) |\",
        \"| Maintainability | \(get(\"sqale_rating\") | rating) |\"
    " >> "$report_file" 2>/dev/null || echo "| _Ratings not available_ | - |" >> "$report_file"

    # ── Coverage by project ──
    cat >> "$report_file" <<'SECTION'

---

## Coverage by Project

| Project | Lines | Coverage | Bugs | Code Smells | Duplication | Complexity |
|---------|-------|----------|------|-------------|-------------|------------|
SECTION

    for proj in "${SRC_PROJECTS[@]}"; do
        local proj_name
        proj_name=$(basename "$proj")
        echo "${project_metrics[$proj]}" | jq -r "
            $get_metric;
            \"| **$proj_name** | \(get(\"ncloc\")) | \(get(\"coverage\"))% | \(get(\"bugs\")) | \(get(\"code_smells\")) | \(get(\"duplicated_lines_density\") // \"-\")% | \(get(\"cognitive_complexity\") // \"-\") |\"
        " >> "$report_file" 2>/dev/null
    done

    # ── Coverage by directory ──
    for proj in "${SRC_PROJECTS[@]}"; do
        local proj_name
        proj_name=$(basename "$proj")

        cat >> "$report_file" <<SECTION

### ${proj_name} — Coverage by Directory

| Directory | Lines | Coverage | Bugs | Code Smells |
|-----------|-------|----------|------|-------------|
SECTION

        echo "$dir_metrics" | jq -r --arg prefix "$proj/" '
            [.components[]? | select(.path | startswith($prefix)) | select(.measures | map(select(.metric == "ncloc")) | length > 0)] |
            sort_by(.path) | .[]? |
            {
                path: .path,
                ncloc:      ([.measures[]? | select(.metric == "ncloc")      | .value] | first // "-"),
                coverage:   ([.measures[]? | select(.metric == "coverage")   | .value] | first // "-"),
                bugs:       ([.measures[]? | select(.metric == "bugs")       | .value] | first // "0"),
                code_smells:([.measures[]? | select(.metric == "code_smells")| .value] | first // "0")
            } |
            "| `\(.path | ltrimstr($prefix))` | \(.ncloc) | \(.coverage)% | \(.bugs) | \(.code_smells) |"
        ' >> "$report_file" 2>/dev/null
    done

    # ── Issues summary ──
    cat >> "$report_file" <<'SECTION'

---

## Issues Summary

### By Severity

| Severity | Count |
|----------|-------|
SECTION

    echo "$issues_facets_response" | jq -r '
        .facets[]? | select(.property == "severities") | .values[]? |
        "| \(.val) | \(.count) |"
    ' >> "$report_file" 2>/dev/null || echo "| _Data not available_ | - |" >> "$report_file"

    cat >> "$report_file" <<'SECTION'

### By Type

| Type | Count |
|------|-------|
SECTION

    echo "$issues_facets_response" | jq -r '
        .facets[]? | select(.property == "types") | .values[]? |
        "| \(.val) | \(.count) |"
    ' >> "$report_file" 2>/dev/null || echo "| _Data not available_ | - |" >> "$report_file"

    # ── Issues by project ──
    cat >> "$report_file" <<'SECTION'

### By Project

| Project | Bugs | Vulnerabilities | Code Smells | Total |
|---------|------|-----------------|-------------|-------|
SECTION

    local ALL_PROJ_PATHS=("${SRC_PROJECTS[@]}" "${TEST_PROJECTS[@]}")
    for proj in "${ALL_PROJ_PATHS[@]}"; do
        local proj_name
        proj_name=$(basename "$proj")
        local suffix=""
        if [[ "$proj" == *Test* || "$proj" == *test* ]]; then
            suffix=" _(tests)_"
        fi
        echo "$all_issues" | jq -r --arg prefix "$proj/" --arg name "${proj_name}${suffix}" '
            [.[] | select(.component | contains(":")) | select(.component | split(":")[1] | startswith($prefix))] |
            {
                bugs:  [.[] | select(.type == "BUG")] | length,
                vulns: [.[] | select(.type == "VULNERABILITY")] | length,
                smells:[.[] | select(.type == "CODE_SMELL")] | length
            } |
            "| **\($name)** | \(.bugs) | \(.vulns) | \(.smells) | \(.bugs + .vulns + .smells) |"
        ' >> "$report_file" 2>/dev/null
    done

    # ── All Bugs ──
    local bug_count
    bug_count=$(echo "$all_issues" | jq '[.[] | select(.type == "BUG")] | length')

    cat >> "$report_file" <<SECTION

---

## All Bugs ($bug_count)

| # | Severity | File | Line | Message |
|---|----------|------|------|---------|
SECTION

    echo "$all_issues" | jq -r '
        [.[] | select(.type == "BUG")] | sort_by(.severity | if . == "BLOCKER" then 0 elif . == "CRITICAL" then 1 elif . == "MAJOR" then 2 elif . == "MINOR" then 3 else 4 end) |
        to_entries[] |
        "| \(.key + 1) | \(.value.severity) | `\(.value.component | split(":") | last)` | \(.value.line // "-") | \(.value.message | gsub("\\|"; "|") | gsub("\n"; " ") | .[0:150]) |"
    ' >> "$report_file" 2>/dev/null

    if [[ "$bug_count" -eq 0 ]]; then
        echo "| - | _No bugs_ | - | - | - |" >> "$report_file"
    fi

    # ── All Vulnerabilities ──
    local vuln_count
    vuln_count=$(echo "$all_issues" | jq '[.[] | select(.type == "VULNERABILITY")] | length')

    cat >> "$report_file" <<SECTION

---

## All Vulnerabilities ($vuln_count)

| # | Severity | File | Line | Message |
|---|----------|------|------|---------|
SECTION

    echo "$all_issues" | jq -r '
        [.[] | select(.type == "VULNERABILITY")] | sort_by(.severity | if . == "BLOCKER" then 0 elif . == "CRITICAL" then 1 elif . == "MAJOR" then 2 elif . == "MINOR" then 3 else 4 end) |
        to_entries[] |
        "| \(.key + 1) | \(.value.severity) | `\(.value.component | split(":") | last)` | \(.value.line // "-") | \(.value.message | gsub("\\|"; "|") | gsub("\n"; " ") | .[0:150]) |"
    ' >> "$report_file" 2>/dev/null

    if [[ "$vuln_count" -eq 0 ]]; then
        echo "| - | _No vulnerabilities_ | - | - | - |" >> "$report_file"
    fi

    # ── All Code Smells by project ──
    local smell_count
    smell_count=$(echo "$all_issues" | jq '[.[] | select(.type == "CODE_SMELL")] | length')

    cat >> "$report_file" <<SECTION

---

## All Code Smells ($smell_count)

SECTION

    for proj in "${ALL_PROJ_PATHS[@]}"; do
        local proj_name
        proj_name=$(basename "$proj")
        local proj_smell_count
        proj_smell_count=$(echo "$all_issues" | jq --arg prefix "$proj/" '[.[] | select(.type == "CODE_SMELL") | select(.component | contains(":")) | select(.component | split(":")[1] | startswith($prefix))] | length')

        if [[ "$proj_smell_count" -eq 0 ]]; then
            continue
        fi

        cat >> "$report_file" <<SECTION

### ${proj_name} ($proj_smell_count code smells)

| # | Severity | File | Line | Message | Rule |
|---|----------|------|------|---------|------|
SECTION

        echo "$all_issues" | jq -r --arg prefix "$proj/" '
            [.[] | select(.type == "CODE_SMELL") | select(.component | contains(":")) | select(.component | split(":")[1] | startswith($prefix))] |
            sort_by(.severity | if . == "BLOCKER" then 0 elif . == "CRITICAL" then 1 elif . == "MAJOR" then 2 elif . == "MINOR" then 3 else 4 end) |
            to_entries[] |
            "| \(.key + 1) | \(.value.severity) | `\(.value.component | split(":") | last | split("/") | last)` | \(.value.line // "-") | \(.value.message | gsub("\\|"; "|") | gsub("\n"; " ") | .[0:120]) | \(.value.rule // "-") |"
        ' >> "$report_file" 2>/dev/null
    done

    # ── Security Hotspots ──
    local hotspot_count
    hotspot_count=$(echo "$hotspots_response" | jq '.hotspots | length' 2>/dev/null || echo "0")

    cat >> "$report_file" <<SECTION

---

## Security Hotspots ($hotspot_count)

### By Status

| Status | Count |
|--------|-------|
SECTION

    if [[ "$hotspot_count" -gt 0 ]]; then
        echo "$hotspots_response" | jq -r '
            [.hotspots[]?] | group_by(.status) | map({status: .[0].status, count: length}) |
            sort_by(.count) | reverse | .[]? |
            "| \(.status) | \(.count) |"
        ' >> "$report_file" 2>/dev/null

        cat >> "$report_file" <<'SECTION'

### Hotspot Details

| # | Category | File | Line | Message |
|---|----------|------|------|---------|
SECTION

        echo "$hotspots_response" | jq -r '
            [.hotspots[]?] | sort_by(.vulnerabilityProbability | if . == "HIGH" then 0 elif . == "MEDIUM" then 1 else 2 end) |
            to_entries[] |
            "| \(.key + 1) | \(.value.vulnerabilityProbability) | `\(.value.component | split(":") | last | split("/") | last)` | \(.value.line // "-") | \(.value.message | gsub("\\|"; "|") | gsub("\n"; " ") | .[0:120]) |"
        ' >> "$report_file" 2>/dev/null
    else
        echo "| _No hotspots_ | 0 |" >> "$report_file"
    fi

    # ── Footer ──
    cat >> "$report_file" <<FOOTER

---

_Report generated by \`sonar-analyze.sh\` on $(date '+%Y-%m-%d at %H:%M:%S')_
_Total: $total_issues issues | Dashboard: ${SONAR_HOST}/dashboard?id=${pk}_
FOOTER

    log_success "Report generated: $report_file ($total_issues issues)"
}

# ══════════════════════════════════════════════════════════════════════════════
# Main flow
# ══════════════════════════════════════════════════════════════════════════════

main() {
    cd "$PROJECT_ROOT"

    echo ""
    echo "================================================================"
    echo "  SonarQube Analysis"
    echo "================================================================"
    echo "  Host     : $SONAR_HOST"
    echo "  Project  : $SONAR_PROJECT_KEY"
    echo "  Solution : $SOLUTION_PATH"
    echo "================================================================"
    echo ""

    # Step 1: Check prerequisites
    check_prerequisites

    # Step 2: Auto-detect projects
    detect_projects

    # Step 3: Handle sonar-project.properties
    handle_sonar_properties

    # Step 4: Ensure SonarQube is running
    ensure_sonarqube_running

    # Step 5: Clean previous coverage
    log_info "Cleaning previous coverage results..."
    rm -rf "$COVERAGE_DIR"
    mkdir -p "$COVERAGE_DIR"

    # Step 6: SonarScanner begin
    log_info "Starting SonarQube scanner..."
    dotnet sonarscanner begin \
        /k:"$SONAR_PROJECT_KEY" \
        /d:sonar.host.url="$SONAR_HOST" \
        /d:sonar.login="$SONAR_TOKEN" \
        /d:sonar.cs.opencover.reportsPaths="**/coverage.opencover.xml" \
        /d:sonar.exclusions="**/bin/**,**/obj/**,examples/**"

    # Step 7: Build
    log_info "Building solution..."
    dotnet build "$SOLUTION_PATH" --configuration Release

    # Step 8: Run tests with coverage
    log_info "Running tests with code coverage..."
    dotnet test "$SOLUTION_PATH" --configuration Release --no-build \
        --collect:"XPlat Code Coverage" \
        --results-directory "$COVERAGE_DIR" \
        -- DataCollectionRunSettings.DataCollectors.DataCollector.Configuration.Format=opencover \
    || log_warn "Some tests failed — continuing with analysis"

    # Step 9: SonarScanner end
    log_info "Finalizing SonarQube analysis..."
    dotnet sonarscanner end /d:sonar.login="$SONAR_TOKEN"

    # Step 10: Wait for background processing
    wait_for_ce_task

    # Step 11: Generate Markdown report
    generate_markdown_report

    # Summary
    echo ""
    echo "================================================================"
    log_success "Analysis complete!"
    echo "  Dashboard : $SONAR_HOST/dashboard?id=$SONAR_PROJECT_KEY"
    if [[ -d "$REPORT_DIR" ]]; then
        echo "  Report    : $(ls -t "$REPORT_DIR"/sonarqube-report-*.md 2>/dev/null | head -1)"
    fi
    echo "================================================================"
    echo ""
}

main "$@"
