#!/bin/bash
set -e

# ══════════════════════════════════════════════════════════════════════════════
# Entrypoint — Orkeon Workshop devcontainer
# ══════════════════════════════════════════════════════════════════════════════
# Runs as ROOT to perform privileged setup (Docker, permissions, harness).
# Drops to the target user (node) via gosu for the final command.
# ══════════════════════════════════════════════════════════════════════════════

TARGET_USER="node"
TARGET_HOME="/home/$TARGET_USER"

echo "[entrypoint] Initializing as root, target user: $TARGET_USER"

# ── Docker: dind, socket or none, as $DOCKER_MODE says ───────────────────────
# init-docker.sh starts a daemon inside the container (dind, the default: needs --privileged),
# reuses the host's daemon through its bind-mounted socket (socket), or does nothing (none). The
# DinD and Host Socket VS Code configurations call it from their postStartCommand, since the
# image entrypoint does not run there. It never fails the start-up.
if [ -x /usr/local/bin/init-docker.sh ]; then
    /usr/local/bin/init-docker.sh || echo "[entrypoint] WARNING: Docker set-up failed (see the [docker] lines above)"
fi

# ── The workshop: deploy / resync the harness ────────────────────────────────
# $ORKEON_WORKSHOP (default /workspace, usually a bind mount of the host's Orkeon folder) is
# where Claude Code opens (`workshop`), where the harness lives (.claude, references, library)
# and where Studio reads its team catalogue (teams/). sync-harness.sh compares the manifest of
# the harness shipped by this image with what it deployed last time: one file read when the
# image has not changed, otherwise added / updated / retired files are propagated (local
# edits are backed up). It deploys only into a workshop - a folder it deployed into before,
# one holding teams/, or an empty one - and says so when /workspace is something else.
# Runs as the target user — on a bind mount, files created by root would stay root-owned.
WORKSHOP="${ORKEON_WORKSHOP:-/workspace}"
if [ ! -d "$WORKSHOP" ]; then
    mkdir -p "$WORKSHOP" && chown "$TARGET_USER:$TARGET_USER" "$WORKSHOP"
fi
if [ -x /usr/local/bin/sync-harness.sh ]; then
    gosu "$TARGET_USER" env ORKEON_WORKSHOP="$WORKSHOP" /usr/local/bin/sync-harness.sh \
        || echo "[entrypoint] WARNING: harness synchronisation failed (see above)"
fi

# ── Ensure dotnet-sonarscanner is discoverable ───────────────────────────────
if [ -d "/usr/local/share/dotnet-tools" ]; then
    export PATH="/usr/local/share/dotnet-tools:$PATH"
fi

# ── Ensure node home directories are writable ────────────────────────────────
for dir in "${TARGET_HOME}/.claude" "${TARGET_HOME}/.local" "${TARGET_HOME}/.dotnet" "${TARGET_HOME}/.nuget" \
           "${TARGET_HOME}/.ollama" "${TARGET_HOME}/.config"; do
    if [ -d "$dir" ]; then
        chown -R "$TARGET_USER:$TARGET_USER" "$dir" 2>/dev/null || true
    fi
done

# ── Claude Code ──────────────────────────────────────────────────────────────
# The image published by the project ships without Claude Code (Anthropic's proprietary
# software): it is installed here, from npm, the first time the container starts. Does nothing
# when the image already has it (local build), and never fails the startup.
if [ -x /usr/local/bin/init-claude-code.sh ]; then
    /usr/local/bin/init-claude-code.sh || true
fi

# ── Initialize RTK hook for Claude Code (first run only) ─────────────────────
RTK_MARKER="${TARGET_HOME}/.claude/.rtk-initialized"
if command -v rtk >/dev/null 2>&1 && [ ! -f "$RTK_MARKER" ]; then
    echo "[entrypoint] Initializing RTK hook for $TARGET_USER..."
    mkdir -p "${TARGET_HOME}/.claude"
    chown "$TARGET_USER:$TARGET_USER" "${TARGET_HOME}/.claude"
    if timeout 15 gosu "$TARGET_USER" rtk init -g --auto-patch </dev/null >/var/log/rtk-init.log 2>&1; then
        gosu "$TARGET_USER" touch "$RTK_MARKER"
        echo "[entrypoint] RTK hook initialized"
    else
        echo "[entrypoint] WARNING: rtk init failed or timed out (see /var/log/rtk-init.log)"
    fi
fi

# ── Ensure zsh has a config for node (prevents zsh-newuser-install prompt) ──
if [ ! -f "${TARGET_HOME}/.zshrc" ]; then
    if [ -f /root/.zshrc ]; then
        cp /root/.zshrc "${TARGET_HOME}/.zshrc"
        sed -i "s|/root/|${TARGET_HOME}/|g" "${TARGET_HOME}/.zshrc"
        [ -d /root/.oh-my-zsh ] && [ ! -d "${TARGET_HOME}/.oh-my-zsh" ] && \
            cp -r /root/.oh-my-zsh "${TARGET_HOME}/.oh-my-zsh"
        [ -f /root/.p10k.zsh ] && [ ! -f "${TARGET_HOME}/.p10k.zsh" ] && \
            cp /root/.p10k.zsh "${TARGET_HOME}/.p10k.zsh"
        echo "[entrypoint] Restored .zshrc for $TARGET_USER from /root template"
    else
        # Last resort: an empty file, so that zsh does not start zsh-newuser-install
        touch "${TARGET_HOME}/.zshrc"
        echo "[entrypoint] Created empty .zshrc for $TARGET_USER (no /root template found)"
    fi
    chown -R "$TARGET_USER:$TARGET_USER" \
        "${TARGET_HOME}/.zshrc" \
        "${TARGET_HOME}/.oh-my-zsh" \
        "${TARGET_HOME}/.p10k.zsh" 2>/dev/null || true
fi

# ── Ensure commandhistory is writable ────────────────────────────────────────
if [ -d /commandhistory ]; then
    chmod 777 /commandhistory 2>/dev/null || true
    touch /commandhistory/.bash_history
    chmod 666 /commandhistory/.bash_history
fi

# ── Reset Claude Code's git identity override ────────────────────────────────
# Claude Code sets user.name="Claude" and user.email="claude@anthropic.com" in
# the repo's local .git/config. Remove these so the global/system config is used.
repos=(/workspace)
[ "$WORKSHOP" != /workspace ] && repos+=("$WORKSHOP")
for repo in "${repos[@]}"; do
    if [ -d "$repo/.git" ]; then
        git -C "$repo" config --local --unset user.name 2>/dev/null || true
        git -C "$repo" config --local --unset user.email 2>/dev/null || true
        echo "[entrypoint] Git local user identity reset in $repo"
    fi
done

# Pre-create claude-usage log file (writable by node)
touch /var/log/claude-usage.log
chown "$TARGET_USER:$TARGET_USER" /var/log/claude-usage.log

# ── Start claude-usage dashboard in background ───────────────────────────────
# Runs as the target user so the dashboard reads node's ~/.claude data.
if command -v claude-usage-dashboard >/dev/null 2>&1; then
    if ! pgrep -f "claude-usage/cli.py dashboard" >/dev/null 2>&1; then
        echo "[entrypoint] Starting claude-usage dashboard..."
        gosu "$TARGET_USER" nohup claude-usage-dashboard \
            >/var/log/claude-usage.log 2>&1 &
        echo "[entrypoint] claude-usage dashboard started (logs: /var/log/claude-usage.log)"
    else
        echo "[entrypoint] claude-usage dashboard already running"
    fi
fi

# ── Orkeon sandbox root ──────────────────────────────────────────────────────
# Orkeon creates /tmp/orkeon-sandbox/<pid>-<stamp> at each run: the parent must stay writable
# by every user (a root-owned one, e.g. after a `sudo orkeon`, aborts every run of node).
mkdir -p /tmp/orkeon-sandbox && chmod 1777 /tmp/orkeon-sandbox

# ── Orkeon + Ollama ──────────────────────────────────────────────────────────
# init-orkeon.sh writes the default Orkeon config when there is none, starts Ollama
# according to $OLLAMA_MODE (local server, forwarder to the host, or nothing) and pulls
# the default model in the background. It returns at once and never fails the startup.
if [ -x /usr/local/bin/init-orkeon.sh ]; then
    /usr/local/bin/init-orkeon.sh || true
fi
# What orkeon-update.sh installed, and from which channel: a fallback from the dev channel
# to nuget.org (missing or expired token) must not go unnoticed.
if [ -f /usr/local/share/orkeon/install-stamp ]; then
    echo "[entrypoint] Orkeon $(sed -n 's/^version=//p' /usr/local/share/orkeon/install-stamp)" \
         "(channel: $(sed -n 's/^channel=//p' /usr/local/share/orkeon/install-stamp)," \
         "$(sed -n 's/^reason=//p' /usr/local/share/orkeon/install-stamp)) — update with: orkeon-update"
fi
if [ -f "$WORKSHOP/.claude/.harness-manifest" ]; then
    tour=""
    [ -n "$(ls -A "$WORKSHOP/teams" 2>/dev/null)" ] || tour=" (new here? then type /orkeon-tour in Claude Code)"
    echo "[entrypoint] Workshop: $WORKSHOP — open it with: workshop$tour"
else
    echo "[entrypoint] Workshop: $WORKSHOP — no harness deployed there (see the [harness] lines above)"
fi

# ── Drop privileges and exec the command as target user ─────────────────────
echo "[entrypoint] Dropping to user: $TARGET_USER"
exec gosu "$TARGET_USER" "$@" 