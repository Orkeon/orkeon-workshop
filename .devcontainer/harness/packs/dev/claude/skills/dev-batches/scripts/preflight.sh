#!/bin/bash
# What /dev-batches checks before its first launch - in one block, before any agent runs (2026-10-14).
#
# GAP-43-44 (2026-10-13) paid for each of these once the batches were running: the git identity was
# missing at the first commit (4 minutes on the critical path, the F1 agent relaunched), `gh` had no
# credentials at the first push (11 minutes, `gh auth login` then `gh auth setup-git`), and the
# question of the user's `rtk` hook came two minutes before the first launch. One line per check:
#
#   ok    <what>                      nothing to do
#   warn  <what> - <why> - <fix>      said now; the run can start
#   FAIL  <what> - <why> - <fix>      the run cannot start until it is fixed
#
#   identity  `git var GIT_AUTHOR_IDENT` (the configuration, or the GIT_AUTHOR_* variables
#             `workshop --git-identity` exports): none, no batch can commit - FAIL. Never set here.
#   branch    the main checkout on the default branch (`origin/HEAD`): FAIL - /dev-batches creates
#             the work branch first (`contrib.branch`, D71), the user's own gesture otherwise.
#   rtk hook  an `rtk hook claude` in the user's own settings (`$CLAUDE_CONFIG_DIR` or ~/.claude):
#             it rewrites `git` into `rtk git`, which the worktree isolation refuses - FAIL.
#   gh        `gh auth status -h github.com`: only the push and the pull request of the close need
#             it (D79) - warn, said now so that it is fixed while the batches run.
#   space     `worktree-create.sh --space`: less than two built worktrees fit - warn, the merged
#             worktrees offered for removal.
#
# Usage: preflight.sh [<harness>]   (<harness>: the checkout's .claude/, default <top>/.claude)
# Exit: 0 nothing blocks (warnings may be printed), 1 a FAIL line, 2 not a git work tree.
set -uo pipefail

top=$(git rev-parse --show-toplevel 2>/dev/null) || { echo "preflight: not inside a git work tree" >&2; exit 2; }
harness="${1:-$top/.claude}"
fail=0
ok() { printf 'ok    %s\n' "$1"; }
warn() { printf 'warn  %s\n' "$1"; }
ko() { printf 'FAIL  %s\n' "$1"; fail=1; }

if ident=$(git var GIT_AUTHOR_IDENT 2>/dev/null); then
  ok "identity: ${ident% * *}"
else
  ko "identity: git has none - no batch can commit - /exit, then workshop --git-identity \"<name>\" <email>; or git config --global user.name \"<name>\" and git config --global user.email \"<email>\""
fi

branch=$(git -C "$top" symbolic-ref --quiet --short HEAD 2>/dev/null) || branch=""
default=$(git -C "$top" symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null | sed 's#^origin/##')
if [ -z "$branch" ]; then
  ko "branch: HEAD is detached - the batches merge into a branch - git switch -c <prefix>/<code>"
elif [ -n "$default" ] && [ "$branch" = "$default" ]; then
  ko "branch: on the default branch $default - create the work branch first (contrib.branch of repo.yaml, D71): git switch -c <prefix>/<code>"
else
  ok "branch: $branch${default:+ (default: $default)}"
fi

settings="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/settings.json"
if [ -f "$settings" ] && grep -q 'rtk hook claude' "$settings" 2>/dev/null; then
  ko "rtk hook: $settings runs rtk hook claude, which rewrites git into rtk git and the worktree isolation refuses - remove that hook (the harness's dispatcher runs rtk itself)"
else
  ok "rtk hook: none in ${settings/#$HOME/~}"
fi

if ! command -v gh >/dev/null 2>&1; then
  warn "gh: not installed - the push and the pull request of the close will be handed over"
elif gh auth status -h github.com >/dev/null 2>&1; then
  ok "gh: authenticated on github.com"
else
  warn "gh: not authenticated on github.com - only the push and the pull request of the close need it (D79): gh auth login, then gh auth setup-git, in a terminal of the container"
fi

space="$harness/scripts/worktree-create.sh"
if [ -f "$space" ]; then
  out=$(bash "$space" --space "$top" 2>/dev/null); rc=$?
  first=$(printf '%s\n' "$out" | head -n 1)
  merged=$(printf '%s\n' "$out" | grep -c '^merged: ')
  if [ "$rc" = 3 ]; then
    warn "space: ${first#free: } - $(printf '%s\n' "$out" | grep '^low: ' | sed 's/^low: //') ($merged merged worktree(s) to remove)"
  else
    [ "$merged" -gt 0 ] && first="$first - $merged merged worktree(s) left"
    ok "space: ${first#free: }"
  fi
else
  warn "space: $space missing - not checked"
fi

exit "$fail"
