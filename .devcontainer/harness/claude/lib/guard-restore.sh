#!/bin/bash
# bash-dispatch module — one restore per batch (plan B, B7 and B9, 2026-10-12).
#
# Every `dotnet build` or `dotnet test` launched without `--no-restore` / `--no-build` restores
# again: the package graph is resolved, the network may be touched, and a batch of the dev chain
# paid eighteen to twenty-six of them. The rule of the chain is one restore, at the batch's entry,
# by the orchestrator (`commands.restore`; for a dev-batch agent, the warm build of its worktree);
# then everything carries the flag, and no role restores. This module makes the rule hold:
#
#   - a role subagent (dev-test-author, dev-implementer, dev-auditor; `agent_type` of the
#     payload): `dotnet restore` is refused, always; a `dotnet build` without
#     `--no-restore`, or a `dotnet test` without `--no-build` and without `--no-restore`, is refused
#     when the targeted project is already restored - `obj/project.assets.json` exists under the
#     project the command names (a .csproj or its folder), or under the folder of the solution, or
#     under the working directory when nothing is named. Cold (no assets file), the command passes:
#     nothing to protect yet, and the charter still says `## BLOCKED`;
#   - the main session or a dev-batch agent (any other `agent_type`, or none): nothing is refused;
#     the second restore of the context - an explicit `dotnet restore`, or a build or test without
#     the flag on a restored project - is flagged through `additionalContext`, not denied: the one
#     legitimate case is a .csproj or a PackageReference changed in the batch, and the orchestrator
#     says so. The count is a state file per (session, agent), `/tmp/claude-restore-seen-<sid>[-<agent>]`,
#     removed by session-cleanup.
#
# `dotnet` is matched as the first word of a simple command: after `;`, `&&`, `||`, `|`, a newline,
# `$(` or a backtick; behind environment assignments and the usual prefixes (`rtk`, `rtk proxy`,
# `sudo`, `command`, `exec`, `time`, `nohup`, `env`); a `cd <dir>` earlier in the same command moves
# the directory the paths resolve against. `dotnet run`, `dotnet tool`, `echo dotnet` pass.
#
# Switch: HARNESS_GUARD_RESTORE, `1` by default (a guard of `core`: it fires on `dotnet` alone and is
# silent elsewhere), `0` turns it off. Refusal prefixed `guard-restore:` (FROZEN-LITERALS.md).
#
# Contract: reads $HOOK_CMD, $HOOK_AGENT_TYPE, $HOOK_CWD, $HOOK_SESSION_ID, $HOOK_AGENT_ID; prints the
# hook JSON when it decides, nothing when it passes. A deny is terminal in the chain; an
# `additionalContext` alone is advisory, grafted by the dispatcher onto whatever the chain answers.
set -u

cmd="${HOOK_CMD:-}"
[ -n "$cmd" ] || exit 0
[ "${HARNESS_GUARD_RESTORE:-1}" = "0" ] && exit 0
case "$cmd" in *dotnet*) ;; *) exit 0 ;; esac

agent="${HOOK_AGENT_TYPE:-}"
role=0
case "$agent" in dev-test-author|dev-implementer|dev-auditor) role=1 ;; esac

dir="${HOOK_CWD:-$PWD}"
[ -d "$dir" ] || dir="$PWD"

# A restored project under <dir>: its own obj/project.assets.json, or one a few levels down (a
# solution folder, the working directory). The walk never enters bin/ nor the folders inside an
# obj/ (2026-10-14): a built Orkeon worktree holds 25 to 30 GB there, on a 9p mount.
restored_under() {   # $1 = dir, $2 = exact (1: this project only)
  local d="$1"
  [ -d "$d" ] || return 1
  [ -f "$d/obj/project.assets.json" ] && return 0
  [ "${2:-0}" = 1 ] && return 1
  [ -n "$(find "$d" -maxdepth 6 \( -name node_modules -o -name .git -o -name bin \) -prune -o -path '*/obj/project.assets.json' -print -quit -o -path '*/obj/*' -prune 2>/dev/null)" ]
}

deny() {
  jq -n --arg r "$1" \
    '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $r}}'
  exit 0
}

rule="one restore per batch (B7): the orchestrator restored once at the batch's entry, and everything after it carries --no-restore or --no-build."
seen_file="/tmp/claude-restore-seen-${HOOK_SESSION_ID:-unknown}${HOOK_AGENT_ID:+-$HOOK_AGENT_ID}"
advice=""
restores=0

while IFS= read -r segment; do
  [ -n "$segment" ] || continue
  # shellcheck disable=SC2086
  set -- $segment
  while [ $# -gt 0 ]; do
    case "$1" in
      [A-Za-z_]*=*) shift; continue ;;
      rtk) shift; [ "${1:-}" = proxy ] && shift; continue ;;
      sudo|command|exec|time|nohup|env) shift; continue ;;
      \(*|\{*) set -- "${1#[({]}" "${@:2}"; [ -n "$1" ] || shift; continue ;;
    esac
    break
  done
  [ $# -gt 0 ] || continue
  word="${1##*/}"
  if [ "$word" = cd ] && [ $# -ge 2 ]; then
    d="$2"; d="${d%\"}"; d="${d#\"}"; d="${d%\'}"; d="${d#\'}"
    case "$d" in /*) ;; *) d="$dir/$d" ;; esac
    [ -d "$d" ] && dir="$d"
    continue
  fi
  [ "$word" = dotnet ] || continue
  sub="${2:-}"
  case "$sub" in restore|build|test) ;; *) continue ;; esac
  shift 2
  no_restore=0; no_build=0; target=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --no-restore) no_restore=1 ;;
      --no-build) no_build=1 ;;
      --filter|-c|--configuration|-f|--framework|-o|--output|-r|--runtime|-v|--verbosity|-s|--settings|--logger|-l|--results-directory|--collect) shift ;;
      -*) ;;
      *) if [ -z "$target" ]; then
           t="$1"; t="${t%\"}"; t="${t#\"}"; t="${t%\'}"; t="${t#\'}"
           case "$t" in *.csproj|*.fsproj|*.vbproj|*.sln|*.slnx) target="$t" ;;
                        *) p="$t"; case "$p" in /*) ;; *) p="$dir/$p" ;; esac; [ -d "$p" ] && target="$t" ;; esac
         fi ;;
    esac
    [ $# -gt 0 ] && shift
  done

  if [ "$sub" = restore ]; then
    [ $role -eq 1 ] && deny "guard-restore: \`dotnet restore\` refused — a role ($agent) never restores: $rule A restore error (NETSDK1004, a stale project.assets.json) is \`## BLOCKED\` with its line, never a restore of your own (common rules § 6)."
    restores=$((restores + 1))
    continue
  fi
  # build without --no-restore, test without --no-build and without --no-restore: an implicit restore.
  if [ "$sub" = build ] && [ $no_restore -eq 1 ]; then continue; fi
  if [ "$sub" = test ] && { [ $no_build -eq 1 ] || [ $no_restore -eq 1 ]; }; then continue; fi
  exact=0; pdir="$dir"
  if [ -n "$target" ]; then
    case "$target" in /*) pdir="$target" ;; *) pdir="$dir/$target" ;; esac
    case "$target" in *.csproj|*.fsproj|*.vbproj) pdir="$(dirname "$pdir")"; exact=1 ;;
                      *.sln|*.slnx) pdir="$(dirname "$pdir")" ;; esac
  fi
  if restored_under "$pdir" "$exact"; then
    flag="--no-restore"; [ "$sub" = test ] && flag="--no-build"
    [ $role -eq 1 ] && deny "guard-restore: \`dotnet $sub\` without \`$flag\` refused for $agent — the project under \`$pdir\` is restored already (obj/project.assets.json): $rule Add \`$flag\`, as the contract's Build command and Test command carry it; a project that will not build with it is \`## BLOCKED\`, never a restore of your own (common rules § 6)."
    restores=$((restores + 1))
  fi
done < <(printf '%s\n' "$cmd" | sed 's/\$(/\n/g; s/`/\n/g' | tr ';&|' '\n\n\n')

[ "$restores" -gt 0 ] || exit 0

# The main session or a dev-batch agent: the first restore of the context passes in silence, every
# later one is flagged.
before=0
[ -f "$seen_file" ] && before=$(wc -l <"$seen_file" | tr -d ' ')
i=0
while [ $i -lt "$restores" ]; do printf 'restore\n' >>"$seen_file" 2>/dev/null; i=$((i + 1)); done
[ "${before:-0}" -gt 0 ] || [ "$restores" -gt 1 ] || exit 0

advice="guard-restore: a second restore in this context (a \`dotnet restore\`, or a build or test without --no-restore / --no-build on a restored project) — $rule The one legitimate case is a .csproj or a PackageReference changed in the batch: say so in one line (→ Restore again: <file> changed), and give every other dotnet build or test its flag."
jq -n --arg c "$advice" '{hookSpecificOutput: {hookEventName: "PreToolUse", additionalContext: $c}}'
exit 0
