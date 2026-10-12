#!/bin/bash
# The worktrees of a checkout, with its shared folders linked (D70, lot 14).
#
# A worktree is a fresh checkout: the untracked folders a build refills - Orkeon's packages/
# (RestorePackagesPath of Directory.Build.props; its CLAUDE.md says "a worktree links its packages
# there"), a node_modules/, a model cache - are absent from it, and every worktree would fill its own:
# the size multiplied, the restore paid again. This script creates the worktree and links those
# folders to the main checkout's, or links them into a worktree made by hand. The two hooks of the
# harness, WorktreeCreate and WorktreeRemove (claude/hooks/worktree-create.sh, worktree-remove.sh),
# call it for every worktree Claude Code asks for: `claude --worktree`, a subagent with
# `isolation: worktree` (the dev-batch agent of /dev-batches), a background session.
#
# Usage:
#   worktree-create.sh <name>              create <root>/.claude/worktrees/<name> from the caller's HEAD,
#                                          link the shared folders, start the warm build (below), print
#                                          the path on the last stdout line
#   worktree-create.sh --link <worktree>   link the shared folders into an existing worktree (made by hand)
#   worktree-create.sh --remove <worktree> remove a worktree and its branch; refused with work inside
#   worktree-create.sh --shared [<root>]   print the shared folders resolved for <root>, one per line
#
# The root is the top of the git work tree of the working directory (the hook's `cwd`). The main
# checkout is the first worktree of `git worktree list`: the links point there, so that a restore
# run in any worktree fills one folder.
#
# The branch: `<prefix>/<name>` when the repository pack's repo.yaml gives `contrib.branch` a shape
# `<prefix>|<prefix>/<slug>` (the first prefix: `feature/<name>` for Orkeon), `worktree-<name>`
# otherwise, as Claude Code names it. Created from HEAD - the branch the caller works on, never the
# default branch: a repository may forbid work on it. The caller is the session that asks: inside a
# linked worktree, that worktree's HEAD.
#
# The shared folders: the list `layout.shared` of the repository pack's repo.yaml
# (.claude/harness/packs/repo-*/references/repo.yaml of the main checkout - a worktree has no
# .claude/ of its own), then HARNESS_WORKTREE_SHARED
# (`:`-separated), relative to the root. Refused, nothing created: an absolute path, a `..` or `.`
# segment, a folder under .git/ or .claude/, a folder git tracks (a link would hide tracked files),
# a worktree path whose .claude or .claude/worktrees is a symbolic link (Claude Code refuses it too).
# A folder absent from the main checkout is created empty there first, so that the first restore
# fills it where every worktree looks. In the worktree, an empty folder gives way to the link, a
# non-empty one is refused.
#
# The warm build (plan B8, 2026-10-12): a fresh worktree has neither obj/ nor bin/, and a dev-batch
# agent would pay a restore and a full build cold before its first RED. Once the worktree is created
# and linked, the script starts `commands.restore && commands.build` of the repository pack's
# repo.yaml in the background, detached (setsid, nohup, every descriptor redirected: the hook ends at
# once, Claude Code never waits), from the worktree, its output in
# <main>/.claude/local/worktrees/<name>.build.txt: a first line `command: <what runs>`, the output,
# and the last line `exit=<n>` when it ends. That restore is the one restore of the batch (B7): the
# dev-batch charter waits for the `exit=` line before its first RED and never restores again. No
# `commands.restore` in the pack (or no pack): the file says `skipped: <why>` and `exit=0`, nothing
# runs, and the batch restores at its entry as /dev-implement section 1.6 says. A reused worktree
# starts nothing. The file is removed with the worktree.
#
# Removal: refused (exit 1, the folder kept) when the worktree has changed or untracked files - the
# links aside - or commits on its branch that no other branch holds, or when git holds a lock on it;
# else the links are removed first, then `git worktree remove`, then `git branch -d`.
#
# Every message goes to stderr, prefixed `worktree-create:`; stdout carries the path alone (the hook
# contract: the last non-empty line of stdout is the worktree). Exit 0 done, 1 refused, 2 usage or
# not a git work tree.
set -uo pipefail

say() { printf 'worktree-create: %s\n' "$*" >&2; }
usage() {
  say "usage: worktree-create.sh <name> | --link <worktree> | --remove <worktree> | --shared [<root>]"
  exit 2
}

top_of() { git -C "$1" rev-parse --show-toplevel 2>/dev/null; }
main_of() { git -C "$1" worktree list --porcelain 2>/dev/null | sed -n '1s/^worktree //p'; }

# The values read from repo.yaml: the shared folders (one per line), the branch prefix, and the two
# commands of the warm build (`commands`: two lines, restore then build, empty when absent).
# PyYAML when it is there (the image, the evals), else a reader of these keys alone.
read_pack() {   # $1 = root, $2 = shared | prefix | commands
  local f
  for f in "$1"/.claude/harness/packs/repo-*/references/repo.yaml; do
    [ -f "$f" ] || continue
    python3 - "$f" "$2" <<'EOF'
import re, sys
path, what = sys.argv[1], sys.argv[2]
text = open(path, encoding="utf-8", errors="replace").read()
shared, branch, restore, build = None, None, None, None
try:
    import yaml
    data = yaml.safe_load(text) or {}
    layout = data.get("layout") if isinstance(data, dict) else None
    shared = layout.get("shared") if isinstance(layout, dict) else None
    contrib = data.get("contrib") if isinstance(data, dict) else None
    branch = contrib.get("branch") if isinstance(contrib, dict) else None
    commands = data.get("commands") if isinstance(data, dict) else None
    if isinstance(commands, dict):
        restore, build = commands.get("restore"), commands.get("build")
except ImportError:
    section = None
    lines = text.splitlines()
    for i, line in enumerate(lines):
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if not line.startswith((" ", "\t")):
            section = line.split(":", 1)[0].strip()
            continue
        key, _, value = line.strip().partition(":")
        value = value.split(" #", 1)[0].strip()
        if section == "layout" and key == "shared":
            if value.startswith("["):
                shared = [v.strip().strip("'\"") for v in value.strip("[]").split(",") if v.strip()]
            else:
                shared = []
                for nxt in lines[i + 1:]:
                    if re.match(r"^\s+-\s", nxt):
                        shared.append(nxt.split("-", 1)[1].split(" #", 1)[0].strip().strip("'\""))
                    elif nxt.strip() and not nxt.lstrip().startswith("#"):
                        break
        elif section == "contrib" and key == "branch":
            branch = value.strip("'\"")
        elif section == "commands" and key in ("restore", "build") and value and not value.startswith((">", "|")):
            if key == "restore":
                restore = value.strip("'\"")
            else:
                build = value.strip("'\"")
if what == "commands":
    for v in (restore, build):
        print(v.strip().replace("\n", " ") if isinstance(v, str) and v.strip() else "")
elif what == "shared":
    if isinstance(shared, str):
        shared = [shared]
    for item in shared or []:
        if isinstance(item, str) and item.strip():
            print(item.strip())
elif isinstance(branch, str):
    print(branch)
EOF
    return
  done
}

# The shared folders of a root: the pack's, then HARNESS_WORKTREE_SHARED; each one checked.
shared_folders() {   # $1 = root; prints one folder per line; exit 1 on a refused one
  local root="$1" item out="" seen=" " rc=0
  while IFS= read -r item; do
    [ -n "$item" ] || continue
    while :; do
      case "$item" in ./*) item="${item#./}" ;; */) item="${item%/}" ;; *) break ;; esac
    done
    [ -n "$item" ] || continue
    case "$seen" in *" $item "*) continue ;; esac
    seen="$seen$item "
    case "$item" in
      /*|..|../*|*/..|*/../*|.|./*|*/./*|*//*|.git|.git/*|.claude|.claude/*|*[![:print:]]*|*[[:space:]]*)
        say "refused: shared folder \`$item\` is not a relative folder of the checkout outside .git/ and .claude/"; rc=1; continue ;;
    esac
    if git -C "$root" ls-files --error-unmatch -- "$item" >/dev/null 2>&1; then
      say "refused: shared folder \`$item\` holds files git tracks - a link would hide them in the worktree"; rc=1; continue
    fi
    out="$out$item"$'\n'
  done < <(read_pack "$root" shared; printf '%s\n' "${HARNESS_WORKTREE_SHARED:-}" | tr ':' '\n')
  printf '%s' "$out"
  return $rc
}

branch_prefix() {   # $1 = root; prints the first prefix of contrib.branch, or nothing
  local shape
  shape=$(read_pack "$1" prefix)
  case "$shape" in
    */"<slug>"*) shape="${shape%%/<slug>*}"; shape="${shape%%|*}"
                 case "$shape" in ""|*[!A-Za-z0-9._-]*) ;; *) printf '%s' "$shape" ;; esac ;;
  esac
}

# Link every shared folder of <main> into <worktree>. $3 = the folders, one per line.
link_shared() {   # $1 = main, $2 = worktree, $3 = folders
  local main="$1" wt="$2" item target link linked=""
  while IFS= read -r item; do
    [ -n "$item" ] || continue
    target="$main/$item"
    if [ -L "$target" ]; then
      target=$(readlink -f "$target") || { say "refused: \`$item\` of the main checkout is a link that resolves to nothing"; return 1; }
    elif [ ! -e "$target" ]; then
      mkdir -p "$target" || { say "refused: cannot create \`$item\` in the main checkout"; return 1; }
      say "created \`$item/\` empty in the main checkout: the first restore fills it there"
    elif [ ! -d "$target" ]; then
      say "refused: \`$item\` of the main checkout is not a folder"; return 1
    fi
    link="$wt/$item"
    if [ -L "$link" ]; then
      [ "$(readlink -f "$link")" = "$target" ] && { linked="$linked $item"; continue; }
      rm -f "$link"
    elif [ -d "$link" ]; then
      rmdir "$link" 2>/dev/null || { say "refused: \`$item/\` of the worktree is not empty - move its content or remove it first"; return 1; }
    elif [ -e "$link" ]; then
      say "refused: \`$item\` of the worktree is a file"; return 1
    fi
    mkdir -p "$(dirname "$link")" || return 1
    ln -s "$target" "$link" || { say "refused: cannot link \`$item\`"; return 1; }
    linked="$linked $item"
  done <<<"$3"
  [ -z "$linked" ] || say "linked to the main checkout:${linked// / }"
  exclude_links "$main" "$3"
  return 0
}

# The links are untracked entries of the worktree: a `.gitignore` rule written for the folder
# (`packages/`, `**/packages/*`) does not match a symbolic link of that name, and a `git add -A`
# would commit it. A block of the repository's info/exclude - shared by every worktree - names each
# shared folder without a trailing slash; rewritten at every call, the repository's .gitignore
# never touched (the convention of sync-harness.sh, D51).
exclude_links() {   # $1 = main, $2 = folders
  local main="$1" file tmp item
  file=$(git -C "$main" rev-parse --git-path info/exclude 2>/dev/null) || return 0
  case "$file" in /*) ;; *) file="$main/$file" ;; esac
  mkdir -p "$(dirname "$file")" 2>/dev/null || return 0
  tmp="$file.$$.tmp"
  {
    [ -f "$file" ] && awk '/^# >>> orkeon-workshop worktree shared$/ {skip=1; next} /^# <<< orkeon-workshop worktree shared$/ {skip=0; next} !skip' "$file"
    printf '# >>> orkeon-workshop worktree shared\n'
    while IFS= read -r item; do [ -n "$item" ] && printf '/%s\n' "$item"; done <<<"$2"
    printf '# <<< orkeon-workshop worktree shared\n'
  } > "$tmp" 2>/dev/null && mv -f "$tmp" "$file" 2>/dev/null
  rm -f "$tmp" 2>/dev/null
  return 0
}

# The shared links of a worktree, found on disk: every symbolic link up to three levels down
# (.git aside) that resolves inside the main checkout. Removal relies on this, not on the pack.
shared_links() {   # $1 = main, $2 = worktree; prints the links relative to the worktree
  local main="$1" wt="$2" l t
  while IFS= read -r l; do
    t=$(readlink -f "$l" 2>/dev/null) || continue
    case "$t/" in "$main"/*) printf '%s\n' "${l#"$wt"/}" ;; esac
  done < <(find "$wt" -mindepth 1 -maxdepth 3 -type l -not -path '*/.git/*' 2>/dev/null)
}

# The warm build of a fresh worktree (plan B8): the restore and the first build, in the background.
warm_build() {   # $1 = main, $2 = worktree, $3 = name
  local main="$1" wt="$2" name="$3" dir log restore="" build="" cmd
  dir="$main/.claude/local/worktrees"
  log="$dir/$name.build.txt"
  mkdir -p "$dir" 2>/dev/null || { say "no warm build: cannot create $dir"; return 0; }
  { IFS= read -r restore; IFS= read -r build; } < <(read_pack "$main" commands; printf '\n\n')
  if [ -z "$restore" ]; then
    printf 'skipped: no commands.restore in the repository pack - the batch restores at its entry (/dev-implement 1.6)\nexit=0\n' >"$log"
    say "no commands.restore in the repository pack: nothing built in the background ($log)"
    return 0
  fi
  cmd="$restore"
  [ -z "$build" ] || cmd="$restore && $build"
  printf 'command: %s\nstarted: %s\nworktree: %s\n' "$cmd" "$(date '+%F %H:%M:%S')" "$wt" >"$log"
  if command -v setsid >/dev/null 2>&1; then
    ( cd "$wt" && setsid nohup bash -c "$cmd; rc=\$?; printf '\\nexit=%s\\n' \$rc" >>"$log" 2>&1 </dev/null & ) >/dev/null 2>&1
  else
    ( cd "$wt" && nohup bash -c "$cmd; rc=\$?; printf '\\nexit=%s\\n' \$rc" >>"$log" 2>&1 </dev/null & ) >/dev/null 2>&1
  fi
  say "restore and build started in the background: $log (its last line reads exit=<n> when done; the batch waits for it, B8)"
  return 0
}

cmd_shared() {
  local root main
  root=$(top_of "${1:-.}") || { say "not inside a git work tree"; exit 2; }
  main=$(main_of "$root"); [ -n "$main" ] || main="$root"
  shared_folders "$main" || exit 1
}

cmd_create() {
  local name="$1" root main wt branch prefix folders base
  case "$name" in ""|*/*|.*|*[!A-Za-z0-9._-]*) say "refused: a worktree name is [A-Za-z0-9._-], not starting with a dot: \`$name\`"; exit 2 ;; esac
  root=$(top_of .) || { say "not inside a git work tree"; exit 2; }
  main=$(main_of "$root"); [ -n "$main" ] || main="$root"
  base="$root/.claude/worktrees"
  for p in "$root/.claude" "$base"; do
    [ -L "$p" ] && { say "refused: \`${p#"$root"/}\` is a symbolic link; Claude Code refuses a worktree behind one"; exit 1; }
  done
  wt="$base/$name"
  folders=$(shared_folders "$main") || exit 1
  if [ -e "$wt" ]; then
    if git -C "$root" worktree list --porcelain | grep -qxF "worktree $wt"; then
      say "worktree \`$name\` exists: reused"
      link_shared "$main" "$wt" "$folders" || exit 1
      printf '%s\n' "$wt"; exit 0
    fi
    say "refused: \`.claude/worktrees/$name\` exists and is not a worktree of this repository"; exit 1
  fi
  prefix=$(branch_prefix "$main")
  if [ -n "$prefix" ]; then branch="$prefix/$name"; else branch="worktree-$name"; fi
  if git -C "$root" show-ref --verify --quiet "refs/heads/$branch"; then
    say "refused: branch \`$branch\` exists already - remove it or choose another name"; exit 1
  fi
  mkdir -p "$base" || exit 1
  if ! git -C "$root" worktree add --quiet -b "$branch" "$wt" HEAD >&2; then
    say "git worktree add failed for \`$name\`"; exit 1
  fi
  say "worktree \`.claude/worktrees/$name\` on branch \`$branch\` from $(git -C "$root" rev-parse --short HEAD)"
  if ! link_shared "$main" "$wt" "$folders"; then
    git -C "$root" worktree remove --force "$wt" >&2 2>/dev/null
    git -C "$root" branch -D "$branch" >/dev/null 2>&1
    exit 1
  fi
  warm_build "$main" "$wt" "$name"
  printf '%s\n' "$wt"
}

cmd_link() {
  local wt="$1" root main folders
  [ -d "$wt" ] || { say "refused: \`$wt\` is not a folder"; exit 2; }
  wt=$(top_of "$wt") || { say "refused: \`$1\` is not inside a git work tree"; exit 2; }
  root="$wt"
  main=$(main_of "$root"); [ -n "$main" ] || main="$root"
  [ "$main" != "$wt" ] || { say "refused: \`$wt\` is the main checkout, not a linked worktree"; exit 1; }
  folders=$(shared_folders "$main") || exit 1
  [ -n "$folders" ] || { say "nothing to link: no shared folder in repo.yaml layout.shared or HARNESS_WORKTREE_SHARED"; exit 0; }
  link_shared "$main" "$wt" "$folders" || exit 1
}

cmd_remove() {
  local wt="$1" main branch links item others n
  [ -d "$wt" ] || { say "nothing to remove: \`$wt\` is not a folder"; exit 0; }
  wt=$(top_of "$wt") || { say "refused: \`$1\` is not inside a git work tree"; exit 2; }
  main=$(main_of "$wt"); [ -n "$main" ] || { say "refused: \`$wt\` is not inside a git work tree"; exit 2; }
  [ "$main" != "$wt" ] || { say "refused: \`$wt\` is the main checkout"; exit 1; }
  git -C "$main" worktree list --porcelain | grep -qxF "worktree $wt" || { say "refused: \`$wt\` is not a worktree of $main"; exit 1; }
  if [ -n "$(git -C "$main" worktree list --porcelain | awk -v w="worktree $wt" '$0==w {f=1; next} f && /^locked/ {print "locked"; exit} f && /^$/ {exit}')" ]; then
    say "refused: \`$wt\` is locked (an agent or a session still runs there; \`git worktree unlock\` once it is gone)"; exit 1
  fi
  links=$(shared_links "$main" "$wt")
  local exclude=()
  while IFS= read -r item; do [ -n "$item" ] && exclude+=(":(exclude)$item"); done <<<"$links"
  if [ -n "$(git -C "$wt" status --porcelain --untracked-files=all -- . ${exclude[@]+"${exclude[@]}"} 2>/dev/null)" ]; then
    say "refused: \`$wt\` has changed or untracked files - commit or discard them first (\`git -C $wt status --short\`)"; exit 1
  fi
  branch=$(git -C "$wt" symbolic-ref --quiet --short HEAD 2>/dev/null) || branch=""
  if [ -n "$branch" ]; then
    others=$(git -C "$main" for-each-ref --format='%(refname)' refs/heads refs/remotes | grep -vxF "refs/heads/$branch" || true)
    # shellcheck disable=SC2086
    n=$(git -C "$main" rev-list --count "refs/heads/$branch" --not $others 2>/dev/null || echo 0)
    [ "$n" = 0 ] || { say "refused: branch \`$branch\` holds $n commit(s) no other branch has - merge or push it first"; exit 1; }
  fi
  while IFS= read -r item; do [ -n "$item" ] && rm -f "$wt/$item"; done <<<"$links"
  git -C "$main" worktree remove "$wt" >&2 || { say "refused: git could not remove \`$wt\`"; exit 1; }
  rm -f "$main/.claude/local/worktrees/$(basename "$wt").build.txt" 2>/dev/null
  [ -z "$branch" ] || git -C "$main" branch -d "$branch" >&2 || say "worktree removed; branch \`$branch\` kept (git refused to delete it)"
  say "removed \`$wt\`${branch:+ and branch \`$branch\`}"
}

case "${1:-}" in
  --shared) shift; cmd_shared "${1:-.}" ;;
  --link) [ $# -eq 2 ] || usage; cmd_link "$2" ;;
  --remove) [ $# -eq 2 ] || usage; cmd_remove "$2" ;;
  -h|--help|"") usage ;;
  --*) usage ;;
  *) [ $# -eq 1 ] || usage; cmd_create "$1" ;;
esac
