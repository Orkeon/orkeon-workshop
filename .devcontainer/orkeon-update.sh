#!/usr/bin/env bash
set -euo pipefail

# ══════════════════════════════════════════════════════════════════
# Orkeon CLI installer / updater for the Claude Code devcontainer
# ══════════════════════════════════════════════════════════════════
# Installs or updates the `orkeon` dotnet tool (package Orkeon.Scripting.Cli)
# and, on request, Ollama. Used at image build time and inside a running
# container. The installation is root-owned like the other tools of the image,
# so the script escalates with sudo when it is not already root.
#
# Each version lives in its own tool directory (/usr/local/share/orkeon/cli/<version>)
# and /usr/local/bin/orkeon is a symlink to the current one. `dotnet tool update`
# cannot be used here: it renames the installed package directory, and in a
# container overlayfs refuses to rename a directory that comes from an image layer
# ("Invalid cross-device link"). Installing next to the current version also means
# that a failed download leaves the working one untouched.
#
# Channels:
#   dev      latest green `main` build (<version>.dev.<n>) from GitHub Packages.
#            Needs a personal access token (classic) with the read:packages scope.
#   release  latest tagged prerelease from nuget.org (no token).
#   auto     dev when a working token is found, release otherwise (default). Never
#            goes down: a newer installed version is kept.
#   source   built here from the sources of Orkeon/orkeon at a branch, tag or commit
#            (--source <ref>, default main): no token, the latest code. The version is
#            the one of the sources plus `.src.<commit date>.g<commit>`, e.g.
#            1.0.0-rc.4.src.20261007.g80fdefe. Needs git, the .NET SDK and the network
#            (github.com, nuget.org — open api.nuget.org when the firewall runs). The
#            image is built this way (decision D32 of the harness plan).
#
# Usage:
#   orkeon-update [--check] [--channel auto|dev|release|source] [--version X]
#                 [--source [ref]] [--source-dir <dir>] [--ollama [version]]
#
# Token lookup order: $GITHUB_PACKAGES_TOKEN, /run/secrets/github_packages_token,
# `gh auth token`. The token is never written to disk. It is deliberately NOT named
# ORKEON_*: Orkeon loads every ORKEON_* variable into its configuration and its
# secret provider, which would hand the token to the crews' `github` tool.
# ══════════════════════════════════════════════════════════════════

PACKAGE_ID="Orkeon.Scripting.Cli"
PACKAGE_LOWER="orkeon.scripting.cli"
GITHUB_SOURCE="orkeon_github"
GITHUB_FEED="https://nuget.pkg.github.com/Orkeon/index.json"
GITHUB_FLAT="https://nuget.pkg.github.com/Orkeon/download"
NUGET_FEED="https://api.nuget.org/v3/index.json"
NUGET_FLAT="https://api.nuget.org/v3-flatcontainer"
UPSTREAM_REPO="Orkeon/orkeon"
SHARE_DIR="/usr/local/share/orkeon"
CLI_ROOT="$SHARE_DIR/cli"            # one dotnet tool directory per installed version
BIN_LINK="/usr/local/bin/orkeon"     # -> $CLI_ROOT/<version>/orkeon
STAMP_FILE="$SHARE_DIR/install-stamp"
TYPINGS_DIR="$SHARE_DIR/typings"
SECRET_FILE="/run/secrets/github_packages_token"
DEV_VERSION_RE='[.-]dev\.[0-9]+$'
SOURCE_VERSION_RE='[.-]src\.[0-9]{8}\.g[0-9a-f]{7}$'
UPSTREAM_URL="https://github.com/$UPSTREAM_REPO.git"

CHECK=false
CHANNEL="auto"
PIN=""
WITH_OLLAMA=false
OLLAMA_TARGET="latest"
SOURCE_REF="main"
SOURCE_DIR=""

usage() {
    echo "Usage: $(basename "$0") [--check] [--channel auto|dev|release|source] [--version X] [--source [ref]] [--source-dir <dir>] [--ollama [version]]"
    echo ""
    echo "Installs or updates the Orkeon CLI (dotnet tool '$PACKAGE_ID')."
    echo ""
    echo "Options:"
    echo "  --check             Show installed and available versions; change nothing"
    echo "  --channel <name>    auto (default): dev build when a token works, else release;"
    echo "                      keeps the installed version when it is newer"
    echo "                      dev: latest green main from GitHub Packages (token required)"
    echo "                      release: latest tagged prerelease from nuget.org"
    echo "                      source: built here from Orkeon's sources (see --source)"
    echo "  --version <v>       Install exactly this version"
    echo "  --source [ref]      Build from the sources at a branch, tag or commit (default: main)"
    echo "  --source-dir <dir>  Clone into <dir> and keep it (the image packs its packages from it)"
    echo "  --ollama [version]  Also upgrade Ollama (default: latest) and restart its server"
    echo ""
    echo "Token (classic PAT, read:packages): \$GITHUB_PACKAGES_TOKEN, $SECRET_FILE, or 'gh auth token'."
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --check)   CHECK=true; shift ;;
        --channel) CHANNEL="${2:?--channel needs a value}"; shift 2 ;;
        --version) PIN="${2:?--version needs a value}"; shift 2 ;;
        --source)
            CHANNEL="source"; shift
            if [[ $# -gt 0 && "$1" != --* ]]; then SOURCE_REF="$1"; shift; fi ;;
        --source-dir) SOURCE_DIR="${2:?--source-dir needs a value}"; shift 2 ;;
        --ollama)
            WITH_OLLAMA=true; shift
            if [[ $# -gt 0 && "$1" != --* ]]; then OLLAMA_TARGET="$1"; shift; fi ;;
        --help|-h) usage; exit 0 ;;
        *) echo "Unknown option: $1"; usage; exit 1 ;;
    esac
done

case "$CHANNEL" in
    auto|dev|release|source) ;;
    *) echo "Unknown channel: $CHANNEL (expected auto, dev, release or source)"; exit 1 ;;
esac
if [ "$CHANNEL" = "source" ] && [ -n "$PIN" ]; then
    echo "--version and --source exclude each other: a source build takes its version from the sources"
    exit 1
fi
# A ref is a branch, a tag or a commit: nothing that git could read as an option.
if [[ ! "$SOURCE_REF" =~ ^[A-Za-z0-9][A-Za-z0-9._/-]*$ ]]; then
    echo "Not a git ref: $SOURCE_REF"
    exit 1
fi

# A version names the directory it is installed in: nothing but a package version gets there.
VERSION_RE='^[0-9]+\.[0-9]+\.[0-9]+([-+.][0-9A-Za-z.+-]+)?$'
if [ -n "$PIN" ] && [[ ! "$PIN" =~ $VERSION_RE ]]; then
    echo "Not a package version: $PIN (expected something like 1.0.0-rc.4 or 1.0.0-rc.4.dev.123)"
    exit 1
fi

log_info()    { printf "\033[1;34m[ORKEON]\033[0m  %s\n" "$*"; }
log_success() { printf "\033[1;32m[ORKEON]\033[0m  %s\n" "$*"; }
log_warn()    { printf "\033[1;33m[ORKEON]\033[0m  %s\n" "$*"; }
log_error()   { printf "\033[1;31m[ORKEON]\033[0m  %s\n" "$*" >&2; }

as_root() {
    if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo -H "$@"; fi
}

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# ── Token ────────────────────────────────────────────────────────────────────
TOKEN=""
TOKEN_SOURCE=""
GITHUB_USER=""

# Authenticated request against GitHub Packages; the credentials travel on stdin, never in argv.
github_curl() {
    printf 'user = "%s:%s"\n' "$GITHUB_USER" "$TOKEN" | curl -sS -K - "$@"
}

# GitHub documents the account name as the feed username: ask the API who owns the token.
github_login() {
    printf 'header = "Authorization: Bearer %s"\n' "$1" \
        | curl -fsS -K - -m 20 https://api.github.com/user 2>/dev/null | jq -r '.login // empty' 2>/dev/null || true
}

try_token() {   # $1 = candidate, $2 = where it comes from
    local candidate user code
    candidate=$(printf '%s' "$1" | tr -d '\r\n' | sed 's/^\xEF\xBB\xBF//')
    [ -n "$candidate" ] || return 1
    user="${GITHUB_PACKAGES_USER:-$(github_login "$candidate")}"
    user="${user:-x-access-token}"
    # Probe the package's version list, not the service index: the index answers 200 to any
    # credentials, the package endpoints are the ones that check the token.
    code=$(printf 'user = "%s:%s"\n' "$user" "$candidate" \
        | curl -sS -K - -o /dev/null -w '%{http_code}' -m 20 "$GITHUB_FLAT/$PACKAGE_LOWER/index.json" 2>/dev/null || true)
    if [ "$code" = "200" ]; then
        TOKEN="$candidate"
        TOKEN_SOURCE="$2"
        GITHUB_USER="$user"
        return 0
    fi
    log_warn "The token from $2 was rejected by GitHub Packages (HTTP ${code:-?}): expired, or missing the read:packages scope?"
    return 1
}

resolve_token() {
    if [ -n "${GITHUB_PACKAGES_TOKEN:-}" ] && try_token "$GITHUB_PACKAGES_TOKEN" "GITHUB_PACKAGES_TOKEN"; then
        return 0
    fi
    if [ -s "$SECRET_FILE" ] && try_token "$(cat "$SECRET_FILE" 2>/dev/null)" "$SECRET_FILE"; then
        return 0
    fi
    local gh_token
    if command -v gh >/dev/null 2>&1 && gh_token=$(gh auth token 2>/dev/null) && try_token "$gh_token" "gh auth token"; then
        return 0
    fi
    return 1
}

# ── Versions ─────────────────────────────────────────────────────────────────
installed_version() {
    local target
    target=$(readlink -f "$BIN_LINK" 2>/dev/null) || return 0
    case "$target" in
        "$CLI_ROOT"/*/orkeon) [ -x "$target" ] && basename "$(dirname "$target")" ;;
    esac
    return 0
}

# Reads a flat-container index ({"versions":[...]}) on stdin, prints the highest version.
# `~` sorts before anything in `sort -V`, which puts 1.0.0-rc.4 below 1.0.0.
highest_version() {
    jq -r '.versions[]?' 2>/dev/null | sed 's/-/~/' | sort -V | tail -1 | sed 's/~/-/'
}

# True when $1 is a higher version than $2 (same ordering).
version_gt() {
    [ "$1" != "$2" ] && [ "$(printf '%s\n%s\n' "$1" "$2" | sed 's/-/~/' | sort -V | tail -1 | sed 's/~/-/')" = "$1" ]
}

release_latest() {
    curl -fsSL -m 20 "$NUGET_FLAT/$PACKAGE_LOWER/index.json" 2>/dev/null | highest_version
}

dev_latest() {
    github_curl -f -m 20 "$GITHUB_FLAT/$PACKAGE_LOWER/index.json" 2>/dev/null | highest_version
}

ollama_installed() {
    command -v ollama >/dev/null 2>&1 || return 0
    ollama --version 2>&1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+[-.0-9A-Za-z]*' | tail -1 || true
}

ollama_latest() {
    local url
    url=$(curl -fsSLI -o /dev/null -w '%{url_effective}' -m 20 https://github.com/ollama/ollama/releases/latest 2>/dev/null) || return 0
    url="${url##*/}"
    printf '%s' "${url#v}"
}

# The companion scripts live in /usr/local/bin in the image, next to this one in the repo.
sibling_script() {
    local candidate
    for candidate in "/usr/local/bin/$1" "$(dirname "$(readlink -f "$0")")/$1"; do
        if [ -f "$candidate" ]; then printf '%s' "$candidate"; return 0; fi
    done
}

# ── --check ──────────────────────────────────────────────────────────────────
if [ "$CHECK" = true ]; then
    current=$(installed_version)
    origin=""
    if [ -f "$STAMP_FILE" ]; then
        origin=" — channel $(sed -n 's/^channel=//p' "$STAMP_FILE") ($(sed -n 's/^reason=//p' "$STAMP_FILE"))"
    fi
    printf 'Orkeon   installed : %s%s\n' "${current:-not installed}" "$origin"
    printf '         release   : %s (nuget.org)\n' "$(release_latest || true)"
    if [ -f "$STAMP_FILE" ] && grep -qx 'channel=source' "$STAMP_FILE"; then
        printf '         source    : built from commit %s; main is now at %s\n' \
            "$(sed -n 's/^commit=//p' "$STAMP_FILE" | cut -c1-12)" \
            "$(git ls-remote "$UPSTREAM_URL" refs/heads/main 2>/dev/null | cut -c1-12 || echo unknown)"
    fi
    if resolve_token; then
        printf '         dev       : %s (GitHub Packages, token from %s)\n' "$(dev_latest || echo unknown)" "$TOKEN_SOURCE"
    else
        printf '         dev       : no usable token (classic PAT with read:packages in $GITHUB_PACKAGES_TOKEN or %s)\n' "$SECRET_FILE"
    fi
    printf 'Ollama   installed : %s\n' "$(ollama_installed | grep . || echo 'not installed')"
    printf '         latest    : %s\n' "$(ollama_latest | grep . || echo unknown)"
    init_script=$(sibling_script init-orkeon.sh)
    if [ -n "$init_script" ]; then
        bash "$init_script" --status | sed 's/^/         /' || true
    fi
    exit 0
fi

# ── Guards ───────────────────────────────────────────────────────────────────
command -v dotnet >/dev/null 2>&1 || { log_error "dotnet is required"; exit 1; }

# One update at a time (the lock is taken on the installation directory itself, readable by
# every user), and never under a running crew: the previous version is removed at the end.
as_root mkdir -p "$CLI_ROOT"
exec 9<"$CLI_ROOT"
flock -n 9 || { log_error "Another orkeon-update is running"; exit 1; }
if pgrep -x orkeon >/dev/null 2>&1; then
    log_error "An 'orkeon' process is running — stop it (or wait for the crew to finish) before updating"
    exit 1
fi

# ── Pick the feed ────────────────────────────────────────────────────────────
before=$(installed_version)
effective=""
reason=""

need_token() {
    resolve_token && return 0
    log_error "The dev channel needs a GitHub personal access token (classic) with the read:packages scope."
    log_error "Provide it in \$GITHUB_PACKAGES_TOKEN or in $SECRET_FILE."
    exit 1
}

if [ "$CHANNEL" = "source" ]; then
    effective="source"; reason="built from $UPSTREAM_REPO@$SOURCE_REF"
elif [ -n "$PIN" ]; then
    # A pinned dev build only exists on GitHub Packages; a tagged version is on nuget.org.
    if [ "$CHANNEL" = "dev" ] || [[ "$PIN" =~ $DEV_VERSION_RE ]]; then
        need_token
        effective="dev"; reason="version pinned, token from $TOKEN_SOURCE"
    else
        effective="release"; reason="tagged version pinned"
    fi
elif [ "$CHANNEL" = "release" ]; then
    effective="release"; reason="requested"
elif [ "$CHANNEL" = "dev" ]; then
    need_token
    effective="dev"; reason="requested, token from $TOKEN_SOURCE"
elif resolve_token; then
    effective="dev"; reason="token from $TOKEN_SOURCE"
else
    effective="release"; reason="no usable GitHub Packages token"
    log_warn "No usable GitHub Packages token: the dev channel cannot be read, using the latest tagged prerelease from nuget.org."
fi

# ── Install / update ─────────────────────────────────────────────────────────
write_config() {   # $1 = file, $2 = channel — exactly one source, so the feed cannot be ambiguous
    local name="nuget.org" url="$NUGET_FEED"
    if [ "$2" = "dev" ]; then name="$GITHUB_SOURCE"; url="$GITHUB_FEED"; fi
    if [ "$2" = "source" ]; then name="orkeon-source"; url="$WORK/feed"; fi
    cat > "$1" <<EOF
<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <packageSources>
    <clear />
    <add key="$name" value="$url" />
  </packageSources>
</configuration>
EOF
}

resolve_target() {   # $1 = channel — prints the version to install
    if [ -n "$PIN" ]; then
        printf '%s' "$PIN"
    elif [ "$1" = "dev" ]; then
        dev_latest
    else
        release_latest
    fi
}

tool_install() {   # $1 = channel, $2 = version — installs into $CLI_ROOT/<version>
    local cfg="$WORK/NuGet.$1.Config" dest="$CLI_ROOT/$2"
    # --configfile loads this file only: the user-level config written by clean-restore.sh
    # (source mapping to nuget.org + local feed) would otherwise hide the GitHub feed.
    write_config "$cfg" "$1"
    as_root rm -rf "$dest" || return 1   # left by an interrupted run

    local args=(tool install "$PACKAGE_ID" --version "$2" --tool-path "$dest" --configfile "$cfg" --no-http-cache)
    local rc=0
    if [ "$1" = "dev" ]; then
        # NuGet reads the feed credentials from this variable: the token never touches the disk.
        local var="NuGetPackageSourceCredentials_${GITHUB_SOURCE}"
        (
            export "$var=Username=${GITHUB_USER};Password=${TOKEN}"
            if [ "$(id -u)" -eq 0 ]; then dotnet "${args[@]}"; else sudo -H --preserve-env="$var" dotnet "${args[@]}"; fi
        ) || rc=1
    else
        as_root dotnet "${args[@]}" || rc=1
    fi
    if [ "$rc" -eq 0 ] && ! ( cd "$WORK" && "$dest/orkeon" --version >/dev/null 2>&1 ); then
        log_warn "Orkeon $2 was installed but does not start"
        rc=1
    fi
    [ "$rc" -eq 0 ] || as_root rm -rf "$dest"
    return "$rc"
}

# Points the `orkeon` command at a version and drops the other ones.
switch_to() {   # $1 = version
    as_root ln -sfn "$CLI_ROOT/$1/orkeon" "$BIN_LINK" || return 1
    local other
    for other in "$CLI_ROOT"/*/; do
        other="${other%/}"
        if [ -d "$other" ] && [ "$(basename "$other")" != "$1" ]; then
            as_root rm -rf "$other"
        fi
    done
}

# Installs the version the channel resolves to, unless it is the one in place.
ensure_version() {   # $1 = channel
    local target
    target=$(resolve_target "$1" || true)
    if [[ ! "$target" =~ $VERSION_RE ]]; then
        log_warn "Could not read the available versions of the $1 channel"
        return 1
    fi
    [ "$target" != "$before" ] || return 0
    # Going down is only done on request: in auto mode, a container started without a token
    # must not trade the dev build baked into the image for the older tagged prerelease.
    if [ "$CHANNEL" = "auto" ] && [ -z "$PIN" ] && [ -n "$before" ] && version_gt "$before" "$target"; then
        log_warn "Keeping Orkeon $before: it is newer than $target, the latest of the $1 channel (--channel $1 installs that one)."
        KEPT=true
        return 0
    fi
    log_info "Installing Orkeon $target..."
    tool_install "$1" "$target" || return 1
    switch_to "$target"
}

# ── Source builds ────────────────────────────────────────────────────────────
SOURCE_COMMIT=""

# Clones the ref (shallow) into $SRC, or updates the clone already there.
fetch_source() {   # $1 = checkout directory
    local src="$1"
    mkdir -p "$src"
    if [ ! -d "$src/.git" ]; then
        git -C "$src" init -q && git -C "$src" remote add origin "$UPSTREAM_URL"
    fi
    git -C "$src" fetch -q --depth 1 origin "$SOURCE_REF" || return 1
    git -C "$src" checkout -q --force FETCH_HEAD || return 1
    SOURCE_COMMIT=$(git -C "$src" rev-parse HEAD)
}

# The version of a source build: the one of the sources, plus the commit date and the commit.
source_version() {   # $1 = checkout directory
    local props="$1/src/Directory.Build.props" prefix suffix day version
    prefix=$(sed -n 's/.*<VersionPrefix>\(.*\)<\/VersionPrefix>.*/\1/p' "$props" | head -1)
    suffix=$(sed -n 's/.*<VersionSuffix>\(.*\)<\/VersionSuffix>.*/\1/p' "$props" | head -1)
    [[ "$prefix" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || return 1
    day=$(git -C "$1" log -1 --format=%cd --date=format:%Y%m%d)
    version="$prefix${suffix:+-$suffix}"
    if [ -n "$suffix" ]; then version="$version.src.$day.g${SOURCE_COMMIT:0:7}"; else version="$version-src.$day.g${SOURCE_COMMIT:0:7}"; fi
    printf '%s' "$version"
}

# Packs the CLI tool from the checkout and installs it next to the current version.
ensure_source() {
    local src="${SOURCE_DIR:-$WORK/source}" target feed="$WORK/feed"
    log_info "Fetching $UPSTREAM_REPO@$SOURCE_REF..."
    fetch_source "$src" || { log_warn "Could not fetch $SOURCE_REF from $UPSTREAM_URL"; return 1; }
    target=$(source_version "$src") || { log_warn "Could not read the version of the sources (src/Directory.Build.props)"; return 1; }
    SOURCE_CHECKOUT="$src"
    reason="built from $UPSTREAM_REPO@$SOURCE_REF ($SOURCE_COMMIT)"
    [ "$target" != "$before" ] || return 0
    log_info "Building Orkeon $target from commit ${SOURCE_COMMIT:0:12} (a few minutes)..."
    mkdir -p "$feed"
    if ! ( export DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_NOLOGO=1
           dotnet pack "$src/src/scripting/Orkeon.Scripting.Cli/Orkeon.Scripting.Cli.csproj" -c Release -o "$feed" --nologo \
             "-p:Version=$target" -p:ContinuousIntegrationBuild=true -p:SkipScriptingNpmInstall=true > "$WORK/pack.log" 2>&1 ); then
        grep -E ' error ' "$WORK/pack.log" | sort -u | head -n 20 >&2 || true
        log_warn "dotnet pack of the CLI failed (log: $WORK/pack.log)"
        return 1
    fi
    tool_install source "$target" || return 1
    switch_to "$target"
}

KEPT=false
SOURCE_CHECKOUT=""

log_info "Orkeon: ${before:-not installed} -> channel '$effective' ($reason)${PIN:+, version $PIN}"

if [ "$effective" = "source" ]; then
    ensure_source || { log_error "Orkeon source build failed — ${before:-nothing} stays in place"; exit 1; }
elif ! ensure_version "$effective"; then
    if [ "$effective" = "dev" ] && [ "$CHANNEL" = "auto" ] && [ -z "$PIN" ]; then
        log_warn "The dev channel install failed: falling back to the latest tagged prerelease from nuget.org."
        effective="release"; reason="dev channel install failed"
        ensure_version "$effective" || { log_error "Orkeon install failed — ${before:-nothing} stays in place"; exit 1; }
    else
        log_error "Orkeon install failed — ${before:-nothing} stays in place"
        exit 1
    fi
fi

after=$(installed_version)
[ -n "$after" ] || { log_error "Orkeon is not installed after the update"; exit 1; }

# ── Post-install ─────────────────────────────────────────────────────────────
STORE="$CLI_ROOT/$after/.store/$PACKAGE_LOWER/$after/$PACKAGE_LOWER/$after"

# The tool store keeps the package twice (<id>.<version>.nupkg and <Id>.nupkg, ~140 MB each):
# make the second a hard link to the first.
mapfile -t nupkgs < <(find "$STORE" -maxdepth 1 -name '*.nupkg' 2>/dev/null | LC_ALL=C sort)
if [ "${#nupkgs[@]}" -eq 2 ] && cmp -s "${nupkgs[0]}" "${nupkgs[1]}"; then
    as_root ln -f "${nupkgs[0]}" "${nupkgs[1]}" || true
fi

# Visible record of what was installed and why (shown by the entrypoint and by --check),
# so that an automatic fallback to nuget.org never goes unnoticed. A version that was kept
# keeps the record of where it came from.
if [ "$KEPT" != true ]; then
    {
        printf 'version=%s\nchannel=%s\nrequested=%s\nreason=%s\ndate=%s\n' \
            "$after" "$effective" "$CHANNEL" "$reason" "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
        if [ "$effective" = "source" ]; then printf 'commit=%s\nref=%s\n' "$SOURCE_COMMIT" "$SOURCE_REF"; fi
    } | as_root tee "$STAMP_FILE" >/dev/null
fi

# orkeon.d.ts is in no published Orkeon package; since main a2bb6c3 the tool writes the typings
# per project (`orkeon typings`, into ./.orkeon/), while the harness needs one shared file at a
# fixed path: rebuild the upstream rollup (banner + errors.d.ts + the rest, alphabetically) from
# the commit the tool was built from. Best effort — only the tsc check of .ork.ts crews needs it.
refresh_typings() {
    local nuspec commit ref src rollup
    if [ -n "$SOURCE_CHECKOUT" ] && [ -f "$SOURCE_CHECKOUT/src/scripting/Orkeon.Scripting/Typings/errors.d.ts" ]; then
        src="$SOURCE_CHECKOUT/src/scripting/Orkeon.Scripting/Typings"
        ref="$SOURCE_COMMIT"
        write_typings "$src" "$ref"
        return
    fi
    nuspec=$(find "$STORE" -maxdepth 1 -name '*.nuspec' 2>/dev/null | head -1)
    commit=""
    if [ -n "$nuspec" ]; then
        commit=$(grep -oE 'commit="[0-9a-f]{7,40}"' "$nuspec" | head -1 | cut -d'"' -f2 || true)
    fi
    if [ -n "$commit" ]; then
        ref="$commit"
    elif [[ "$after" =~ $DEV_VERSION_RE ]]; then
        ref="main"
    else
        ref="v$after"
    fi

    mkdir -p "$WORK/typings"
    curl -fsSL -m 180 "https://codeload.github.com/$UPSTREAM_REPO/tar.gz/$ref" \
        | tar -xz -C "$WORK/typings" --strip-components=1 --wildcards '*/src/scripting/Orkeon.Scripting/Typings/*.d.ts' || return 1
    src="$WORK/typings/src/scripting/Orkeon.Scripting/Typings"
    [ -f "$src/errors.d.ts" ] || return 1
    write_typings "$src" "$ref"
}

# Rolls the typings of a source tree up into one orkeon.d.ts (banner, errors.d.ts, the rest).
write_typings() {   # $1 = Typings directory, $2 = the ref it comes from
    local src="$1" ref="$2" rollup
    rollup="$WORK/orkeon.d.ts"
    {
        echo "// Orkeon Scripting DSL - TypeScript declarations (Orkeon $after)"
        echo "// Rolled up by orkeon-update from $UPSTREAM_REPO@$ref, src/scripting/Orkeon.Scripting/Typings/*.d.ts"
        echo "// DO NOT EDIT - rebuilt on every orkeon-update"
        cat "$src/errors.d.ts"
        find "$src" -maxdepth 1 -name '*.d.ts' ! -name 'errors.d.ts' | LC_ALL=C sort | while IFS= read -r f; do cat "$f"; done
    } > "$rollup"

    as_root mkdir -p "$TYPINGS_DIR"
    as_root install -m 644 "$rollup" "$TYPINGS_DIR/orkeon.d.ts"
}

if [ "$before" = "$after" ] && grep -qsF "(Orkeon $after)" "$TYPINGS_DIR/orkeon.d.ts"; then
    :   # same version, typings already match
elif refresh_typings; then
    log_info "Typings refreshed: $TYPINGS_DIR/orkeon.d.ts"
else
    log_warn "Could not refresh the TypeScript typings (only the tsc check of .ork.ts crews uses them)"
fi

if [ "$KEPT" = true ]; then
    log_success "Orkeon $after kept"
elif [ "$before" = "$after" ]; then
    log_success "Orkeon $after is up to date (channel: $effective)"
else
    log_success "Orkeon ${before:-not installed} -> $after (channel: $effective)"
fi

# ── Ollama (on request) ──────────────────────────────────────────────────────
if [ "$WITH_OLLAMA" = true ]; then
    installer=$(sibling_script install-ollama.sh)
    if [ -z "$installer" ]; then
        log_error "install-ollama.sh not found"
        exit 1
    fi
    ollama_before=$(ollama_installed)
    log_info "Ollama: ${ollama_before:-not installed} -> $OLLAMA_TARGET (the bundle is written to this container's writable layer)"
    bash "$installer" "$OLLAMA_TARGET"
    ollama_after=$(ollama_installed)
    if [ "$ollama_before" != "$ollama_after" ]; then
        # The respawn loop of init-orkeon.sh restarts the server on the new binary.
        pkill -x ollama 2>/dev/null || true
        sleep 3
    fi
    init_script=$(sibling_script init-orkeon.sh)
    if [ -n "$init_script" ]; then
        bash "$init_script" || true
    fi
    log_success "Ollama ${ollama_before:-not installed} -> ${ollama_after:-unknown}"
fi
