#!/bin/bash
# WorktreeCreate hook - the harness creates every worktree Claude Code asks for (D70, lot 14).
#
# Claude Code fires it for `claude --worktree <name>`, for a subagent with `isolation: worktree`
# (the dev-batch agent of /dev-batches) and for a background session, and the hook replaces its own
# `git worktree` logic entirely: it receives `name` and `cwd`, and the last non-empty line of its
# stdout is the worktree's path; a non-zero exit or no path fails the creation, with no fallback
# (`.worktreeinclude` is not processed either). The work is done by claude/scripts/worktree-create.sh,
# run from `cwd`: the worktree under <root>/.claude/worktrees/<name> from the caller's HEAD, on the
# branch the repository pack names, the untracked folders of repo.yaml `layout.shared` and of
# HARNESS_WORKTREE_SHARED linked to the main checkout's, and the warm build (plan B8, 2026-10-12):
# `commands.restore && commands.build` of repo.yaml started in the worktree, detached and in the
# background, its output in <root>/.claude/local/worktrees/<name>.build.txt ending with `exit=<n>` -
# the hook itself ends at once, the dev-batch agent waits for that line before its first RED.
# Everything it says goes to stderr.
#
# In the core pack, wired in the one settings.json every space receives: a hook wired there must
# exist everywhere, and in a workshop that is a git repository the same script creates a plain
# worktree, with nothing to link. No switch: a creation hook cannot be inert - without a path the
# creation fails. Inert, empty, `{}` or not JSON: exit 0, no output (nothing was asked).
set -uo pipefail

input=$(cat)
[ -n "$input" ] || exit 0
command -v jq >/dev/null 2>&1 || exit 0

PARSED=$(printf '%s' "$input" | jq -j 'if type == "object" then
    [(.hook_event_name // ""), (.name // "" | tostring), (.cwd // "" | tostring)] | join("\u001f")
  else "" end' 2>/dev/null) || exit 0
[ -n "$PARSED" ] || exit 0
IFS=$'\x1f' read -r event name cwd <<<"$PARSED"
[ "$event" = "WorktreeCreate" ] || exit 0
[ -n "$name" ] || exit 0

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
script="$HERE/../scripts/worktree-create.sh"
[ -f "$script" ] || { echo "worktree-create: $script is missing" >&2; exit 1; }
if [ -n "$cwd" ] && [ -d "$cwd" ]; then cd "$cwd" || exit 1; fi
exec bash "$script" "$name"
