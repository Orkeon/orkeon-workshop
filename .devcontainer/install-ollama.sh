#!/usr/bin/env bash
set -euo pipefail

# ══════════════════════════════════════════════════════════════════
# Ollama installer for the Claude Code devcontainer
# ══════════════════════════════════════════════════════════════════
# Installs (or upgrades) Ollama under /usr/local from the official Linux
# bundle attached to the GitHub release, verified against the release's
# sha256sum.txt. The bundle ships the CUDA runners: the GPU is used when
# the container runs with --gpus=all, the CPU otherwise.
#
# Usage:
#   install-ollama.sh [version] [--force]
#
#   version   e.g. 0.35.0, or "latest" (default: $OLLAMA_VERSION, else latest)
#   --force   reinstall even when that version is already installed
#
# Used at image build time (as root) and by orkeon-update.sh --ollama.
# ══════════════════════════════════════════════════════════════════

PREFIX="/usr/local"
RELEASES="https://github.com/ollama/ollama/releases"
VERSION="${OLLAMA_VERSION:-latest}"
FORCE=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --force) FORCE=true; shift ;;
        --help|-h)
            echo "Usage: $(basename "$0") [version|latest] [--force]"
            echo ""
            echo "Installs Ollama under $PREFIX from the GitHub release bundle (checksum verified)."
            exit 0 ;;
        -*) echo "Unknown option: $1"; exit 1 ;;
        *)  VERSION="$1"; shift ;;
    esac
done

log_info()    { printf "\033[1;34m[OLLAMA]\033[0m  %s\n" "$*"; }
log_success() { printf "\033[1;32m[OLLAMA]\033[0m  %s\n" "$*"; }
log_error()   { printf "\033[1;31m[OLLAMA]\033[0m  %s\n" "$*" >&2; }

case "$(uname -m)" in
    x86_64)        ARCH="amd64" ;;
    aarch64|arm64) ARCH="arm64" ;;
    *) log_error "Unsupported architecture: $(uname -m)"; exit 1 ;;
esac

for tool in curl tar zstd sha256sum; do
    command -v "$tool" >/dev/null 2>&1 || { log_error "Required tool not found: $tool"; exit 1; }
done

SUDO=""
if [ "$(id -u)" -ne 0 ]; then
    SUDO="sudo"
fi

# ── Resolve "latest" without the GitHub REST API (60 requests/hour per IP) ───
if [ "$VERSION" = "latest" ]; then
    latest_url=$(curl -fsSLI -o /dev/null -w '%{url_effective}' "$RELEASES/latest") || {
        log_error "Could not resolve the latest Ollama release"; exit 1; }
    VERSION="${latest_url##*/}"
fi
VERSION="${VERSION#v}"

# ── Skip when already installed ──────────────────────────────────────────────
installed=""
if [ -x "$PREFIX/bin/ollama" ]; then
    installed=$("$PREFIX/bin/ollama" --version 2>&1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+[-.0-9A-Za-z]*' | tail -1 || true)
fi
if [ "$installed" = "$VERSION" ] && [ "$FORCE" != true ]; then
    log_success "Ollama $VERSION is already installed"
    exit 0
fi

# ── Download and verify ──────────────────────────────────────────────────────
ASSET="ollama-linux-${ARCH}.tar.zst"
BASE="$RELEASES/download/v${VERSION}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

log_info "Downloading Ollama $VERSION ($ASSET, ~1.4 GB)..."
# The bundle is large: a transfer cut mid-way (curl 18, 56, 92) resumes where it stopped
# instead of starting over. The checksum below settles whether the result is whole.
attempt=1
until curl -fL --no-progress-meter --retry 3 --retry-delay 5 -C - -o "$TMP/$ASSET" "$BASE/$ASSET"; do
    rc=$?
    if [ "$attempt" -ge 6 ]; then
        log_error "Download failed after $attempt attempts (curl exit $rc)"
        exit 1
    fi
    # 33: the server refused the range request - start over rather than loop on it.
    [ "$rc" -eq 33 ] && rm -f "$TMP/$ASSET"
    attempt=$((attempt + 1))
    log_info "Download interrupted (curl exit $rc), resuming (attempt $attempt/6)..."
    sleep 5
done
curl -fsSL --retry 3 --retry-delay 5 -o "$TMP/sha256sum.txt" "$BASE/sha256sum.txt"

expected=$(tr -d '\r' < "$TMP/sha256sum.txt" | awk -v f="$ASSET" '{ n = $2; sub(/^\.\//, "", n); if (n == f) print $1 }' | head -1)
actual=$(sha256sum "$TMP/$ASSET" | cut -d' ' -f1)
if [ -z "$expected" ] || [ "$expected" != "$actual" ]; then
    log_error "Checksum mismatch for $ASSET (expected '${expected:-none}', got '$actual')"
    exit 1
fi
log_info "Checksum verified"

# ── Install ──────────────────────────────────────────────────────────────────
# The previous lib/ollama is removed first: the runners of two versions must not mix.
log_info "Installing to $PREFIX (from ${installed:-nothing} to $VERSION)..."
$SUDO rm -rf "$PREFIX/lib/ollama"
$SUDO tar --zstd -xf "$TMP/$ASSET" -C "$PREFIX" --no-same-owner

"$PREFIX/bin/ollama" --version >/dev/null 2>&1 || { log_error "Installed binary does not run"; exit 1; }
log_success "Ollama $VERSION installed in $PREFIX/bin/ollama"
