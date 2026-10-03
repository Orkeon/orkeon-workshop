#!/bin/bash
# Shared helpers of the team-aware hooks: guard-phase.sh, run-gate.sh.
#
# A team is a folder `teams/<slug>/` of the workshop (plan § 3.2) and holds only what
# Orkeon Studio runs. What goes with it sits next to `teams/`, under the same slug
# (D29, D33): its workbook `workbooks/<slug>/`, its tests `tests/<slug>/` and its own
# Orkeon settings `settings/<slug>/appsettings.json`. The pilot
# teams follow the same layout under `library/examples/`. A C# tool built with the
# reduced process (plan § 3.3) lives under `library/tools/csharp/<Name>/` and keeps
# its `workbook/` and `tests/` inside: the fallback walks up to the nearest ancestor
# holding a `workbook/`.
#
# Frozen literals read here (FROZEN-LITERALS.md): `workbooks/<slug>/STATUS.md` and
# its front-matter key `phase:`; `workbooks/<slug>/attempts/ATT-nnnn/manifest.json`
# with `closed_at` null while the attempt is open; the settings files Orkeon reads for
# a team (harness_settings_kind). `orkeon-bench` parses the same files
# (bench/src/domain/status.ts, team-ref.ts, orkeon-configuration.ts, the doctor's
# `stray-settings`): a change there changes this file too.
#
# Sourced, not executed. Every function prints its answer on stdout and returns
# 1 when it has none.
set -u

# The workshop root: ORKEON_WORKSHOP (/workspace, set by the image), else the project Claude
# Code opened, else ~/Orkeon.
harness_workshop_root() {
  if [ -n "${ORKEON_WORKSHOP:-}" ]; then printf '%s' "${ORKEON_WORKSHOP%/}"
  elif [ -n "${CLAUDE_PROJECT_DIR:-}" ]; then printf '%s' "${CLAUDE_PROJECT_DIR%/}"
  else printf '%s' "${HOME:-/home/node}/Orkeon"
  fi
}

# Lexical normalisation of a path: `.` and `..` segments resolved, repeated
# slashes collapsed. No filesystem access, no symlink resolution. Without it
# `workbooks/x/../../tests/x/a.json` would be classified as a workbook write.
harness_normalize_path() {
  local p="$1" abs="" out="" seg rest
  case "$p" in /*) abs="/" ;; esac
  rest="$p"
  while [ -n "$rest" ]; do
    seg="${rest%%/*}"
    if [ "$seg" = "$rest" ]; then rest=""; else rest="${rest#*/}"; fi
    case "$seg" in
      ""|.) ;;
      ..)
        case "$out" in
          "") [ -n "$abs" ] || out=".." ;;
          ..|*/..) out="$out/.." ;;
          */*) out="${out%/*}" ;;
          *) out="" ;;
        esac ;;
      *) if [ -n "$out" ]; then out="$out/$seg"; else out="$seg"; fi ;;
    esac
  done
  printf '%s%s' "$abs" "$out"
}

# Is the folder $1 a workshop: the workshop root, or a folder holding `teams/` or
# `workbooks/` (the pilot teams of `library/examples/`, the fixtures of an eval)?
harness_is_workshop() {
  local w
  w=$(harness_normalize_path "$(harness_workshop_root)")
  [ "${1,,}" = "${w,,}" ] || [ -d "$1/teams" ] || [ -d "$1/workbooks" ]
}

# Team root of a path: the `teams/<slug>` folder it belongs to. A path under
# `teams/<slug>/` or `workbooks/<slug>/` names its team; one under `tests/<slug>/` or
# `settings/<slug>/` (the team's own Orkeon settings, D33) does when that team exists
# next to it (`teams/<slug>/` or `workbooks/<slug>/`): `tests/` and `settings/` are too
# common folder names to be trusted alone. With `settings` as $2, a `settings/<slug>/`
# of no team names `teams/<slug>` all the same when it lies in a workshop: the settings
# of the teams, which no subagent writes (D40). Of these segments, compared without
# regard to case (a Windows bind mount), the one that comes first in the path wins: a
# fixture shaped like a workshop stays in the tests that hold it
# (`tests/alpha/fixtures/teams/x/`), a design snapshot in its attempt
# (`workbooks/alpha/attempts/ATT-0001/design-snapshot/teams/alpha/`). Else the nearest
# ancestor holding a `workbook/`: a C# tool folder.
harness_team_root() {
  local p="$1" l="${1,,}" tree prefix base rest slug d i
  local -a found=()
  # Indexed by the offset of the segment: the array lists them in the order of the path.
  for tree in teams workbooks tests settings; do
    case "$l" in */"$tree"/*/*) ;; *) continue ;; esac
    prefix="${l%%/"$tree"/*}"
    found[${#prefix}]="$tree"
  done
  for tree in ${found[@]+"${found[@]}"}; do
    prefix="${l%%/"$tree"/*}"
    base="${p:0:${#prefix}}"
    rest="${p:$(( ${#prefix} + ${#tree} + 2 ))}"
    slug="${rest%%/*}"
    case "$tree" in
      teams)
        printf '%s%s' "${p:0:$(( ${#prefix} + 7 ))}" "$slug"
        return 0 ;;
      workbooks)
        printf '%s/teams/%s' "$base" "$slug"
        return 0 ;;
      tests|settings)
        if [ -d "$base/teams/$slug" ] || [ -d "$base/workbooks/$slug" ] \
           || { [ "$tree" = settings ] && [ "${2:-}" = settings ] && harness_is_workshop "$base"; }; then
          printf '%s/teams/%s' "$base" "$slug"
          return 0
        fi ;;
    esac
  done
  d=$(dirname "$p")
  i=0
  while [ "$d" != "/" ] && [ "$d" != "." ] && [ $i -lt 12 ]; do
    if [ -d "$d/workbook" ]; then
      printf '%s' "$d"
      return 0
    fi
    d=$(dirname "$d")
    i=$((i + 1))
  done
  return 1
}

# The workshop of a team root `<workshop>/teams/<slug>`; nothing for a C# tool folder.
harness_team_workshop() {
  local parent="${1%/*}"
  case "${parent##*/}" in
    [Tt][Ee][Aa][Mm][Ss]) printf '%s' "${parent%/*}" ;;
    *) return 1 ;;
  esac
}

# The workbook of a team root: `<workshop>/workbooks/<slug>` (D29), or the
# `workbook/` inside a C# tool folder.
harness_team_workbook() {
  local w
  if w=$(harness_team_workshop "$1"); then printf '%s/workbooks/%s' "$w" "${1##*/}"; else printf '%s/workbook' "$1"; fi
}

# The tests of a team root: `<workshop>/tests/<slug>` (D29), or the `tests/` inside
# a C# tool folder.
harness_team_tests() {
  local w
  if w=$(harness_team_workshop "$1"); then printf '%s/tests/%s' "$w" "${1##*/}"; else printf '%s/tests' "$1"; fi
}

# The folder of a team's own Orkeon settings: `<workshop>/settings/<slug>` (D33); nothing
# for a C# tool folder.
harness_team_settings() {
  local w
  w=$(harness_team_workshop "$1") || return 1
  printf '%s/settings/%s' "$w" "${1##*/}"
}

# How Orkeon reads the path $1 as settings, in one word; nothing (status 1) for any other
# path. No subagent writes these files (D33, D40); the main thread may, and the check
# scripts and `orkeon-bench doctor` (`stray-settings`) report a stray one afterwards.
#   team      under settings/<slug>/ of a team: its launchers, the bench and
#             orkeon-harness-run pass settings/<slug>/appsettings.json with --settings
#   settings  under settings/<slug>/ of no team yet, in a workshop: the same, once it exists
#   walk      appsettings/** or _shared/** in a team folder or its crew/, and any
#             appsettings/appsettings.json or _shared/appsettings.json elsewhere in the
#             workshop: the first one found walking up from a crew folder is the settings
#             file of a run that names none
#   crew      appsettings*.json in the crew/ of a team: crew/appsettings.json comes before
#             the walk
#   cwd       appsettings*.json in a team folder or the workshop root: no longer read by
#             a run of the crew (main at a2bb6c3), still by the CLI verbs anchored at the working
#             directory (--list-tools, doctor, email, mcp serve) and by a C# crew host
# Names compared without regard to case, as in harness_team_root.
harness_settings_kind() {
  local p="$1" l="${1,,}" team="" w="" s r root
  # Every kind names settings/, appsettings or _shared/: the other paths cost no lookup.
  case "$l" in */settings/*|*appsettings*|*/_shared/*) ;; *) return 1 ;; esac
  if team=$(harness_team_root "$p" settings 2>/dev/null) && w=$(harness_team_workshop "$team"); then
    s="$w/settings/${team##*/}"
    case "$l" in
      "${s,,}"/*)
        if [ -d "$w/teams/${team##*/}" ] || [ -d "$w/workbooks/${team##*/}" ]; then printf 'team'; else printf 'settings'; fi
        return 0 ;;
    esac
  else
    team=""; w=""
  fi
  root=$(harness_normalize_path "$(harness_workshop_root)")
  case "$l" in
    */appsettings/appsettings.json|*/_shared/appsettings.json)
      case "$l" in
        "${root,,}"/*) printf 'walk'; return 0 ;;
      esac
      if [ -n "$w" ]; then
        case "$l" in "${w,,}"/*) printf 'walk'; return 0 ;; esac
      fi ;;
    "${root,,}"/appsettings*.json)
      case "${l:$(( ${#root} + 1 ))}" in */*) ;; *) printf 'cwd'; return 0 ;; esac ;;
  esac
  [ -n "$w" ] || return 1
  case "$l" in "${team,,}"/*) ;; *) return 1 ;; esac
  r="${l:$(( ${#team} + 1 ))}"
  case "$r" in
    appsettings/*|_shared/*|crew/appsettings/*|crew/_shared/*) printf 'walk'; return 0 ;;
    */*/*) ;;
    crew/appsettings*.json) printf 'crew'; return 0 ;;
    */*) ;;
    appsettings*.json) printf 'cwd'; return 0 ;;
  esac
  return 1
}

# `phase:` of the YAML front matter of the team's STATUS.md. Prints nothing
# when the file, the front matter or the key is missing: the caller decides (no
# STATUS.md = no process yet). As tolerant as the bench's reader: a BOM, CRLF
# line ends, trailing blanks after `---`, quotes and a trailing `# comment`.
harness_status_phase() {
  local f
  f="$(harness_team_workbook "$1")/STATUS.md"
  [ -f "$f" ] || return 1
  LC_ALL=C awk -v BOM="$(printf '\357\273\277')" '
    { sub(/\r$/, "") }
    NR == 1 { if (substr($0, 1, 3) == BOM) $0 = substr($0, 4); if ($0 !~ /^---[ \t]*$/) exit; next }
    /^---[ \t]*$/ { exit }
    /^phase[ \t]*:/ {
      sub(/^phase[ \t]*:[ \t]*/, "")
      sub(/[ \t]+#.*$/, "")
      gsub(/["'"'"' \t]/, "")
      print
      exit
    }
  ' "$f"
}

# The open attempt of a team: the highest ATT-nnnn whose manifest.json has
# `closed_at` null (or no manifest yet). Prints its directory.
harness_open_attempt() {
  local wb d m
  wb=$(harness_team_workbook "$1")
  [ -d "$wb/attempts" ] || return 1
  for d in $(ls -1d "$wb"/attempts/ATT-*/ 2>/dev/null | sort -r); do
    d="${d%/}"
    m="$d/manifest.json"
    if [ ! -f "$m" ]; then printf '%s' "$d"; return 0; fi
    if command -v jq >/dev/null 2>&1 && jq -e '.closed_at == null' "$m" >/dev/null 2>&1; then
      printf '%s' "$d"
      return 0
    fi
  done
  return 1
}

# Is the attempt directory closed? True when manifest.json carries a non-null
# closed_at. An attempt without a manifest is treated as open.
harness_attempt_closed() {
  local m="$1/manifest.json"
  [ -f "$m" ] || return 1
  command -v jq >/dev/null 2>&1 || return 1
  jq -e '.closed_at != null' "$m" >/dev/null 2>&1
}
