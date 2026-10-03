#!/bin/bash
# bash-dispatch module — hard ban on mutating Git commands. OFF BY DEFAULT.
#
# Decision D3 of the plan: the harness proposes commits and tags, it never runs
# them. The skills print the command and hand it to the user, so a material ban
# is not needed for the nominal path. This module exists for the workshops that
# want the instruction to be deterministic anyway: set HARNESS_GUARD_GIT=1 (in
# settings.local.json `env`, or in the shell) and every `git add|commit|push|…`
# issued by an agent is denied, whatever prefix hides it.
#
# Adapted from claude-code-toolkit/lib/guard-git.sh (MIT, see THIRD-PARTY.md).
# Covers the forms `permissions.deny` misses, because it matches on a literal
# prefix:
#   rtk git commit ...            (the rtk rewrite routes everything through rtk)
#   git -C /other/repo commit ... (global option before the verb)
#   cd /elsewhere && git push     (cd prefix)
#   env FOO=1 git add .
#
# Contract: reads $HOOK_CMD, prints the hook JSON when it decides, nothing when
# it passes. Runs first in the chain — a deny is terminal.
set -u

[ "${HARNESS_GUARD_GIT:-0}" = "1" ] || exit 0

cmd="${HOOK_CMD:-}"
[ -n "$cmd" ] || exit 0

# Fast bail-out, before any subprocess: no normalisation can turn a string
# without the substring `git` into `git <verb>`.
case "$cmd" in *git*) ;; *) exit 0 ;; esac

# Normalisation: strip whatever sits between the start of the command and the
# git verb, so every form collapses to "git <verb>".
norm=$(printf '%s' "$cmd" \
  | sed -E 's/(^|[;&|][[:space:]]*)cd[[:space:]]+[^&;|]+&&[[:space:]]*/\1/g' \
  | sed -E 's/(^|[;&|][[:space:]]*)(rtk|command|sudo)[[:space:]]+/\1/g' \
  | sed -E 's/(^|[;&|][[:space:]]*)(env[[:space:]]+)?([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]+[[:space:]]+)*/\1/g' \
  | sed -E 's/(^|[[:space:]])git[[:space:]]+((-C|-c|--git-dir|--work-tree|--namespace|--exec-path)[[:space:]]*=?[[:space:]]*[^[:space:]]+[[:space:]]+)*/\1git /g')

# --- Exception: bringing a worktree back onto the local branch ---
# `add -N` (--intent-to-add) records the path without the content and `apply`
# modifies the working tree without a commit: both fall through to "ask".
ASK_REASON="Worktree hand-back: this command modifies the local working tree without creating a commit. Check the target before approving."

if printf '%s' "$norm" | grep -qE "(^|[;&|][[:space:]]*)git[[:space:]]+add[[:space:]]+([^|;&]*[[:space:]])?(-N|--intent-to-add)([[:space:]]|$)"; then
  jq -n --arg r "$ASK_REASON" '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "ask", permissionDecisionReason: $r}}'
  exit 0
fi

if printf '%s' "$norm" | grep -qE "(^|[;&|][[:space:]]*)git[[:space:]]+apply([[:space:]]|$)"; then
  jq -n --arg r "$ASK_REASON" '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "ask", permissionDecisionReason: $r}}'
  exit 0
fi

# --- Read-only subcommands of an otherwise mutating verb ---
# `git branch -a` passes, `git branch feat/x` (creation) does not: the regex
# must cover the command to its end.
END='[[:space:]]*($|[|;&])'
READONLY="\
(worktree[[:space:]]+list([[:space:]]+(--porcelain|-v|--verbose))*)|\
(branch([[:space:]]+(-l|--list|-a|--all|-r|--remotes|-v|-vv|--show-current|--merged|--no-merged))*)|\
(remote([[:space:]]+(-v|--verbose|show|get-url([[:space:]]+[^[:space:]]+)?))*)|\
(stash[[:space:]]+(list|show)([[:space:]]+[^[:space:]]+)*)|\
(tag[[:space:]]+(-l|--list)([[:space:]]+[^[:space:]]+)*)|\
(reflog([[:space:]]+show)?([[:space:]]+[^[:space:]-][^[:space:]]*)*)"

if printf '%s' "$norm" | grep -qE "(^|[;&|][[:space:]]*)git[[:space:]]+($READONLY)$END"; then
  exit 0
fi

# `am` stays denied: it applies AND commits.
MUTATING='add|am|branch|checkout|cherry-pick|clean|commit|filter-branch|merge|mv|pull|push|rebase|reflog|remote|reset|restore|revert|rm|stash|switch|tag|update-ref|worktree'

if printf '%s' "$norm" | grep -qE "(^|[;&|][[:space:]]*)git[[:space:]]+($MUTATING)([[:space:]]|$)"; then
  verb=$(printf '%s' "$norm" | grep -oE "git[[:space:]]+($MUTATING)([[:space:]]|$)" | head -1 | awk '{print $2}')
  jq -n --arg v "$verb" '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: ("guard-git: git " + $v + " blocked. This workshop forbids any Git mutation by an agent (HARNESS_GUARD_GIT=1): the harness proposes commits and tags, the user runs them. Reading stays allowed (status, log, diff, show). Print the exact command for the user instead.")}}'
  exit 0
fi
exit 0
