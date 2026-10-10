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
#   claude/gitattributes.workshop                     →  .gitattributes            (seed)
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
# locally is first saved under .claude/harness-backup/<stamp>/; a file that differs only by
# its line endings (a checkout that converted them to CRLF) is put back as shipped, with no
# backup. Anything the image never deployed (.claude/local/, references/local/, teams/, a
# skill's .env) is left alone.
# "seed": created when absent, never updated, never removed — the workshop owns it.
#
# The image carries a manifest of its harness (one "<sha256>  <path>" line per file); the
# workshop keeps the manifest of what was deployed last time. Costs one file read when
# nothing changed, and the walk below.
#
# At every start the scripts of .claude - every *.sh and *.py there: hooks, modules, the scripts
# of the skills and of the evals - are put in LF and made executable, as the image does to its
# own harness when it is built: a clone made by a Git that converts line endings leaves hooks
# that bash refuses, and one that loses the executable bit leaves scripts that cannot be started
# by their name (D44). .claude alone, to keep a start short: the rest of the workshop is not
# walked - nor .claude/local, which is the workshop's, nor the worktrees Claude Code keeps there.
#
# Deploys only into a workshop: a folder it deployed into before (its manifest is there), a
# folder holding teams/ (Orkeon Studio's catalogue), or an empty one (dot-entries and OS
# litter aside). Anything else - a source project, the image's own repository - is left
# alone with a message; --adopt makes such a folder a workshop, once.
#
# Profiles (lot 11, docs/profiles-design.md § 6, D48-D51): the harness is a set of packs
# (profiles/packs/*.yaml) and a space deploys those of its profile that fit it - the profile of
# .claude/local/profile, else HARNESS_PROFILE, else user (core and workshop: every file outside
# packs/, the harness as it was before lot 11). claude/skills/workshop-profile/scripts/
# workshop-profile.py --resolve names the space and the packs and filters the image manifest; the
# workshop's manifest is that filtered one, so a file a new profile leaves out is removed as a file
# the image no longer ships. Without profiles/ in the staging, everything is deployed, as before.
# A packs/<pack>/claude/* file lands in .claude/*, any other packs/<pack>/* in .claude/harness/packs/<pack>/.
#   workshop  as above;
#   source    the top of a git work tree that is not a workshop, with a profile that fits it
#             (dev, release, docs, contrib, all, custom): recorded in .claude/.harness-space. No
#             seed, no workshop skeleton; a deployment that would write or remove one file git
#             tracks, or write through a folder that is a symbolic link, is refused whole (exit 2);
#             the deployed files, .claude/local/, .claude/.harness-*, .claude/settings.local.json
#             and todo/ are listed in a block of .git/info/exclude, one block per worktree (the
#             linked worktrees of a repository share that file), rewritten at every start, so that
#             git status stays clean;
#   unknown   anything else: nothing deployed, as before.
# HARNESS_PROFILE, when .claude/local/profile does not exist yet, is applied first by the switcher
# (workshop-profile.py <profile> --no-sync): it writes the profile file and the pack switches.
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
#   HARNESS_PROFILE   the first profile of a space that has none (default: user)
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
SPACE_FILE="$STATE_DIR/.harness-space"
PROFILE_TOOL="$STAGING/claude/skills/workshop-profile/scripts/workshop-profile.py"
EXCLUDE_BEGIN="# >>> orkeon-workshop harness"
EXCLUDE_END="# <<< orkeon-workshop harness"

DRY_RUN=false
FORCE=false
ADOPT=false

# Hash of the content with CRs stripped: a CRLF checkout is not a local edit. It is not left
# as it is either - see the copy loop, which puts such a file back as shipped.
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
# workshop-profile.py (target_of) maps the same way, to check a source space's targets.
target_of() {   # $1 = staging-relative path
    local rel="$1" pack
    case "$rel" in
        packs/*/claude/*)
            pack="${rel#packs/}"; pack="${pack%%/*}"
            printf 'managed %s\n' "$WORKSHOP/.claude/${rel#packs/"$pack"/claude/}" ;;
        packs/*/*)
            pack="${rel#packs/}"; pack="${pack%%/*}"
            printf 'managed %s\n' "$WORKSHOP/.claude/harness/packs/$pack/${rel#packs/"$pack"/}" ;;
        claude/CLAUDE.workshop.md)        printf 'seed %s\n'    "$WORKSHOP/CLAUDE.md" ;;
        claude/gitignore.workshop)        printf 'seed %s\n'    "$WORKSHOP/.gitignore" ;;
        claude/gitattributes.workshop)    printf 'seed %s\n'    "$WORKSHOP/.gitattributes" ;;
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

# Puts a shipped file in its place: written beside the target, then renamed over it. A hook is
# never seen half written; and a file the workshop user does not own - a clone made from the
# Windows host shows as root's in the container - is replaced all the same, where cp -p onto
# it fails once the content is written, for want of the right to set its times.
deploy() {   # $1 = staging-relative path, $2 = absolute target
    local tmp="$2.$$.tmp"
    mkdir -p "$(dirname "$2")"
    if cp -p "$STAGING/$1" "$tmp" && mv -f "$tmp" "$2"; then return 0; fi
    rm -f "$tmp"
    echo "[harness] ERROR: cannot write $2"
    return 1
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
# The space sync-harness.sh recorded: a source space keeps its manifest and marker, and must not
# pass for a workshop at the next start.
recorded_space() {
    local space=""
    if [ -f "$SPACE_FILE" ] && [ ! -L "$SPACE_FILE" ]; then IFS= read -r space < "$SPACE_FILE" || true; fi
    printf '%s' "${space//[$' \t\r']/}"
}
is_workshop() {
    [ "$(recorded_space)" != source ] || return 1
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

# ── The space and its profile: which files of the image this folder receives ─────────────────
SPACE=unknown
[ "$WORKSHOP_OK" != true ] || SPACE=workshop
PROFILE=""
PACKS=""
REFUSED=""
DEPLOY_MANIFEST="$IMAGE_MANIFEST"
profile_tool() { env ORKEON_WORKSHOP="$WORKSHOP" HARNESS_STAGING="$STAGING" python3 "$PROFILE_TOOL" "$@"; }
if [ -d "$STAGING/profiles" ] && [ -f "$PROFILE_TOOL" ]; then
    FILTERED="$(mktemp)"
    trap '[ -n "$TMP_MANIFEST" ] && rm -f "$TMP_MANIFEST"; rm -f "$FILTERED"' EXIT
    # A first profile from the container: written by the switcher, as /workshop-profile would.
    if [ -n "${HARNESS_PROFILE:-}" ] && [ "$HARNESS_PROFILE" != user ] && [ ! -e "$STATE_DIR/local/profile" ] \
       && [ ! -L "$STATE_DIR/local/profile" ] && [ "$DRY_RUN" != true ]; then
        profile_tool --no-sync "$HARNESS_PROFILE" 2>&1 | sed 's/^/[harness] /' || true
    fi
    resolve_args=(--resolve --manifest "$IMAGE_MANIFEST" "$FILTERED")
    # Adopted, or not created yet (an empty workshop to be): a workshop, as is_workshop says.
    if [ "$ADOPT" = true ] || [ ! -d "$WORKSHOP" ]; then resolve_args+=(--space workshop); fi
    if resolved="$(profile_tool "${resolve_args[@]}" 2>&1)"; then rc=0; else rc=$?; fi
    while IFS= read -r line; do
        case "$line" in
            "space "*)   SPACE="${line#space }" ;;
            "profile "*) PROFILE="${line#profile }" ;;
            "packs "*)   PACKS="${line#packs }" ;;
            "note "*)    echo "[harness] profile: ${line#note }" ;;
            "refused "*) REFUSED="${line#refused }" ;;
        esac
    done <<< "$resolved"
    if [ "$rc" -eq 0 ]; then
        DEPLOY_MANIFEST="$FILTERED"
    elif [ "$rc" -eq 2 ]; then
        SPACE=unknown
    else
        # The switcher cannot run (no python3, no PyYAML, broken definitions). A workshop whose
        # profile is user still gets its harness: every file outside packs/.
        current="$(head -c 200 "$STATE_DIR/local/profile" 2>/dev/null | head -n 1 | tr -d ' \t\r')" || current=""
        echo "[harness] WARNING: the profiles cannot be resolved: $(printf '%s\n' "$resolved" | tail -n 1)"
        if [ "$WORKSHOP_OK" = true ] && [ "${current:-${HARNESS_PROFILE:-user}}" = user ]; then
            grep -v '^[0-9a-f]*  packs/' "$IMAGE_MANIFEST" > "$FILTERED" || true
            DEPLOY_MANIFEST="$FILTERED"; SPACE=workshop; PROFILE=user; PACKS="core workshop"
        else
            echo "[harness] Nothing deployed: the profile of $WORKSHOP is not user."
            exit 0
        fi
    fi
fi
STAMP="$(sha256sum < "$IMAGE_MANIFEST" | cut -c1-16)"
if [ -n "$PROFILE" ]; then
    STAMP="$( { cat "$DEPLOY_MANIFEST"; printf '%s %s %s\n' "$SPACE" "$PROFILE" "$PACKS"; } | sha256sum | cut -c1-16)"
fi

# The skills of the pre-harness images: retired from /workspace when it is not the workshop -
# in the workshop (or a source space), .claude/skills holds the harness's own skills.
if ! same_folder "$LEGACY_WORKSPACE" "$WORKSHOP" || [ "$SPACE" = unknown ]; then
    retire_legacy_workspace_skills
fi

if [ "$SPACE" = unknown ]; then
    echo "[harness] $WORKSHOP is not an Orkeon workshop (no harness deployed there before, no teams/, and it holds: $(visible_entries "$WORKSHOP" | head -n 5 | paste -sd ' ' -)). Nothing deployed."
    echo "[harness] Mount your Orkeon folder on $WORKSHOP, set ORKEON_WORKSHOP to it, or run 'sync-harness.sh --adopt' once to make this folder a workshop."
    [ -z "$REFUSED" ] || echo "[harness] profile: $REFUSED"
    echo "[harness] A git checkout gets the harness of a source profile: HARNESS_PROFILE=dev (or release, docs, contrib) at container start, or 'workshop-profile dev' in a terminal."
    exit 0
fi

# ── A source space: nothing tracked is written, git status stays clean (D51) ─────────────────
# The targets of the files of a manifest, relative to the checkout, one per line.
source_targets() {   # $1 = manifest
    local line rel policy target
    while IFS= read -r line || [ -n "$line" ]; do
        rel="${line#*  }"
        [ -n "$rel" ] || continue
        read -r policy target < <(target_of "$rel")
        [ "$policy" != managed ] || printf '%s\n' "${target#"$WORKSHOP"/}"
    done < "$1"
}
# The first folder between the checkout and a target that is a symbolic link. git does not look
# through a link (git ls-files -- .claude/x finds nothing under a tracked .claude -> cfg) and mkdir,
# cp and rm follow it: into tracked files, or out of the checkout (~/.claude). With no link on the
# way, a target cannot leave the checkout.
linked_parent() {   # $@ = paths relative to the checkout
    local rel dir
    local -A seen=()
    for rel in "$@"; do
        dir="$rel"
        while [ "${dir%/*}" != "$dir" ]; do
            dir="${dir%/*}"
            [ -z "${seen[$dir]+x}" ] || break
            seen[$dir]=1
            if [ -L "$WORKSHOP/$dir" ]; then printf '%s\n' "$dir"; return 0; fi
        done
    done
    return 1
}
if [ "$SPACE" = source ]; then
    mapfile -t TARGETS < <(source_targets "$DEPLOY_MANIFEST")
    # What was deployed last time is checked too: the removal loop below deletes what this
    # deployment leaves out, and a file git tracks now is not the harness's to delete.
    PREV_TARGETS=()
    [ ! -f "$MANIFEST" ] || mapfile -t PREV_TARGETS < <(source_targets "$MANIFEST")
    STATE_TARGETS=(.claude/local/profile .claude/local/profile.owned.json .claude/settings.local.json .claude/.harness-space
                   .claude/.harness-manifest .claude/.harness-initialized)
    if LINKED="$(linked_parent "${TARGETS[@]}" "${PREV_TARGETS[@]}" "${STATE_TARGETS[@]}")"; then
        echo "[harness] $LINKED is a symbolic link in $WORKSHOP: git does not see the files behind it and a write would follow it - the harness never writes through a link. Nothing deployed."
        exit 2
    fi
    TRACKED="$(GIT_LITERAL_PATHSPECS=1 git -C "$WORKSHOP" -c core.quotepath=off ls-files --cached -- "${TARGETS[@]}" \
        "${PREV_TARGETS[@]}" "${STATE_TARGETS[@]}" | LC_ALL=C sort -u)" || TRACKED="(git ls-files failed)"
    if [ -n "$TRACKED" ]; then
        echo "[harness] $(printf '%s\n' "$TRACKED" | head -n 1) is tracked by git in $WORKSHOP ($(printf '%s\n' "$TRACKED" | wc -l) tracked target(s)): the harness never writes a tracked file. Nothing deployed."
        exit 2
    fi
    if [ "$DRY_RUN" != true ]; then
        mkdir -p "$STATE_DIR"
        printf 'source\n' > "$SPACE_FILE"
        EXCLUDE="$(git -C "$WORKSHOP" rev-parse --git-path info/exclude)"
        case "$EXCLUDE" in /*) ;; *) EXCLUDE="$WORKSHOP/$EXCLUDE" ;; esac
        # The linked worktrees of a repository share info/exclude: a block per worktree, keyed by its
        # top level; this one's is rewritten, the others' kept (a block without a key, as written
        # before, is dropped: the worktree that owns it writes its own at its next start).
        TOP="$(git -C "$WORKSHOP" rev-parse --show-toplevel)"
        mkdir -p "$(dirname "$EXCLUDE")"
        {
            [ ! -f "$EXCLUDE" ] || B="$EXCLUDE_BEGIN" E="$EXCLUDE_END" T="$TOP" awk '
                $0 == ENVIRON["B"] || $0 == ENVIRON["B"] " " ENVIRON["T"] { skip = 1; next }
                skip && ($0 == ENVIRON["E"] || $0 == ENVIRON["E"] " " ENVIRON["T"]) { skip = 0; next }
                !skip' "$EXCLUDE"
            echo "$EXCLUDE_BEGIN $TOP"
            echo "# Written by sync-harness.sh at every start: the harness deployed in this checkout (D51)."
            printf '/%s\n' .claude/local/ '.claude/.harness-*' .claude/settings.local.json .claude/harness-backup/ .claude/evals/.fixtures/ todo/
            printf '%s\n' "${TARGETS[@]}" | LC_ALL=C sort | sed -e 's/[][*?\\]/\\&/g' -e 's|^|/|'
            echo "$EXCLUDE_END $TOP"
        } > "$EXCLUDE.tmp"
        mv -f "$EXCLUDE.tmp" "$EXCLUDE"
    fi
fi

# The workshop skeleton exists even when nothing has to be synchronised: Studio lists teams/,
# the workbooks, the tests and the settings of the teams sit next to it (D29, D33), and the
# skills expect archive/ and library/.
if [ "$DRY_RUN" != true ] && [ "$SPACE" = workshop ]; then
    mkdir -p "$WORKSHOP/teams" "$WORKSHOP/workbooks" "$WORKSHOP/tests" "$WORKSHOP/settings" "$WORKSHOP/archive" "$WORKSHOP/library" "$WORKSHOP/references" "$STATE_DIR"
fi

# A settings file Orkeon would find on its own above the teams replaces the machine's settings
# for every run that names none - Orkeon Studio names none for a team without a settings file of its own, unless an Expert pins one (review of
# 2026-10-02). Said at every start; a team's own settings live in settings/<slug>/appsettings.json (D33).
[ "$SPACE" != workshop ] || for stray in "$WORKSHOP/appsettings/appsettings.json" "$WORKSHOP/_shared/appsettings.json" \
             "$WORKSHOP/teams/appsettings/appsettings.json" "$WORKSHOP/teams/_shared/appsettings.json"; do
    if [ -f "$stray" ]; then
        echo "[harness] WARNING: $stray replaces the machine's Orkeon settings for every run that names no settings file (Orkeon Studio names none for a team without a settings file of its own, unless an Expert pins one): remove it (a team's own settings live in settings/<slug>/appsettings.json)."
    fi
done

# Lines that end with a CR: the workshop was checked out by a Git that converts line endings (Git
# for Windows, by default), and the container runs no script in CRLF.
has_crlf() { [ -f "$1" ] && LC_ALL=C grep -qsa $'\r$' "$1"; }
first_in_crlf() {   # $@ = files: prints the first one in CRLF
    local file
    for file in "$@"; do
        if has_crlf "$file"; then printf '%s\n' "$file"; return 0; fi
    done
    return 1
}

# Read before the scripts are put right below. A converting Git converts the hooks with the rest:
# one of them in CRLF sends this start through the comparison even though the image has not
# changed, which puts back the harness's other files. The marker goes first: were the comparison
# to stop half-way, the hooks would be in LF by then and the next start would see nothing to do.
HOOKS_IN_CRLF=false
if first_in_crlf "$STATE_DIR"/hooks/*.sh >/dev/null; then
    HOOKS_IN_CRLF=true
    [ "$DRY_RUN" = true ] || rm -f "$MARKER"
fi

# The scripts of .claude in LF and executable (D44): .claude alone, a few dozen files, so that a
# start stays short whatever the workshop holds. sed -i writes beside the file and renames: it
# also works on a file of another user, which is what a clone made from the Windows host is in
# the container. A script is executable when its mode says so - on a mount that runs nothing,
# test -x would say no for ever.
normalise_scripts() {
    local record mode file did bad failed=0 first_failed="" note=""
    [ -d "$STATE_DIR" ] || return 0
    [ "$DRY_RUN" != true ] || note=" (dry run)"
    while IFS= read -r -d '' record; do
        mode="${record##*$'\t'}"; file="${record%$'\t'*}"; did=""; bad=false
        if has_crlf "$STATE_DIR/$file"; then
            if [ "$DRY_RUN" = true ] || sed -i 's/\r*$//' "$STATE_DIR/$file" 2>/dev/null; then did="LF"; else bad=true; fi
        fi
        if (( (8#$mode & 8#111) == 0 )); then
            if [ "$DRY_RUN" = true ] || chmod a+x "$STATE_DIR/$file" 2>/dev/null; then did="${did:+$did, }+x"; else bad=true; fi
        fi
        if [ "$bad" = true ]; then
            failed=$((failed + 1)); [ -n "$first_failed" ] || first_failed=".claude/$file"
        fi
        [ -z "$did" ] || echo "[harness] script   .claude/$file: $did$note"
    done < <(cd "$STATE_DIR" 2>/dev/null && find . \( -path ./local -o -path ./worktrees -o -path ./harness-backup \
                 -o -name .fixtures -o -name node_modules \) -prune \
                 -o -type f \( -name '*.sh' -o -name '*.py' \) -printf '%P\t%m\0' 2>/dev/null | LC_ALL=C sort -z)
    if [ "$failed" -gt 0 ]; then
        echo "[harness] WARNING: $failed script(s) of .claude could not be put in LF or made executable - $first_failed first: the workshop user ($(id -un)) may not change these files."
    fi
    return 0
}
# A source space: the harness's files are copied as the image holds them, in LF and executable,
# and the checkout's own .claude files are not the harness's to change.
[ "$SPACE" = source ] || normalise_scripts

# The workshop's own files are not rewritten, nor walked: a team's launcher and its status file -
# what a team in progress always has - stand for the rest, and the first one found in CRLF is
# said at every start, since the workshop's .gitattributes makes git store such a file as it is.
if [ "$SPACE" = workshop ] && CRLF_SIGN="$(first_in_crlf "$WORKSHOP"/teams/*/run.sh "$WORKSHOP"/workbooks/*/STATUS.md)"; then
    echo "[harness] WARNING: $CRLF_SIGN has Windows line endings (CRLF), as after a checkout by a Git that converts them. The container puts the harness (.claude) back by itself; the workshop's own files - launchers, documents, data - are left as they are, and git stores them as they are (.gitattributes): put them back before the next commit - 'A workshop checked out in CRLF', in the troubleshooting page of the Orkeon Workshop documentation, says how ('orkeon-bench scaffold <team>' writes a team's launchers again)."
fi

if [ "$FORCE" != true ] && [ "$HOOKS_IN_CRLF" != true ] && [ -f "$MARKER" ] && [ "$(tr -d '\r\n' < "$MARKER")" = "$STAMP" ]; then
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

load_manifest "$DEPLOY_MANIFEST" NEW
ORIGIN="first deployment"
if [ -f "$MANIFEST" ]; then
    load_manifest "$MANIFEST" PREV
    ORIGIN="image update"
fi

ADDED=0; UPDATED=0; REMOVED=0; SEEDED=0; BACKED_UP=0; RESTORED=0
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
        [ "$SPACE" = workshop ] || continue
        [ -e "$target" ] && continue
        SEEDED=$((SEEDED + 1))
        echo "[harness] seeded   $rel → ${target#"$WORKSHOP"/}"
        if [ "$DRY_RUN" != true ]; then
            deploy "$rel" "$target"
        fi
        continue
    fi
    # In a dry run nothing was removed: on a case-insensitive mount the file "SKILL.md" would
    # still resolve to the "skill.md" reported as removed above, so count it as absent.
    if [ -f "$target" ] && ! { [ "$DRY_RUN" = true ] && [ -n "${GONE[${target,,}]+x}" ]; }; then
        current="$(hash_file "$target")"
        if [ "$current" = "${NEW[$rel]}" ]; then
            # The same content. When the bytes differ all the same, only the line endings do: a
            # checkout converted them, and bash refuses a hook whose lines end with a CR. Put back
            # as shipped, with no backup - nothing was edited.
            cmp -s "$STAGING/$rel" "$target" && continue
            RESTORED=$((RESTORED + 1))
        else
            if [ -z "${PREV[$rel]+x}" ] || [ "$current" != "${PREV[$rel]}" ]; then
                backup "$rel" "$target"
            fi
            UPDATED=$((UPDATED + 1))
            echo "[harness] updated  $rel"
        fi
    else
        ADDED=$((ADDED + 1))
        # A first deployment adds every file: the summary line says enough.
        if [ "$ORIGIN" != "first deployment" ] || [ "$DRY_RUN" = true ]; then
            echo "[harness] added    $rel"
        fi
    fi
    if [ "$DRY_RUN" != true ]; then
        deploy "$rel" "$target"
    fi
done < <(printf '%s\n' "${!NEW[@]}" | LC_ALL=C sort)

if [ "$RESTORED" -gt 0 ]; then
    put_back="are put back as shipped"
    [ "$DRY_RUN" != true ] || put_back="would be put back as shipped"
    echo "[harness] line endings: $RESTORED file(s) of the harness differed from the image's by their line endings only (a checkout that converted them) and $put_back"
fi
SUMMARY="$ADDED added, $UPDATED updated, $REMOVED removed, $SEEDED seeded, $BACKED_UP saved ($ORIGIN)"
if [ "$DRY_RUN" = true ]; then
    echo "[harness] dry run: $SUMMARY"
    exit 0
fi

# Manifest and marker last: an interrupted run is simply done again at the next start.
mkdir -p "$STATE_DIR"
cp "$DEPLOY_MANIFEST" "$MANIFEST.tmp"
mv "$MANIFEST.tmp" "$MANIFEST"
printf '%s\n' "$STAMP" > "$MARKER"
PROFILE_SAID=""
[ -z "$PROFILE" ] || { [ "$PROFILE" = user ] && [ "$SPACE" = workshop ]; } || PROFILE_SAID=" - profile $PROFILE in a $SPACE space ($PACKS)"
echo "[harness] synchronised into $WORKSHOP: $SUMMARY$PROFILE_SAID"
