#!/usr/bin/env bash
set -euo pipefail

# ══════════════════════════════════════════════════════════════════
# Orkeon harness synchronisation for the devcontainer
# ══════════════════════════════════════════════════════════════════
# Keeps the workshop (default /workspace) in step with the harness shipped by the image:
#
#   image staging (/usr/local/share/claude-harness)     workshop ($ORKEON_WORKSHOP)
#   ─────────────────────────────────────────────────    ─────────────────────────────────
#   claude/CLAUDE.workshop.md                         →  CLAUDE.md                 (seed)
#   claude/gitignore.workshop                         →  .gitignore                (seed)
#   claude/settings.local.seed.json                   →  .claude/settings.local.json (seed)
#   claude/devcontainer.workshop.json                 →  .devcontainer/devcontainer.json (seed)
#   claude/settings-readme.workshop.md                →  settings/README.md        (seed)
#   claude/**                                         →  .claude/**                (managed)
#   references/**                                     →  references/**             (managed)
#   examples/**                                       →  library/examples/**       (managed)
#   evals/**                                          →  .claude/evals/**          (managed)
#   HARNESS.md, README.md, and the other top-level    →  .claude/harness/          (managed)
#     files (HARNESS.md is the entry point that the workshop's CLAUDE.md imports)
#   library/**                                        →  library/**                (seed)
#
# "managed": the image is authoritative. A file the image no longer ships is removed (its
# folder once empty); a file still identical to what was deployed is replaced; a file edited
# locally is first saved under .claude/harness-backup/<stamp>/. Anything the image never
# deployed (.claude/local/, references/local/, teams/, a skill's .env) is left alone.
# "seed": created when absent, never updated, never removed — the workshop owns it.
#
# The image carries a manifest of its harness (one "<sha256>  <path>" line per file); the
# workshop keeps the manifest of what was deployed last time. Costs one file read when
# nothing changed.
#
# Deploys only into a workshop: a folder it deployed into before (its manifest is there), a
# folder holding teams/ (Orkeon Studio's catalogue), or an empty one (dot-entries and OS
# litter aside). Anything else - a source project, the image's own repository - is left
# alone with a message; --adopt makes such a folder a workshop, once.
#
# Also retires the skills an older image deployed into /workspace/.claude (the pre-harness
# layout), using that workspace's own manifest or the legacy one - never in the workshop
# itself, where .claude/skills is the harness's.
#
# Called at container start by the entrypoint (docker run) and by postStartCommand
# (devcontainer). Works as root (re-executes itself as node) or as node.
#
# Usage:
#   sync-harness.sh [--dry-run] [--force] [--adopt]
#   sync-harness.sh --write-manifest <harness-dir> <manifest-file>
#
# Environment:
#   ORKEON_WORKSHOP   the workshop root (default /workspace)
#   HARNESS_SYNC=off  disable the synchronisation for this container
# ══════════════════════════════════════════════════════════════════

STAGING="${HARNESS_STAGING:-/usr/local/share/claude-harness}"
IMAGE_MANIFEST="${HARNESS_IMAGE_MANIFEST:-/usr/local/share/claude-harness.manifest}"
LEGACY_SKILLS_MANIFEST="${SKILLS_LEGACY_MANIFEST:-/usr/local/share/claude-skills.legacy-manifest}"
LEGACY_WORKSPACE="${HARNESS_LEGACY_WORKSPACE:-/workspace}"
TARGET_USER="node"
WORKSHOP="${ORKEON_WORKSHOP:-/workspace}"

STATE_DIR="$WORKSHOP/.claude"
MARKER="$STATE_DIR/.harness-initialized"
MANIFEST="$STATE_DIR/.harness-manifest"
BACKUP_ROOT="$STATE_DIR/harness-backup"

DRY_RUN=false
FORCE=false
ADOPT=false

# Hash of the content with CRs stripped: a CRLF checkout is not a local edit.
hash_file() { tr -d '\r' < "$1" | sha256sum | cut -d' ' -f1; }

# One "<sha256>  <relative path>" line per file. A skill's .env holds credentials:
# never shipped, never tracked.
write_manifest() {   # $1 = harness dir, $2 = output file
    local dir="$1" out="$2" rel
    ( cd "$dir" && find . -type f ! -name '.env' -printf '%P\n' | LC_ALL=C sort ) \
        | while IFS= read -r rel; do
            printf '%s  %s\n' "$(hash_file "$dir/$rel")" "$rel"
        done > "$out"
}

if [ "${1:-}" = "--write-manifest" ]; then
    [ $# -eq 3 ] || { echo "Usage: $(basename "$0") --write-manifest <harness-dir> <manifest-file>"; exit 1; }
    write_manifest "$2" "$3"
    echo "[harness] manifest written: $3 ($(wc -l < "$3") files)"
    exit 0
fi

while [[ $# -gt 0 ]]; do
    case "$1" in
        --dry-run) DRY_RUN=true; shift ;;
        --force)   FORCE=true; shift ;;
        --adopt)   ADOPT=true; shift ;;
        --help|-h)
            echo "Usage: $(basename "$0") [--dry-run] [--force] [--adopt]"
            echo ""
            echo "Synchronises the workshop ($WORKSHOP) with the harness shipped by the image."
            echo ""
            echo "Options:"
            echo "  --dry-run   Show what would change, change nothing"
            echo "  --force     Synchronise even when the image has not changed"
            echo "  --adopt     Deploy into a folder that is not a workshop yet (not empty, no teams/)"
            exit 0 ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

if [ "${HARNESS_SYNC:-}" = "off" ]; then
    echo "[harness] HARNESS_SYNC=off — synchronisation skipped"
    exit 0
fi

# The files belong to the workshop user: on a bind mount, root-created files stay root-owned.
if [ "$(id -u)" -eq 0 ] && id "$TARGET_USER" >/dev/null 2>&1 && command -v gosu >/dev/null 2>&1; then
    args=()
    [ "$DRY_RUN" = true ] && args+=(--dry-run)
    [ "$FORCE" = true ] && args+=(--force)
    [ "$ADOPT" = true ] && args+=(--adopt)
    exec gosu "$TARGET_USER" env ORKEON_WORKSHOP="$WORKSHOP" "$0" "${args[@]}"
fi

# ── Where a shipped file goes, and whether the image stays authoritative for it ──────────
# Prints "<policy> <absolute target>" for a staging-relative path; policy is managed | seed.
target_of() {   # $1 = staging-relative path
    local rel="$1"
    case "$rel" in
        claude/CLAUDE.workshop.md)        printf 'seed %s\n'    "$WORKSHOP/CLAUDE.md" ;;
        claude/gitignore.workshop)        printf 'seed %s\n'    "$WORKSHOP/.gitignore" ;;
        claude/settings.local.seed.json)  printf 'seed %s\n'    "$WORKSHOP/.claude/settings.local.json" ;;
        claude/devcontainer.workshop.json) printf 'seed %s\n'   "$WORKSHOP/.devcontainer/devcontainer.json" ;;
        claude/settings-readme.workshop.md) printf 'seed %s\n'  "$WORKSHOP/settings/README.md" ;;
        claude/*)                       printf 'managed %s\n' "$WORKSHOP/.claude/${rel#claude/}" ;;
        references/*)                     printf 'managed %s\n' "$WORKSHOP/references/${rel#references/}" ;;
        examples/*)                       printf 'managed %s\n' "$WORKSHOP/library/examples/${rel#examples/}" ;;
        evals/*)                          printf 'managed %s\n' "$WORKSHOP/.claude/evals/${rel#evals/}" ;;
        library/*)                        printf 'seed %s\n'    "$WORKSHOP/library/${rel#library/}" ;;
        *)                                printf 'managed %s\n' "$WORKSHOP/.claude/harness/$rel" ;;
    esac
}

# Removes the now-empty parents of a file, stopping at the workshop root.
prune_dirs() {   # $1 = absolute file path just removed
    local dir
    dir="$(dirname "$1")"
    while [ "$dir" != "$WORKSHOP" ] && [ "${dir#"$WORKSHOP"/}" != "$dir" ] && rmdir "$dir" 2>/dev/null; do
        dir="$(dirname "$dir")"
    done
}

# ── Retire the skills an older image deployed into /workspace/.claude/skills ─────────────
# The pre-harness images synchronised their skills into <workspace>/.claude/skills; those
# files would otherwise linger (and load) next to the workshop. Only files the old manifest
# knows are touched; a locally edited one is saved first.
retire_legacy_workspace_skills() {
    local ws="$LEGACY_WORKSPACE" old_dir old_manifest old_marker rel stamp removed=0 saved=0
    old_dir="$ws/.claude/skills"
    old_manifest="$ws/.claude/.skills-manifest"
    old_marker="$ws/.claude/.skills-initialized"
    [ -d "$old_dir" ] || return 0
    if [ -f "$old_manifest" ]; then :; elif [ -f "$LEGACY_SKILLS_MANIFEST" ]; then old_manifest="$LEGACY_SKILLS_MANIFEST"; else return 0; fi
    [ -w "$ws/.claude" ] || { echo "[harness] legacy skills in $old_dir: not writable, left in place"; return 0; }
    stamp="$(date +%Y%m%d-%H%M%S)"
    while IFS= read -r line || [ -n "$line" ]; do
        line="${line%$'\r'}"
        [ -n "$line" ] || continue
        rel="${line#*  }"
        [ -f "$old_dir/$rel" ] || continue
        if [ "$(hash_file "$old_dir/$rel")" != "${line%%  *}" ]; then
            saved=$((saved + 1))
            echo "[harness] legacy skill edited locally, saved to .claude/skills-backup/$stamp/$rel"
            if [ "$DRY_RUN" != true ]; then
                mkdir -p "$(dirname "$ws/.claude/skills-backup/$stamp/$rel")"
                cp -p "$old_dir/$rel" "$ws/.claude/skills-backup/$stamp/$rel"
            fi
        fi
        removed=$((removed + 1))
        if [ "$DRY_RUN" != true ]; then
            rm -f "$old_dir/$rel"
            local dir; dir="$(dirname "$old_dir/$rel")"
            while [ "$dir" != "$old_dir" ] && rmdir "$dir" 2>/dev/null; do dir="$(dirname "$dir")"; done
        fi
    done < "$old_manifest"
    if [ "$DRY_RUN" != true ]; then
        rmdir "$old_dir" 2>/dev/null || true
        rm -f "$ws/.claude/.skills-manifest" "$old_marker"
        find "$old_dir" -mindepth 1 -type d -empty -delete 2>/dev/null || true
    fi
    if [ "$removed" -gt 0 ]; then
        local now="the harness now lives in $WORKSHOP"
        [ "$WORKSHOP_OK" = true ] || now="the harness now deploys only into an Orkeon workshop"
        echo "[harness] retired $removed legacy skill file(s) from $old_dir ($saved saved) — $now"
    fi
    return 0
}

if [ ! -d "$STAGING" ] || [ -z "$(ls -A "$STAGING" 2>/dev/null)" ]; then
    echo "[harness] no harness shipped by the image ($STAGING)"
    exit 0
fi

# ── Is the target a workshop? ─────────────────────────────────────────────────────────────
# What the user mounts on /workspace may be anything. The harness goes only where it went
# before, where Studio keeps its teams, or into an empty folder.
visible_entries() {   # $1 = folder: its entries, less dot-entries and OS litter
    local entry
    for entry in "$1"/*; do
        [ -e "$entry" ] || continue
        case "${entry##*/}" in desktop.ini|Thumbs.db|lost+found) continue ;; esac
        printf '%s\n' "${entry##*/}"
    done
}
is_workshop() {
    [ -f "$MANIFEST" ] || [ -f "$MARKER" ] || [ -d "$WORKSHOP/teams" ] || [ -z "$(visible_entries "$WORKSHOP")" ]
}
same_folder() {   # $1, $2: the same directory once resolved
    [ "$(cd "$1" 2>/dev/null && pwd -P)" = "$(cd "$2" 2>/dev/null && pwd -P)" ]
}
WORKSHOP_OK=false
if is_workshop || [ "$ADOPT" = true ]; then WORKSHOP_OK=true; fi

TMP_MANIFEST=""
trap '[ -n "$TMP_MANIFEST" ] && rm -f "$TMP_MANIFEST"' EXIT
if [ ! -f "$IMAGE_MANIFEST" ]; then
    TMP_MANIFEST="$(mktemp)"
    write_manifest "$STAGING" "$TMP_MANIFEST"
    IMAGE_MANIFEST="$TMP_MANIFEST"
fi
STAMP="$(sha256sum < "$IMAGE_MANIFEST" | cut -c1-16)"

# The skills of the pre-harness images: retired from /workspace when it is not the workshop -
# in the workshop, .claude/skills holds the harness's own skills.
if ! same_folder "$LEGACY_WORKSPACE" "$WORKSHOP" || [ "$WORKSHOP_OK" != true ]; then
    retire_legacy_workspace_skills
fi

if [ "$WORKSHOP_OK" != true ]; then
    echo "[harness] $WORKSHOP is not an Orkeon workshop (no harness deployed there before, no teams/, and it holds: $(visible_entries "$WORKSHOP" | head -n 5 | paste -sd ' ' -)). Nothing deployed."
    echo "[harness] Mount your Orkeon folder on $WORKSHOP, set ORKEON_WORKSHOP to it, or run 'sync-harness.sh --adopt' once to make this folder a workshop."
    exit 0
fi

# The workshop skeleton exists even when nothing has to be synchronised: Studio lists teams/,
# the workbooks, the tests and the settings of the teams sit next to it (D29, D33), and the
# skills expect archive/ and library/.
if [ "$DRY_RUN" != true ]; then
    mkdir -p "$WORKSHOP/teams" "$WORKSHOP/workbooks" "$WORKSHOP/tests" "$WORKSHOP/settings" "$WORKSHOP/archive" "$WORKSHOP/library" "$WORKSHOP/references" "$STATE_DIR"
fi

# A settings file Orkeon would find on its own above the teams replaces the machine's settings
# for every run that names none - Orkeon Studio names none unless an Expert pins one (review of
# 2026-10-02). Said at every start; a team's own settings live in settings/<slug>/appsettings.json (D33).
for stray in "$WORKSHOP/appsettings/appsettings.json" "$WORKSHOP/_shared/appsettings.json" \
             "$WORKSHOP/teams/appsettings/appsettings.json" "$WORKSHOP/teams/_shared/appsettings.json"; do
    if [ -f "$stray" ]; then
        echo "[harness] WARNING: $stray replaces the machine's Orkeon settings for every run that names no settings file (Orkeon Studio names none unless an Expert pins one): remove it (a team's own settings live in settings/<slug>/appsettings.json)."
    fi
done

if [ "$FORCE" != true ] && [ -f "$MARKER" ] && [ "$(tr -d '\r\n' < "$MARKER")" = "$STAMP" ]; then
    echo "[harness] up to date ($WORKSHOP)"
    exit 0
fi

declare -A PREV=() NEW=()
load_manifest() {   # $1 = file, $2 = associative array name
    local -n map="$2"
    local line
    while IFS= read -r line || [ -n "$line" ]; do
        line="${line%$'\r'}"
        [ -n "$line" ] || continue
        map["${line#*  }"]="${line%%  *}"
    done < "$1"
}

load_manifest "$IMAGE_MANIFEST" NEW
ORIGIN="first deployment"
if [ -f "$MANIFEST" ]; then
    load_manifest "$MANIFEST" PREV
    ORIGIN="image update"
fi

ADDED=0; UPDATED=0; REMOVED=0; SEEDED=0; BACKED_UP=0
declare -A GONE=()   # lower-cased targets removed in this run (see the dry-run note below)

backup() {   # $1 = staging-relative path, $2 = absolute target
    BACKED_UP=$((BACKED_UP + 1))
    echo "[harness] edited locally, saved to .claude/harness-backup/$STAMP/$1"
    if [ "$DRY_RUN" != true ]; then
        mkdir -p "$(dirname "$BACKUP_ROOT/$STAMP/$1")"
        cp -p "$2" "$BACKUP_ROOT/$STAMP/$1"
    fi
}

# Removals first: on a case-insensitive mount, skill.md -> SKILL.md is a removal followed
# by a copy; the other way round would delete the file that was just written.
while IFS= read -r rel; do
    [ -n "$rel" ] || continue
    [ -z "${NEW[$rel]+x}" ] || continue
    read -r policy target < <(target_of "$rel")
    [ "$policy" = managed ] || continue
    [ -f "$target" ] || continue
    if [ "$(hash_file "$target")" != "${PREV[$rel]}" ]; then
        backup "$rel" "$target"
    fi
    REMOVED=$((REMOVED + 1))
    GONE["${target,,}"]=1
    echo "[harness] removed  $rel"
    if [ "$DRY_RUN" != true ]; then
        rm -f "$target"
        prune_dirs "$target"
    fi
done < <(printf '%s\n' "${!PREV[@]}" | LC_ALL=C sort)

while IFS= read -r rel; do
    [ -n "$rel" ] || continue
    read -r policy target < <(target_of "$rel")
    if [ "$policy" = seed ]; then
        [ -e "$target" ] && continue
        SEEDED=$((SEEDED + 1))
        echo "[harness] seeded   $rel → ${target#"$WORKSHOP"/}"
        if [ "$DRY_RUN" != true ]; then
            mkdir -p "$(dirname "$target")"
            cp -p "$STAGING/$rel" "$target"
        fi
        continue
    fi
    # In a dry run nothing was removed: on a case-insensitive mount the file "SKILL.md" would
    # still resolve to the "skill.md" reported as removed above, so count it as absent.
    if [ -f "$target" ] && ! { [ "$DRY_RUN" = true ] && [ -n "${GONE[${target,,}]+x}" ]; }; then
        current="$(hash_file "$target")"
        [ "$current" != "${NEW[$rel]}" ] || continue
        if [ -z "${PREV[$rel]+x}" ] || [ "$current" != "${PREV[$rel]}" ]; then
            backup "$rel" "$target"
        fi
        UPDATED=$((UPDATED + 1))
        echo "[harness] updated  $rel"
    else
        ADDED=$((ADDED + 1))
        # A first deployment adds every file: the summary line says enough.
        if [ "$ORIGIN" != "first deployment" ] || [ "$DRY_RUN" = true ]; then
            echo "[harness] added    $rel"
        fi
    fi
    if [ "$DRY_RUN" != true ]; then
        mkdir -p "$(dirname "$target")"
        cp -p "$STAGING/$rel" "$target"
    fi
done < <(printf '%s\n' "${!NEW[@]}" | LC_ALL=C sort)

SUMMARY="$ADDED added, $UPDATED updated, $REMOVED removed, $SEEDED seeded, $BACKED_UP saved ($ORIGIN)"
if [ "$DRY_RUN" = true ]; then
    echo "[harness] dry run: $SUMMARY"
    exit 0
fi

# Manifest and marker last: an interrupted run is simply done again at the next start.
mkdir -p "$STATE_DIR"
cp "$IMAGE_MANIFEST" "$MANIFEST.tmp"
mv "$MANIFEST.tmp" "$MANIFEST"
printf '%s\n' "$STAMP" > "$MARKER"
echo "[harness] synchronised into $WORKSHOP: $SUMMARY"
