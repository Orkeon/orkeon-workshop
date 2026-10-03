#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════
# Claude Code installer for the Orkeon Workshop container
# ══════════════════════════════════════════════════════════════════
# Claude Code is Anthropic's proprietary software. The image published by this project does
# not contain it: a container installs it from Anthropic's npm package the first time it
# starts. An image built locally contains it (build argument CLAUDE_CODE_VERSION, "latest" by
# default; "none" leaves it out, which is how the published image is built).
#
# One code path for both cases. Called:
#   - by the Dockerfile at build time (--strict);
#   - at container start by the entrypoint (docker run) and by the postStartCommand of the
#     devcontainer configurations (VS Code, where the image entrypoint does not run);
#   - by `workshop`, so that a start without network is repaired at the first use.
# Does nothing when Claude Code already works.
#
# Usage:
#   init-claude-code.sh [--strict]
#     --strict   exit 1 when the installation fails (image build). Without it the script
#                always exits 0: a container must start even without network.
#
# Environment:
#   CLAUDE_CODE_VERSION   version to install ("latest" by default); "none": install nothing.
# ══════════════════════════════════════════════════════════════════
set -uo pipefail

# The npm prefix belongs to node: root (entrypoint, image build) installs as node.
if [ "$(id -u)" -eq 0 ]; then
    exec gosu node "$0" "$@"
fi

STRICT=0
[ "${1:-}" = "--strict" ] && STRICT=1
VERSION="${CLAUDE_CODE_VERSION:-latest}"
PREFIX="${NPM_CONFIG_PREFIX:-/usr/local/share/npm-global}"
case ":$PATH:" in *":$PREFIX/bin:"*) ;; *) PATH="$PATH:$PREFIX/bin" ;; esac
export PATH

say()     { printf '[claude-code] %s\n' "$*"; }
give_up() { say "WARNING: $1" >&2
            say "Claude Code is not installed. Run init-claude-code.sh (or workshop) again once this is fixed." >&2
            exit "$STRICT"; }
# Asking for the version, not just looking for the command: an interrupted installation can
# leave a launcher that does not run.
works()   { timeout 20 claude --version >/dev/null 2>&1; }

[ "$VERSION" = "none" ] && exit 0
works && exit 0

# A devcontainer started with another UID than the image's node user leaves the prefix
# unwritable: take it back (node has passwordless sudo).
if [ ! -w "$PREFIX/lib" ] 2>/dev/null; then
    sudo mkdir -p "$PREFIX/lib" "$PREFIX/bin" 2>/dev/null
    sudo chown -R "$(id -u):$(id -g)" "$PREFIX" 2>/dev/null || give_up "cannot write to $PREFIX"
fi

# One installation at a time: the entrypoint, a postStartCommand and `workshop` may overlap.
exec 9>"$PREFIX/.claude-code.lock" || give_up "cannot write to $PREFIX"
flock -w 900 9 || give_up "another installation is still running"
works && exit 0

say "Claude Code is not in this container yet: installing @anthropic-ai/claude-code@$VERSION from npm..."
# Leftovers of an interrupted installation would make npm fail or keep the broken launcher.
rm -rf "$PREFIX/lib/node_modules/@anthropic-ai/claude-code" \
       "$PREFIX"/lib/node_modules/@anthropic-ai/.claude-code-* \
       "$PREFIX/bin/claude" 2>/dev/null
CACHE="$(mktemp -d "${TMPDIR:-/tmp}/npm-cache-claude.XXXXXX")"
LOG="$CACHE/install.log"
# At container start, give up quickly when there is no network (npm's own retries would hold
# the start for more than a minute): the next start, or `workshop`, tries again.
RETRIES=(--fetch-retries=1 --fetch-retry-mintimeout=2000 --fetch-retry-maxtimeout=8000)
[ "$STRICT" -eq 1 ] && RETRIES=()
if ! timeout 900 npm install -g --no-audit --no-fund --include=optional --cache "$CACHE" \
        ${RETRIES[@]+"${RETRIES[@]}"} "@anthropic-ai/claude-code@$VERSION" > "$LOG" 2>&1; then
    # The cause, without npm's stack trace.
    { grep -m 4 -E '^npm error (code|errno|network|notarget|404)' "$LOG" || tail -n 3 "$LOG"; } >&2
    rm -rf "$CACHE"
    give_up "npm install failed (no network, or the firewall does not allow registry.npmjs.org?)"
fi
rm -rf "$CACHE"
works || give_up "the package is installed but its native binary is missing"
say "installed: $(claude --version 2>/dev/null | head -n 1)"
exit 0
