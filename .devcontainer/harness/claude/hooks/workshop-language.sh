#!/bin/bash
# SessionStart hook — tell the session which language this workshop works in.
#
# Plan § 3.2, § 7.3, D41. A workshop may name its language in `.claude/local/language` (one line,
# a language tag: `fr`, `de`, `pt-BR`), which `/workshop-language` writes. Without that file
# nothing changes: the conversation follows the language of the user's messages and files are
# written in English. With it, the conversation and the prose of the workbook are in that
# language, whatever the user types — a session that has only seen `/team-…` commands has no
# other way to know. What stays as the templates give it (headings, keys, ids, the journal, the
# hooks' messages) is `.claude/rules/workbook.md` § "Tone and language": this hook names the
# language and points there, it does not restate the rule.
#
# Runs for every source — `startup`, `resume`, `clear`, and `compact`, after which the summary
# may have lost the language. Silent when no language is set. A file that is not a regular file
# holding a tag — something else written by hand, a folder, a symbolic link — is said and
# ignored, and what it holds is never repeated (lib/team-common.sh, harness_workshop_language):
# only a tag reaches the context. HARNESS_WORKSHOP_LANGUAGE=0 stops this reminder and nothing
# else: the file and the rule still stand. The context starts with `workshop-language:`
# (a frozen literal, FROZEN-LITERALS.md).
set -uo pipefail

input=$(cat)
[ -n "$input" ] || exit 0
[ "${HARNESS_WORKSHOP_LANGUAGE:-1}" = "0" ] && exit 0
command -v jq >/dev/null 2>&1 || exit 0

event=$(printf '%s' "$input" | jq -r 'if type == "object" then (.hook_event_name // "") else "" end' 2>/dev/null) || exit 0
[ "$event" = "SessionStart" ] || exit 0

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/team-common.sh
. "$HERE/../lib/team-common.sh"
root=$(harness_normalize_path "$(harness_workshop_root)")

tag=$(harness_workshop_language "$root"); state=$?
case "$state" in
  0)
    context="workshop-language: this workshop works in \`$tag\` (\`.claude/local/language\`). Talk with the user in that language, whatever the language of their messages, and write the prose of the workbook in it. Headings, keys, ids, table headers, fixed words, the journal of STATUS.md and every string a script reads stay as the templates give them, in English: \`.claude/rules/workbook.md\` § \"Tone and language\" has the list. An artefact already written in another language keeps it unless the user asks for a translation. \`/workshop-language\` shows or changes the language." ;;
  2)
    context="workshop-language: \`.claude/local/language\` is not a file that holds a language tag (fr, de, pt-BR): it is ignored — the conversation follows the user's messages and files are written in English. Tell the user in one line; \`/workshop-language <tag>\` sets a language, \`/workshop-language default\` removes the file." ;;
  *) exit 0 ;;
esac
jq -n --arg c "$context" '{hookSpecificOutput: {hookEventName: "SessionStart", additionalContext: $c}}'
exit 0
