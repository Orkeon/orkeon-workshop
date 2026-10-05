#!/bin/sh
# /workspace/scripts/prune-worktrees.sh
# Removes the worktrees whose branch is merged into origin/main, and keeps
# only the sources (no bin/obj) in the others.
set -u
cd /workspace || exit 1
git fetch --prune

git worktree list --porcelain \
| awk '/^worktree /{w=$2} /^branch refs\/heads\//{sub("refs/heads/","",$2); print w, $2}' \
| while read wt br; do
  [ "$wt" = /workspace ] && continue                              # the main repository
  [ "$br" = main ] && continue
  [ -n "$(git -C "$wt" status --porcelain)" ] && continue         # uncommitted work: leave it alone

  if git merge-base --is-ancestor "$br" origin/main; then
    git worktree remove --force "$wt" && git branch -D "$br"      # merged: remove everything
  else
    find "$wt" -type d \( -name bin -o -name obj \) -prune -exec rm -rf {} +   # in progress: sources only
  fi
done

git worktree prune
