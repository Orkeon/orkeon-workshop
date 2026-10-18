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
#   memory    MemTotal of /proc/meminfo against HARNESS_DEV_BATCHES_MAX (2026-10-18): two batches
#             per 15 GB - five at once exhausted the RAM of a 15 GB WSL2 machine and broke its mount;
#             fewer admissible than the limit - warn, with the number.
#   mount     the type of the checkout's mount: 9p or drvfs (a Windows disk under WSL2) - warn, with
#             what GAP-50-55 measured there (a read 170 times slower than the native disk, `git status`
#             7.8 s, 8 h 17 of stalls) and the remedy, HARNESS_WORKTREE_ROOT on a Docker volume (D85);
#             with it set, `ok`: the batches build there.
#   worktrees `git worktree prune`, then the worktrees under .claude/worktrees, or under
#             HARNESS_WORKTREE_ROOT, left by a stopped run - warn, named, for `worktree-create.sh --remove`.
#   wt root   HARNESS_WORKTREE_ROOT set (D85): `worktree-create.sh --home` refuses it - FAIL, no batch
#             could get a worktree; not a mount point of its own - warn, its worktrees and package cache
#             die with the container (a Docker volume keeps them); unset - nothing printed.
#   host      a reminder, always `ok`: a Windows host that sleeps freezes the container and every
#             batch (GAP-50-55: 8 h 17 of stalls) - its power plan is the user's.
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

# memory: two batches per 15 GB (the project's measure, 2026-10-14), at least one.
if [ -r /proc/meminfo ]; then
  total_kb=$(awk '/^MemTotal:/ {print $2}' /proc/meminfo)
  avail_kb=$(awk '/^MemAvailable:/ {print $2}' /proc/meminfo)
  max="${HARNESS_DEV_BATCHES_MAX:-2}"; case "$max" in ''|*[!0-9]*) max=2 ;; esac
  fits=$(( (total_kb * 2 + 7 * 1024 * 1024) / (15 * 1024 * 1024) )); [ "$fits" -ge 1 ] || fits=1
  gb=$(( total_kb / 1024 / 1024 )); free=$(( avail_kb / 1024 / 1024 ))
  if [ "$fits" -lt "$max" ]; then
    warn "memory: ${gb} GB (${free} GB free) - $fits batch(es) at once fit (two per 15 GB), HARNESS_DEV_BATCHES_MAX is $max - lower it, or launch fewer"
  else
    ok "memory: ${gb} GB (${free} GB free) - $max batch(es) at once"
  fi
fi

# mount: the type of the file system the checkout sits on.
fstype=$(stat -f -c %T "$top" 2>/dev/null || true)
mnt=$(awk -v t="$top" '$2 != "" && index(t "/", $2 "/") == 1 { if (length($2) > l) { l = length($2); m = $3 } } END { print m }' /proc/mounts 2>/dev/null)
case "$mnt:$fstype" in
  9p:*|drvfs:*|*:v9fs|*:9p)
    if [ -n "${HARNESS_WORKTREE_ROOT:-}" ]; then
      ok "mount: the checkout is on ${mnt:-$fstype} (a Windows disk under WSL2); the batches build under HARNESS_WORKTREE_ROOT (D85)"
    else
      warn "mount: the checkout is on ${mnt:-$fstype} (a Windows disk under WSL2) - builds twice as slow there, a worktree 70 times (V-40), 8 h 17 of stalls in GAP-50-55; for /dev-batches: recreate the container with -v <container>-worktrees:/worktrees -e HARNESS_WORKTREE_ROOT=/worktrees, as the start commands of Install do (docs: Docker modes, Advanced)"
    fi ;;
  *) ok "mount: ${mnt:-${fstype:-unknown}}" ;;
esac

# The worktree root (D85): usable, and a mount of its own.
home=""
if [ -n "${HARNESS_WORKTREE_ROOT:-}" ] && [ -f "$space" ]; then
  if home=$(bash "$space" --home "$top" 2>"${TMPDIR:-/tmp}/preflight-home.$$"); then
    r="${HARNESS_WORKTREE_ROOT%/}"
    if awk -v r="$r" '$2 == r {f=1} END {exit !f}' /proc/mounts 2>/dev/null; then
      ok "worktree root: $r, a mount of its own - the batches build off the checkout's disk (D85)"
    else
      warn "worktree root: $r is no mount of its own - its worktrees and package cache die with the container: docker run -v <volume>:$r"
    fi
  else
    ko "worktree root: $(sed 's/^worktree-create: //' "${TMPDIR:-/tmp}/preflight-home.$$" | head -n 1)"
    home=""
  fi
  rm -f "${TMPDIR:-/tmp}/preflight-home.$$"
fi

# worktrees: pruned, then the ones a stopped run left under .claude/worktrees or the worktree root.
git -C "$top" worktree prune 2>/dev/null || true
orphans=$(git -C "$top" worktree list --porcelain 2>/dev/null | sed -n 's#^worktree ##p' | grep -F -e "$top/.claude/worktrees/" ${home:+-e "$home/worktrees/"} || true)
if [ -n "$orphans" ]; then
  n=$(printf '%s\n' "$orphans" | wc -l)
  warn "worktrees: $n left before the launch - $(printf '%s\n' "$orphans" | sed "s#^$top/##" | tr '\n' ' ')- a stopped run's: resume it (closing.md section 8) or bash $harness/scripts/worktree-create.sh --remove <worktree>"
else
  ok "worktrees: none left from an earlier run"
fi

ok "host: keep it awake for the whole run - a Windows host that sleeps freezes the container and every batch (power plan: the user's)"

exit "$fail"
