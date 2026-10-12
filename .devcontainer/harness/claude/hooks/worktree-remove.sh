#!/bin/bash
# WorktreeRemove hook - the removal of a worktree the WorktreeCreate hook created (D70, lot 14).
#
# Claude Code fires it when a worktree session exits and the worktree is to be removed, and when a
# background session that ran in the worktree is deleted; it passes `worktree_path`. Exit 0 counts
# as removed (Claude Code reads nothing else, and never deletes the branch of a hook-created
# worktree); a non-zero exit with the folder still there keeps the worktree on disk, with no git
# fallback. claude/scripts/worktree-create.sh --remove does the work: refused, the folder kept, when
# the worktree has changed or untracked files (the shared links aside), commits no other branch
# holds, or a lock; else the links go, then `git worktree remove`, then `git branch -d`.
#
# Core pack, no switch (see worktree-create.sh). Inert, empty, `{}` or not JSON: exit 0, no output.
set -uo pipefail

input=$(cat)
[ -n "$input" ] || exit 0
command -v jq >/dev/null 2>&1 || exit 0

PARSED=$(printf '%s' "$input" | jq -j 'if type == "object" then
    [(.hook_event_name // ""), (.worktree_path // "" | tostring)] | join("\u001f")
  else "" end' 2>/dev/null) || exit 0
[ -n "$PARSED" ] || exit 0
IFS=$'\x1f' read -r event path <<<"$PARSED"
[ "$event" = "WorktreeRemove" ] || exit 0
[ -n "$path" ] || exit 0

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
script="$HERE/../scripts/worktree-create.sh"
[ -f "$script" ] || { echo "worktree-remove: $script is missing" >&2; exit 1; }
exec bash "$script" --remove "$path"
