#!/bin/bash
# bash-dispatch module — in a source checkout, the product runs from its sources, never from the
# image's install (D67).
#
# The image carries an `orkeon` built at its own commit (/usr/local/bin/orkeon, orkeon-update.sh).
# On a source profile the folder is a checkout of the product itself: a command that runs the
# image's binary tests the wrong code and nobody sees it, the two answer the same `--help`. Nothing
# is fixed here: the names and the replacement come from the repository pack, through two switches
# the profile writes into settings.local.json.
#
#   HARNESS_SOURCE_CLI_NAMES   space-separated names of the commands the image installs for the
#                              product (`orkeon`). Empty, the default: the module is off.
#   HARNESS_SOURCE_CLI         the command that runs the checkout's own build, typed from the top of
#                              the checkout (`dotnet run --project <csproj dir> --`); the refusal
#                              quotes it with the arguments of the refused command behind it. Empty:
#                              the refusal says to read the repository's own guide.
#
# A name is matched as the first word of a simple command: after `;`, `&&`, `||`, `|`, a newline,
# `$(` or a backtick; behind environment assignments and the usual prefixes (`rtk`, `rtk proxy`,
# `sudo`, `command`, `exec`, `time`, `nohup`, `env`); with or without a directory in front
# (`/usr/local/bin/orkeon`). `echo orkeon`, `which orkeon`, `orkeon-bench` and the checkout's own
# `dotnet run` pass: only the word is compared, no subprocess.
#
# Text that is not a command word is blanked before the split (2026-10-18; 12 false positives
# measured on heredocs): the body of a heredoc (`<<WORD`, `<<'WORD'`, `<<"WORD"`, `<<-WORD`, from
# the next line to the line that is exactly WORD), a `#` comment, and the separators inside a
# single- or double-quoted string or behind a backslash. `cat <<'EOF' > f.md` with a line
# `orkeon init x` in its body and `echo "a; orkeon init"` pass; a `$(...)` or a backtick inside
# double quotes is a real command and is still read, and so is the command after the heredoc.
#
# Contract: reads $HOOK_CMD, prints the hook JSON when it decides, nothing when it passes. A deny
# is terminal in the chain.
set -u

cmd="${HOOK_CMD:-}"
[ -n "$cmd" ] || exit 0
names="${HARNESS_SOURCE_CLI_NAMES:-}"
[ -n "$names" ] || exit 0

# Cheap gate before any parsing: no listed name anywhere in the command, nothing to do.
hit=0
# shellcheck disable=SC2086
for n in $names; do case "$cmd" in *"$n"*) hit=1; break ;; esac; done
[ "$hit" -eq 1 ] || exit 0

# Blanks what bash would not run as a command: heredoc bodies and comments are dropped, and the
# separators (`;&|`, newline, backtick, `$(`) inside quotes or behind a backslash become spaces, so
# the split below sees only the real ones. A stack of states: N (code), S ('...'), D ("..."),
# B (a backtick substitution); a `$(` pushes N with its parenthesis depth. POSIX awk (mawk).
# shellcheck disable=SC2016
SANITIZE='
function blank(ch) { return (ch ~ /[;&|`\n]/) ? " " : ch }
{ s = s $0 "\n" }
END {
  n = length(s); out = ""; sp = 0; st[0] = "N"; dep[0] = 0; nq = 0; i = 1
  while (i <= n) {
    c = substr(s, i, 1); nx = substr(s, i + 1, 1); cur = st[sp]
    if (cur == "S") {
      if (c == "\047") sp--
      else if (c == "$" && nx == "(") c = " "
      else c = blank(c)
      out = out c; i++; continue
    }
    if (c == "\\") { out = out c ((nx == "$") ? " " : blank(nx)); i += 2; continue }
    if (c == "$" && nx == "(") { st[++sp] = "N"; dep[sp] = 1; out = out "$("; i += 2; continue }
    if (cur == "D") {
      if (c == "\"") sp--
      else if (c == "`") st[++sp] = "B"
      else c = blank(c)
      out = out c; i++; continue
    }
    if (c == "\047") { st[++sp] = "S"; out = out c; i++; continue }
    if (c == "\"") { st[++sp] = "D"; out = out c; i++; continue }
    if (c == "`") { if (cur == "B") sp--; else st[++sp] = "B"; out = out c; i++; continue }
    if (sp > 0 && cur == "N") {
      if (c == "(") dep[sp]++
      else if (c == ")" && --dep[sp] == 0) sp--
    }
    if (c == "#" && (i == 1 || substr(s, i - 1, 1) ~ /[ \t\n;&|(]/)) {
      while (i <= n && substr(s, i, 1) != "\n") i++
      continue
    }
    if (c == "<" && nx == "<" && substr(s, i + 2, 1) == "<") { out = out "<<<"; i += 3; continue }
    if (c == "<" && nx == "<") {
      j = i + 2; strip = 0
      if (substr(s, j, 1) == "-") { strip = 1; j++ }
      while (substr(s, j, 1) ~ /[ \t]/) j++
      w = ""
      while (j <= n && substr(s, j, 1) !~ /[ \t\n;&|<>()]/) { w = w substr(s, j, 1); j++ }
      gsub(/[\047"\\]/, "", w)
      if (w != "") { q[++nq] = w; qs[nq] = strip }
      out = out substr(s, i, j - i); i = j; continue
    }
    out = out c; i++
    if (c == "\n" && nq > 0) {
      for (k = 1; k <= nq; k++) {
        while (i <= n) {
          e = index(substr(s, i), "\n"); if (e == 0) e = n - i + 2
          line = substr(s, i, e - 1); i += e
          if (qs[k]) sub(/^\t+/, "", line)
          if (line == q[k]) break
        }
      }
      nq = 0
    }
  }
  printf "%s", out
}'

found="" rest=""
while IFS= read -r segment; do
  [ -n "$segment" ] || continue
  # shellcheck disable=SC2086
  set -- $segment
  while [ $# -gt 0 ]; do
    case "$1" in
      [A-Za-z_]*=*) shift; continue ;;                     # VAR=value in front of the command
      rtk) shift; [ "${1:-}" = proxy ] && shift; continue ;;
      sudo|command|exec|time|nohup|env) shift; continue ;;
      \(*|\{*) set -- "${1#[({]}" "${@:2}"; [ -n "$1" ] || shift; continue ;;
    esac
    break
  done
  [ $# -gt 0 ] || continue
  word="${1##*/}"
  # shellcheck disable=SC2086
  for n in $names; do
    if [ "$word" = "$n" ]; then found="$n"; shift; rest="$*"; break 2; fi
  done
done < <(printf '%s\n' "$cmd" | awk "$SANITIZE" | sed 's/\$(/\n/g; s/`/\n/g' | tr ';&|' '\n\n\n')

[ -n "$found" ] || exit 0

replacement="${HARNESS_SOURCE_CLI:-}"
if [ -n "$replacement" ]; then
  how="From the top of the checkout: \`$replacement${rest:+ $rest}\`."
else
  how="The repository pack names no command for it: read the repository's own CLAUDE.md or contribution guide for the way its CLI is run from the sources."
fi
reason="guard-source-cli: the image's \`$found\` refused in a source checkout — this folder is the sources of the product, and \`$found\` on the PATH is the build the image carries at its own commit, not this code. $how Set by the repository pack: HARNESS_SOURCE_CLI_NAMES, HARNESS_SOURCE_CLI."

jq -n --arg r "$reason" \
  '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $r}}'
exit 0
