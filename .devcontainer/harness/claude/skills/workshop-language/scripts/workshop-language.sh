#!/bin/bash
# /workshop-language — the language of a workshop: read it, set it, or go back to the default.
#
# Plan § 3.2, § 7.1, D41. A workshop may name the language its users work in. It is one line in
# `.claude/local/language` — a language tag such as `fr`, `de` or `pt-BR` — a file the workshop
# owns: the image never deploys nor removes it, and git keeps it with the workshop. The hook
# `workshop-language.sh` reads it at the start of every session and tells the model; what the
# language applies to, and what stays as the templates give it, is `.claude/rules/workbook.md`
# § "Tone and language".
#
# Usage: workshop-language.sh [<tag> | default]
#   (nothing)   prints the language in force
#   <tag>       sets it: a language of 2 or 3 letters, then an optional script and an optional
#               region (fr, en, pt-BR, zh-Hans, sr-Latn-RS, es-419)
#   default     removes the file: the conversation follows the user's messages, files are in English
# Exit 0 done · 2 usage, not a tag, not a workshop, or the file could not be read or written.
# Every line it prints, on stdout or stderr, starts with `workshop-language:` (a frozen literal,
# FROZEN-LITERALS.md); a value that is not a tag is never repeated in a message. The file is
# read and judged by lib/team-common.sh (harness_workshop_language), as the hook does: a folder
# or a symbolic link in its place is not a language, and is never followed nor written through.
# The workshop is $ORKEON_WORKSHOP, else the project Claude Code opened, else the working
# directory when it holds teams/, else ~/Orkeon.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAUDE_DIR="$(cd "$HERE/../../.." && pwd)"
# shellcheck source=../../../lib/team-common.sh
. "$CLAUDE_DIR/lib/team-common.sh"

usage() { echo "workshop-language: usage: workshop-language.sh [<tag> | default] — a language tag (fr, de, pt-BR), or nothing to show the language in force." >&2; exit 2; }
fail() { echo "workshop-language: $1" >&2; exit 2; }

[ "$#" -le 1 ] || { echo "workshop-language: one language at a time (got $# arguments)." >&2; usage; }
want="${1:-}"
case "$want" in -h|--help) usage ;; esac

if [ -z "${ORKEON_WORKSHOP:-}" ] && [ -z "${CLAUDE_PROJECT_DIR:-}" ] && [ -d "$PWD/teams" ]; then
  root=$(harness_normalize_path "$PWD")
else
  root=$(harness_normalize_path "$(harness_workshop_root)")
fi
if [ ! -d "$root" ] || { [ ! -d "$root/teams" ] && [ ! -d "$root/.claude" ]; }; then
  fail "\`$root\` is not a workshop (no teams/ and no .claude/ there). Run it from the workshop, or set ORKEON_WORKSHOP."
fi
file="$root/.claude/local/language"
DEFAULT="none set: the conversation follows the user's messages, and files are written in English"
NOT_A_TAG="\`.claude/local/language\` is not a file that holds a language tag — it is ignored"

current=$(harness_workshop_language "$root"); state=$?

if [ "$#" -eq 0 ]; then
  case "$state" in
    0) echo "workshop-language: $current (\`.claude/local/language\`)." ;;
    2) echo "workshop-language: $NOT_A_TAG. Set a language (\`/workshop-language fr\`) or go back to the default (\`/workshop-language default\`)." ;;
    *) echo "workshop-language: $DEFAULT." ;;
  esac
  exit 0
fi

# A folder in the place of the file is the user's: neither removed nor written into.
if [ -d "$file" ] && [ ! -L "$file" ]; then
  fail "\`.claude/local/language\` is a folder in \`$root\`: nothing is changed. Move it aside, then set the language again."
fi

if [ "$want" = "default" ]; then
  if [ -e "$file" ] || [ -L "$file" ]; then
    rm -f -- "$file" 2>/dev/null || fail "\`.claude/local/language\` could not be removed in \`$root\`."
  fi
  echo "workshop-language: $DEFAULT. What is already written keeps its language."
  exit 0
fi

harness_language_tag_ok "$want" || fail "that is not a language tag: a language of 2 or 3 letters, then an optional script and an optional region (fr, de, pt-BR, zh-Hans) — or \`default\`."
# The language in lower case, as it is usually written; the script and the region as typed (pt-BR, zh-Hans).
case "$want" in
  *-*) tag="$(printf '%s' "${want%%-*}" | tr 'A-Z' 'a-z')-${want#*-}" ;;
  *)   tag="$(printf '%s' "$want" | tr 'A-Z' 'a-z')" ;;
esac

mkdir -p "$root/.claude/local" 2>/dev/null || fail "\`.claude/local/\` could not be created in \`$root\`."
# Beside the file, then renamed over it (never through a link, never into a folder): a session
# that starts meanwhile reads the old tag or the new one.
tmp="$file.$$.tmp"
if ! { printf '%s\n' "$tag" > "$tmp"; } 2>/dev/null || ! mv -fT -- "$tmp" "$file" 2>/dev/null; then
  rm -f -- "$tmp" 2>/dev/null
  fail "\`.claude/local/language\` could not be written in \`$root\`."
fi
if [ "$state" -eq 0 ] && [ "$tag" = "$current" ]; then
  echo "workshop-language: $tag, as before (\`.claude/local/language\`)."
else
  was=""
  [ "$state" -eq 0 ] && was=", was \`$current\`"
  echo "workshop-language: $tag (\`.claude/local/language\`$was). It applies from now on in this session, and to every session that starts in this workshop. What is already written keeps its language."
fi
exit 0
