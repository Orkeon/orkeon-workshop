#!/bin/bash
# PreToolUse Bash hook — the budget gate in front of every team run.
#
# Plan § 2.7, § 4.3 (/team-run), § 6.4, § 7.3: a remote LLM is called only after
# an estimate, a cap and an explicit approval, and no hook ever launches a paid
# run. This hook cannot launch anything; it refuses what has not been approved,
# and logs every run it sees.
#
# Watched commands (FROZEN-LITERALS.md), every one of them in a compound command:
#   orkeon run <target> …          the shipped CLI
#   orkeon-harness-run <target> …  the harness runner that loads C# plugins (D6); same options
#   ./run.sh | run.cmd             the team launchers (they call one of the two above)
#   orkeon-bench run <team> …      the bench
#
# Kind of run:
#   validate  `--validate` or `--list-tools`; `orkeon-bench run --level L0|L1`:  -> allowed
#             no LLM is called
#   stub      `--profile stub`; `orkeon-bench run --level L2`: the simulated LLM  -> allowed
#   machine   no profile, or `--profile machine`, while the machine's LLM         -> allowed
#             target (below) is local
#   local     a named profile whose baseUrl in tests/<slug>/bench.config.json is  -> allowed
#             on a local host, while the machine's decision model (rule 4) is
#             local or absent
#   remote    a named profile otherwise — given by `--profile <name>`, or, for    -> allowed only with
#             `orkeon-bench run` without `--profile`, taken from                     an approval in the
#             `levels.e2e_local|e2e_remote.profile` of the levels the command        team's OPEN attempt
#             reaches (`--level L4`, or no `--level`: both; `--level L3`: local
#             only); or the machine profile when the machine's LLM target is
#             not local
#
# Approval: `workbooks/<slug>/attempts/<open ATT>/remote-approval.json` (D29), an object
# `{by, at, estimated_usd, cap_usd}` (or the same object under `remote_approval`
# in the attempt's manifest.json), `by` non-empty, `estimated_usd` and `cap_usd` JSON
# numbers of USD, 0 or more, estimated_usd <= cap_usd: a marker without both numbers
# approves nothing (fail closed). An approval in a closed attempt does not count.
# The gate is a tripwire against an unapproved or looping paid run, not a proof of
# who wrote the marker. The user approves by typing `/team-approve remote <usd>`;
# the hook team-approve.sh (D36) records the marker through `orkeon-bench attempt
# approve`, which alone writes it (D19) — never Claude, on its own initiative or
# from the shell (guard-phase.sh refuses Edit and Write on it).
#
# Every decision is appended to the run log (HARNESS_RUN_LOG, default
# <workshop>/.claude/run-log.tsv): time, session, decision, kind, team, command.
#
# Remote or not is ONE rule with two implementations — this hook and `llmTarget`
# of the bench (bench/src/domain/llm-target.ts and orkeon-configuration.ts, shown
# by `orkeon-bench profile <team> <name> --json` as `remote`). Change the two
# together; the eval file `bench-contract` compares them on the same settings.
# Checked on Orkeon `main` at 151a762 (D32): Orkeon reads no `Provider` key (it
# refuses one at start) — it infers the provider from the base URL alone when there is one, else the
# model name, then the key; a run has a default provider, the `Llm` section,
# when a key of it besides `Profiles` holds a non-blank value, else its offline
# echo provider; and every named profile `Llm:Profiles:<id>` is a provider of its
# own, which any agent of
# the crew may name (`llm: { profile: … }`, `.withProfile(…)`, `--llm-profile`,
# the RAG's `Orkeon:Rag:LlmProfile`) — so every one is judged, fail-closed: which
# profiles a crew names is not read (a script may compute the name).
#   1. a base URL decides alone: remote unless its host is local — `localhost`,
#      `::1`, any address of 127.0.0.0/8, `0.0.0.0`, `host.docker.internal`, or a
#      host of HARNESS_LOCAL_LLM_HOSTS (hosts only, no scheme and no port,
#      separated by commas or spaces, case-insensitive: a GPU box of the LAN);
#      a base URL that cannot be read is remote;
#   2. no base URL, but a default provider (or a named profile, which needs no
#      value to exist): Orkeon calls the endpoint of the provider it infers
#      (OpenAI's when nothing matches), not known to be local: remote;
#   3. no default provider and no named profile: the echo provider, not remote.
#   4. then, when no LLM is remote, the active decision provider
#      (RunnerHost.RegisterDecisionModels, DecisionProviderChoice, Orkeon main
#      at c727c06): TypeSafe (section Orkeon:TypeSafe, default
#      https://api.typesafe.ai/v1, key TYPESAFE_API_KEY), Liquid (Orkeon:Liquid,
#      https://api.liquid.ai/decisions/v1, LIQUID_API_KEY) or Kev (Orkeon:Kev,
#      http://127.0.0.1:8009/v1). Orkeon:Decision:Provider (typesafe|liquid|kev,
#      any case) names it, any other value refuses the start; unnamed, it is
#      deduced from the hosted ones alone — a section present in any layer
#      below (a key named so or below it, an empty object or a null included,
#      R-64), else a non-empty TYPESAFE_API_KEY or LIQUID_API_KEY (environment
#      or the command's assignments); two candidates refuse the start; Kev is
#      never deduced. A refused start is treated as remote, `(decision-model)`
#      (decision_model_remote). Its decision tasks, the system_one_decide tool
#      and the input guard then call it: remote unless its BaseUrl of the
#      highest layer holding the key is on a local host — unset, blank or null,
#      the provider's default; a value with keys below it only is not known to
#      be local. `--no-decision`
#      does not turn this off: it switches off the decision tasks alone
#      (DecisionCircuit.Off), while the tool and the guard still call the model,
#      so the gate stays fail-closed on it.
# The run is remote when the default, any named profile or the decision model is.
# A deny names the case in the words of the bench (`remote_reason`):
# `remote-host`, `unreadable-base-url`, `no-base-url`, `decision-model`.
# A named bench profile is judged on its own `baseUrl` (rule 1): the bench injects
# it over the default and over every named profile of the run, as it injects the
# stub; over the decision model it injects only the decision block of the level
# in bench.config.json (D96, `orkeon-bench run` alone: ORKEON_Orkeon__Decision__Provider
# and the provider's BaseUrl, Model, ApiKeyEnvVar), so the run of a local one is
# judged on the machine's (rule 4) with that block laid over it. The stub's run carries none: the bench strips
# its variables and its section (stubRunVariables, stubSettings), and
# `orkeon run --profile stub` is no Orkeon option. The machine profile is judged on what Orkeon will see for the run, its
# layers highest first (the working directory's appsettings files and the
# DOTNET_ variables are no longer read):
#   a. the ORKEON_Llm__* (and ORKEON_Orkeon__{TypeSafe,Liquid,Kev,Decision}__*) variables: an
#      assignment in the command (in front of the
#      run, or exported earlier in it), then the environment of the session;
#   b. the settings file `orkeon run` resolves for the crew folder: `--settings`,
#      else crew/appsettings.json, else the first appsettings/appsettings.json
#      (or legacy _shared/appsettings.json) walking up from the crew folder,
#      stopping after a folder holding Orkeon.Examples.sln, else the user's
#      file ${XDG_CONFIG_HOME:-~/.config}/Orkeon/appsettings.json
#      (HARNESS_ORKEON_SETTINGS names another one). The team's own settings,
#      settings/<slug>/appsettings.json two levels above the team folder (D33),
#      stand for `--settings` when the file exists and the command names no other
#      settings file, for a launcher written since D33 (its run.sh says so), the
#      bench, and orkeon-harness-run on a team it finds by its mounts.json — they
#      pass it; an older run.sh and a bare `orkeon run` do not;
#   c. the Llm__* (and Orkeon__{TypeSafe,Liquid,Kev,Decision}__*) variables, without a prefix.
# Variable names match case-insensitively, as in .NET. The base URL of a provider
# is that of the highest layer setting one; the default exists when any layer
# gives it a value, a named profile when any layer names it.
# The launchers and the bench run `orkeon run` on <team>/crew from the team
# folder; `orkeon run <target>` starts from its target and the command's folder.
# The image writes the user's file for Ollama on port 11434 of the machine, in
# host mode too (a forwarder on 127.0.0.1). A settings file that cannot be read
# as JSON — comments included, which Orkeon accepts — leaves the target unknown:
# remote. HARNESS_RUN_GATE_READ_SETTINGS=0 stops the hook from reading files;
# the rule then applies to the variables alone.
#
# The bench reads the host with a URL parser; this hook reads it literally and
# fails closed. A spelling the parser would normalise to a local host (`127.1`,
# `2130706433`, `0x7f.0.0.1`, a percent-encoded name) is remote here: the gate
# may refuse such a run where the bench would not, never the reverse.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/team-common.sh
. "$HERE/../lib/team-common.sh"

input=$(cat)
[ -n "$input" ] || exit 0
# Bail out on the raw payload before any parsing: this hook runs on every Bash
# call and nearly none of them is a team run.
case "$input" in *orkeon*|*run.sh*|*run.cmd*) ;; *) exit 0 ;; esac
# A source space (D49) holds no team: nothing to judge there.
[ "$(harness_space)" = source ] && exit 0
command -v jq >/dev/null 2>&1 || exit 0

PARSED=$(printf '%s' "$input" | jq -j '([(.tool_name // ""), (.session_id // "unknown"), (.cwd // "")] | join("\u001f")) + "\u001e" + (.tool_input.command // "")' 2>/dev/null) || exit 0
IFS=$'\x1f' read -r tool_name session_id cwd <<<"${PARSED%%$'\x1e'*}"
cmd="${PARSED#*$'\x1e'}"

[ "$tool_name" = "Bash" ] || exit 0
[ -n "$cmd" ] || exit 0
case "$cmd" in *orkeon*|*run.sh*|*run.cmd*) ;; *) exit 0 ;; esac

[ -n "$cwd" ] || cwd=$(pwd)
WORKSHOP=$(harness_workshop_root)
LOG="${HARNESS_RUN_LOG:-$WORKSHOP/.claude/run-log.tsv}"

resolve() { # $1 base, $2 path -> absolute path, no symlink resolution
  local base="$1" p="$2"
  case "$p" in
    /*) printf '%s' "${p%/}" ;;
    "~"|"~/"*) printf '%s%s' "${HOME:-}" "${p#"~"}" ;;
    .|./) printf '%s' "${base%/}" ;;
    ./*) printf '%s/%s' "${base%/}" "${p#./}" ;;
    *) printf '%s/%s' "${base%/}" "${p%/}" ;;
  esac
}

# Host of a base URL, lowercased, an IPv6 literal out of its brackets. Prints
# nothing when the value is not [scheme://][credentials@]host[:port][/…]: the
# caller treats that as remote. The credentials end at the last `@`. A value
# holding a backslash is not read at all: the shell drops it from an unquoted
# assignment and URL parsers take it for a slash, so the text the hook sees and
# the host Orkeon would call can differ (`localhost\@api.example.com`).
host_of() {
  local h="$1"
  h="${h#"${h%%[![:space:]]*}"}"
  h="${h%"${h##*[![:space:]]}"}"
  case "$h" in *\\*) return 0 ;; esac
  h=$(printf '%s' "$h" | sed -E -e 's#^[a-zA-Z][a-zA-Z0-9+.-]*://##' -e 's|[/?#].*$||' -e 's|^.*@||')
  local port=""
  if [[ "$h" =~ ^\[([0-9A-Fa-f:.]+)\](:([0-9]{0,5}))?$ ]]; then
    h="${BASH_REMATCH[1]}"; port="${BASH_REMATCH[3]}"
  elif [[ "$h" =~ ^([^]:@[[:space:]]+)(:([0-9]{0,5}))?$ ]]; then
    h="${BASH_REMATCH[1]}"; port="${BASH_REMATCH[3]}"
  else
    return 0
  fi
  [ -z "$port" ] || [ "$((10#$port))" -le 65535 ] || return 0
  printf '%s' "${h,,}"
}

is_local_host() { # $1 base URL
  local host extra
  local -a extras=()
  host=$(host_of "$1")
  [ -n "$host" ] || return 1
  case "$host" in
    localhost|::1|0.0.0.0|host.docker.internal) return 0 ;;
  esac
  [[ "$host" =~ ^127(\.(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])){3}$ ]] && return 0
  if [ -n "${HARNESS_LOCAL_LLM_HOSTS:-}" ]; then
    IFS=$', \t\n' read -r -d '' -a extras <<<"${HARNESS_LOCAL_LLM_HOSTS}" || true
    # Hosts only: an entry carrying a scheme or a port matches nothing.
    for extra in ${extras[@]+"${extras[@]}"}; do
      extra="${extra,,}"
      case "$extra" in \[*\]) extra="${extra#[}"; extra="${extra%]}" ;; esac
      [ "$extra" = "$host" ] && return 0
    done
  fi
  return 1
}

trim() {
  local s="$1"
  s="${s#"${s%%[![:space:]]*}"}"
  printf '%s' "${s%"${s##*[![:space:]]}"}"
}

# The variables a run sees whose name matches the ERE $1, case-insensitively as
# .NET matches them, one NAME=VALUE per line: the session's environment, then the
# command's assignments (RUN_ASSIGNS), which replace a variable of the same name.
run_vars() {
  local re="^($1)=" entry name
  local -A value=()
  local -a order=()
  shopt -s nocasematch
  while IFS= read -r -d '' entry; do
    [[ "$entry" =~ $re ]] || continue
    name="${entry%%=*}"
    [ -n "${value[$name]+set}" ] || order+=("$name")
    value[$name]="${entry#*=}"
  done < <(env -0; printf '%s\n' "$RUN_ASSIGNS" | tr '\n' '\0')
  shopt -u nocasematch
  for name in ${order[@]+"${order[@]}"}; do
    printf '%s=%s\n' "$name" "${value[$name]}"
  done
}

# The settings file `orkeon run` resolves (RunnerSettings.ResolveSettingsPath):
# the --settings value $2 (nothing when it does not exist); else
# appsettings.json next to the crew folder $1; else the first
# appsettings/appsettings.json, or legacy _shared/appsettings.json, walking up
# from the crew folder and stopping after a folder holding Orkeon.Examples.sln;
# else the user's file, ${XDG_CONFIG_HOME:-~/.config}/Orkeon/appsettings.json,
# which HARNESS_ORKEON_SETTINGS replaces.
resolved_settings() {
  local d="$1" f
  if [ -n "$2" ]; then
    [ -f "$2" ] && printf '%s' "$2"
    return 0
  fi
  [ -n "$d" ] && [ -f "$d/appsettings.json" ] && { printf '%s' "$d/appsettings.json"; return 0; }
  while [ -n "$d" ]; do
    for f in "${d%/}/appsettings/appsettings.json" "${d%/}/_shared/appsettings.json"; do
      [ -f "$f" ] && { printf '%s' "$f"; return 0; }
    done
    [ -f "${d%/}/Orkeon.Examples.sln" ] && break
    [ "$d" = "/" ] && break
    d=$(dirname "$d")
  done
  f="${HARNESS_ORKEON_SETTINGS:-${XDG_CONFIG_HOME:-${HOME:-}/.config}/Orkeon/appsettings.json}"
  [ -f "$f" ] && printf '%s' "$f"
  return 0
}

# One settings file as the main binary reads it, flattened to `:`-separated keys
# (an empty object or a null keeps the key without a value, an empty array holds
# ""), one record per line: `C<TAB>1` or `C<TAB>0` (does a key of Llm besides
# Profiles hold a non-blank value: the default provider exists), then `B<TAB>url`
# for each non-blank string Llm:BaseUrl, `P<TAB>id` for each named profile under
# Llm:Profiles and `PB<TAB>id<TAB>url` for its non-blank BaseUrl; for each
# decision provider p (typesafe, liquid, kev), `S<TAB>p` when the section
# Orkeon:<p> is present as DecisionProviderChoice.HasSection reads it (any key
# named Orkeon:<p> or below it — an empty object and a null count, R-64), and
# `SB<TAB>p<TAB>url` for each Orkeon:<p>:BaseUrl holding a value of its own:
# empty when blank or null (Orkeon then binds the provider's default), the text
# of a scalar, `<unbindable>` when the key only has keys below it; `DP<TAB>name`
# for each Orkeon:Decision:Provider holding a value of its own (empty when blank
# or null). Fails when the file is not JSON.
file_layer() {
  jq -r '
    def kids: if type == "object" then to_entries else [range(length) as $i | {key: ($i | tostring), value: .[$i]}] end;
    def flat($p):
      if type == "object" or type == "array" then
        kids as $k
        | if ($k | length) == 0 then (if $p == "" then empty elif type == "array" then {k: $p, v: ""} else {k: $p, empty: true} end)
          else $k[] | .key as $n | .value | flat(if $p == "" then $n else "\($p):\($n)" end) end
      elif $p == "" then empty
      elif . == null then {k: $p, empty: true}
      else {k: $p, v: .}
      end;
    def clean: tostring | gsub("[\u0000-\u001f]"; "") | gsub("^\\s+|\\s+$"; "");
    def url: select(type == "string") | clean | select(length > 0);
    [flat("")] as $e
    | ([$e[] | select(.empty | not) | (.k | ascii_downcase) as $key
        | select(($key | startswith("llm:")) and ($key | test("^llm:profiles(:|$)") | not))
        | select(.v != null and (.v | clean | length) > 0)] | length > 0) as $conf
    | "C\t\(if $conf then 1 else 0 end)",
      ($e[] | select((.k | ascii_downcase) == "llm:baseurl") | .v | url | "B\t\(.)"),
      ([$e[] | .k | split(":") | select(length >= 3 and (.[0] | ascii_downcase) == "llm" and (.[1] | ascii_downcase) == "profiles") | .[2] | clean]
        | reduce .[] as $id ([]; if any(.[]; ascii_downcase == ($id | ascii_downcase)) then . else . + [$id] end) | .[] | "P\t\(.)"),
      ($e[] | (.k | split(":")) as $p
        | select(($p | length) == 4 and ($p[0] | ascii_downcase) == "llm" and ($p[1] | ascii_downcase) == "profiles" and ($p[3] | ascii_downcase) == "baseurl")
        | .v | url | "PB\t\($p[2] | clean)\t\(.)"),
      (("typesafe", "liquid", "kev") as $p
      | ("orkeon:\($p)") as $s
      | (([$e[] | (.k | ascii_downcase) as $key | select($key == $s or ($key | startswith("\($s):")))] | if length > 0 then "S\t\($p)" else empty end),
         ($e[] | select((.k | ascii_downcase) == "\($s):baseurl")
           | "SB\t\($p)\t\(if .empty then "" else (.v | clean) end)"),
         ([$e[] | select((.k | ascii_downcase) | startswith("\($s):baseurl:"))] | if length > 0 then "SB\t\($p)\t<unbindable>" else empty end))),
      ($e[] | select((.k | ascii_downcase) == "orkeon:decision:provider")
        | "DP\t\(if .empty then "" else (.v | clean) end)")' "$1" 2>/dev/null
}

# Prints why one base URL ($1, named $2 in a message) is remote, with $3 appended
# to the message; returns 1 when it is local.
url_remote() {
  is_local_host "$1" && return 1
  if [ -n "$(host_of "$1")" ]; then
    printf '%s points off-host%s (remote-host: %s)' "$2" "$3" "$(host_of "$1")"
  else
    printf '%s cannot be read as a URL%s, so the LLM target is not known to be local (unreadable-base-url)' "$2" "$3"
  fi
  return 0
}

# Prints why the machine profile is remote; returns 1 when it is not. The rule of
# the header, over the layers of Orkeon's configuration for a run whose crew
# folder is $1 and --settings value $2: the default provider, then every named
# profile (Llm:Profiles:<id>), since any agent of the crew may name one. A base
# URL is judged by its first non-local value in the highest layer that sets one;
# an API key is never read out. Then the decision model (rule 4). With $3 =
# `decision`, the decision model alone: a named bench profile replaces the LLMs
# of the run, not its decision model.
machine_target_remote() {
  local crew="$1" explicit="$2" mode="${3:-}"
  local -a layers=() labels=() urls=() configured_by=() records=() profile_order=()
  local layer prefix line name value f i rest id key lid kind1 found="" dp found_dp=""
  # The decision providers (rule 4), gathered over the layers: dm_sec[p] the
  # sources holding the section Orkeon:<p>, dm_urls[p]/dm_labels[p] the BaseUrl
  # values of the highest layer holding the key (US-separated), dm_provider and
  # dm_provider_labels the Orkeon:Decision:Provider values of the highest layer
  # holding that key.
  local -A dm_sec=() dm_urls=() dm_labels=() l_sec=() l_urls=() l_labels=()
  local -a dm_provider=() dm_provider_labels=() l_prov=() l_prov_labels=()
  local -A parsed=() profile_url=() profile_label=() profile_src=() profile_name=()

  # The layers, highest precedence first: a variable layer is named by its
  # prefix, a file by its path. Every file is read before anything is judged: one
  # that is not JSON leaves the target unknown.
  layers=("var:ORKEON_")
  if [ "${HARNESS_RUN_GATE_READ_SETTINGS:-1}" = "1" ]; then
    f=$(resolved_settings "$crew" "$explicit")
    [ -n "$f" ] && layers+=("file:$f")
  fi
  layers+=("var:")
  for layer in "${layers[@]}"; do
    case "$layer" in
      file:*)
        f="${layer#file:}"
        if ! parsed[$f]=$(file_layer "$f"); then
          printf 'the Orkeon settings %s cannot be read as JSON (Orkeon would not start either), so the LLM target is not known to be local' "$f"
          return 0
        fi ;;
    esac
  done

  # Notes a named profile: $1 its name as spelled, $2 the source, $3 a base URL
  # (may be empty) and $4 its label. The highest layer setting a base URL wins.
  note_profile() {
    local lid
    lid=$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')
    if [ -z "${profile_name[$lid]+set}" ]; then
      profile_name[$lid]="$1"; profile_src[$lid]="$2"; profile_order+=("$lid")
    fi
    if [ -n "$3" ] && [ -z "${profile_url[$lid]+set}" ]; then
      profile_url[$lid]="$3"; profile_label[$lid]="$4"
    fi
  }

  for layer in "${layers[@]}"; do
    labels=(); urls=()
    case "$layer" in
      var:*)
        prefix="${layer#var:}"
        while IFS= read -r line; do
          [ -n "$line" ] || continue
          name="${line%%=*}"; value=$(trim "${line#*=}")
          shopt -s nocasematch
          if [[ "$name" =~ ^${prefix}LLM(__|:)PROFILES(__|:)(.+)$ ]]; then
            rest="${BASH_REMATCH[3]//:/__}"; id="${rest%%__*}"; key="${rest#"$id"}"; key="${key#__}"
            if [ -n "$id" ]; then
              if [[ "$key" =~ ^BASEURL$ ]] && [ -n "$value" ]; then
                note_profile "$id" "$name" "$value" "$name=$(printf '%s' "$value" | redact)"
              else
                note_profile "$id" "$name" "" ""
              fi
            fi
          elif [[ "$name" =~ ^${prefix}LLM(__|:).+ ]] && [ -n "$value" ]; then
            configured_by+=("$name")
            if [[ "$name" =~ ^${prefix}LLM(__|:)BASEURL$ ]]; then
              labels+=("$name=$(printf '%s' "$value" | redact)"); urls+=("$value")
            fi
          fi
          shopt -u nocasematch
        done < <(run_vars "${prefix}LLM((__|:)[^=]*)?")
        # The decision providers: a variable of a section makes it present, even
        # empty (an environment provider holds empty variables too).
        l_sec=(); l_urls=(); l_labels=(); l_prov=(); l_prov_labels=()
        while IFS= read -r line; do
          [ -n "$line" ] || continue
          name="${line%%=*}"; value=$(trim "${line#*=}")
          shopt -s nocasematch
          if [[ "$name" =~ ^${prefix}ORKEON(__|:)DECISION(__|:)PROVIDER$ ]]; then
            l_prov+=("$value"); l_prov_labels+=("$name")
          elif [[ "$name" =~ ^${prefix}ORKEON(__|:)(TYPESAFE|LIQUID|KEV)((__|:).*)?$ ]]; then
            dp="${BASH_REMATCH[2],,}"
            l_sec[$dp]="${prefix}Orkeon__${DM_NAME[$dp]}__* variables"
            if [[ "$name" =~ ^${prefix}ORKEON(__|:)[A-Z]+(__|:)BASEURL$ ]]; then
              l_urls[$dp]+="$value"$'\x1f'
              l_labels[$dp]+="$name=$(printf '%s' "$value" | redact)"$'\x1f'
            fi
          fi
          shopt -u nocasematch
        done < <(run_vars "${prefix}ORKEON(__|:)((TYPESAFE|LIQUID|KEV)((__|:)[^=]*)?|DECISION(__|:)PROVIDER)") ;;
      file:*)
        f="${layer#file:}"
        l_sec=(); l_urls=(); l_labels=(); l_prov=(); l_prov_labels=()
        mapfile -t records <<<"${parsed[$f]}"
        for line in ${records[@]+"${records[@]}"}; do
          kind1="${line%%$'\t'*}"; rest="${line#*$'\t'}"
          case "$kind1" in
            C) [ "$rest" = "1" ] && configured_by+=("$f") ;;
            B) labels+=("Llm:BaseUrl in $f"); urls+=("$rest") ;;
            P) note_profile "$rest" "$f" "" "" ;;
            PB) id="${rest%%$'\t'*}"; note_profile "$id" "$f" "${rest#*$'\t'}" "Llm:Profiles:$id:BaseUrl in $f" ;;
            S) l_sec[$rest]="$f" ;;
            SB) dp="${rest%%$'\t'*}"
                l_urls[$dp]+="${rest#*$'\t'}"$'\x1f'
                l_labels[$dp]+="Orkeon:${DM_NAME[$dp]}:BaseUrl in $f"$'\x1f' ;;
            DP) l_prov+=("$rest"); l_prov_labels+=("$f") ;;
          esac
        done ;;
    esac
    # A decision provider's base URL, and the provider's name: those of the
    # highest layer holding the key, whatever its value (.NET's indexer).
    for dp in "${!l_sec[@]}"; do
      dm_sec[$dp]+="${dm_sec[$dp]:+, }${l_sec[$dp]}"
    done
    for dp in "${!l_urls[@]}"; do
      [ -n "${dm_urls[$dp]+set}" ] || { dm_urls[$dp]="${l_urls[$dp]}"; dm_labels[$dp]="${l_labels[$dp]}"; }
    done
    if [ -z "$found_dp" ] && [ "${#l_prov[@]}" -gt 0 ]; then
      found_dp=1; dm_provider=("${l_prov[@]}"); dm_provider_labels=("${l_prov_labels[@]}")
    fi
    [ "$mode" != "decision" ] || continue
    # 1. a base URL decides alone for the default — of several spellings of one
    #    variable, the first that is not local, since .NET does not define which
    #    one wins.
    [ -z "$found" ] && [ "${#urls[@]}" -gt 0 ] || continue
    found=1
    for ((i = 0; i < ${#urls[@]}; i++)); do
      url_remote "${urls[$i]}" "${labels[$i]}" "" && return 0
    done
  done

  # 2. no base URL, but a default provider: Orkeon infers the provider and calls
  #    that provider's endpoint.
  [ "$mode" != "decision" ] || { decision_model_remote; return; }
  if [ -z "$found" ] && [ "${#configured_by[@]}" -gt 0 ]; then
    printf "Orkeon finds a default provider in its Llm section (%s) and no BaseUrl: it infers the provider from the model name, then the key, and calls that provider's endpoint — OpenAI's when nothing matches — so the target is not known to be local (no-base-url)" \
      "$(printf '%s\n' "${configured_by[@]}" | paste -sd, - | sed 's/,/, /g')"
    return 0
  fi
  # 3. no default provider: the echo provider, for every agent naming no profile.
  # Then every named profile, judged like the default: any agent may name it.
  for lid in ${profile_order[@]+"${profile_order[@]}"}; do
    if [ -n "${profile_url[$lid]+set}" ]; then
      url_remote "${profile_url[$lid]}" "${profile_label[$lid]}" ", a named profile any agent of the crew may name" && return 0
    else
      printf "the named profile Llm:Profiles:%s (%s) has no BaseUrl: Orkeon infers its provider from its model name, then its key, and calls that provider's endpoint, and any agent of the crew may name it — so the target is not known to be local (no-base-url)" \
        "${profile_name[$lid]}" "${profile_src[$lid]}"
      return 0
    fi
  done
  decision_model_remote
}

# The decision providers of Orkeon (DecisionProviderDescriptor, DecisionProviderDefaults):
# display name, default API root, the key variable whose value deduces it. Kev is
# not hosted: it is never deduced, only named.
declare -A DM_NAME=([typesafe]=TypeSafe [liquid]=Liquid [kev]=Kev)
declare -A DM_DEFAULT_URL=([typesafe]="https://api.typesafe.ai/v1" [liquid]="https://api.liquid.ai/decisions/v1" [kev]="http://127.0.0.1:8009/v1")
declare -A DM_KEY_VAR=([typesafe]=TYPESAFE_API_KEY [liquid]=LIQUID_API_KEY [kev]=KEV_API_KEY)
DM_HOSTED="typesafe liquid"
DM_CALLS=": decision tasks, the system_one_decide tool and the input guard call it, and --no-decision stops only the decision tasks"

# Rule 4, over what machine_target_remote gathered: prints why the decision model
# makes the run remote; returns 1 when the run has none or it is local. The active
# provider is resolved as DecisionProviderChoice.Resolve does: the
# Orkeon:Decision:Provider of the highest layer holding it names one (typesafe,
# liquid or kev, any case, trimmed); blank, it is deduced from the hosted
# providers alone — a present section Orkeon:TypeSafe or Orkeon:Liquid first
# (an empty object or a null counts, R-64), else a non-empty TYPESAFE_API_KEY or
# LIQUID_API_KEY (the default variables: an ApiKeyEnvVar override is a key of
# the section, which then counts by itself). Kev is never deduced: its section
# without the name is unused. Fail-closed where Orkeon refuses to start — a name
# it does not know, two hosted candidates at the same step: the gate cannot tell
# which provider a fixed settings file would run, so it treats the run as remote
# under `(decision-model)` rather than let the refusal stand in for a local
# verdict. Of several spellings of the name in one layer, each is judged and the
# run is remote when one of them is.
decision_model_remote() {
  local v lc cand seen="" i
  local -A dm_key=()
  for cand in $DM_HOSTED; do
    while IFS= read -r line; do
      [ -n "${line#*=}" ] && { dm_key[$cand]="${line%%=*}"; break; }
    done < <(run_vars "${DM_KEY_VAR[$cand]}")
  done
  if [ "${#dm_provider[@]}" -eq 0 ]; then
    decision_deduced_remote
    return
  fi
  for ((i = 0; i < ${#dm_provider[@]}; i++)); do
    v="${dm_provider[$i]}"; lc="${v,,}"
    case " $seen " in *" $lc "*) continue ;; esac
    seen+=" $lc"
    if [ -z "$lc" ]; then
      decision_deduced_remote && return 0
    elif [ -n "${DM_NAME[$lc]+set}" ]; then
      decision_provider_remote "$lc" "$(decision_named_by "$i")" && return 0
    else
      printf "Orkeon:Decision:Provider is '%s' (%s), a name Orkeon refuses at start (valid: typesafe, liquid, kev); the gate does not know which decision provider the run would call, so it treats the run as remote (decision-model)" \
        "$v" "$(decision_named_by "$i")"
      return 0
    fi
  done
  return 1
}

# Where the provider name $1 (an index of dm_provider) comes from: a variable
# (`NAME=value`) or a settings file (`Orkeon:Decision:Provider = value in <file>`).
decision_named_by() {
  local src="${dm_provider_labels[$1]}"
  case "$src" in
    */*) printf 'Orkeon:Decision:Provider = %s in %s' "${dm_provider[$1]}" "$src" ;;
    *) printf '%s=%s' "$src" "${dm_provider[$1]}" ;;
  esac
}

# The deduction of DecisionProviderChoice.Resolve: prints why the deduced
# provider is remote, or why the start is refused (two candidates, fail-closed).
decision_deduced_remote() {
  local cand by
  local -a found=() labels=()
  for cand in $DM_HOSTED; do
    [ -n "${dm_sec[$cand]+set}" ] && { found+=("$cand"); labels+=("${dm_sec[$cand]}"); }
  done
  if [ "${#found[@]}" -eq 0 ]; then
    for cand in $DM_HOSTED; do
      [ -n "${dm_key[$cand]+set}" ] && { found+=("$cand"); labels+=("${dm_key[$cand]}"); }
    done
  fi
  case "${#found[@]}" in
    0) return 1 ;;
    1) decision_provider_remote "${found[0]}" "${labels[0]}"; return ;;
  esac
  printf "both decision providers %s (%s) and %s (%s) are configured and Orkeon:Decision:Provider names neither: Orkeon refuses to start, and the gate does not know which one a run that names one would call, so it treats the run as remote (decision-model)" \
    "${DM_NAME[${found[0]}]}" "${labels[0]}" "${DM_NAME[${found[1]}]}" "${labels[1]}"
  return 0
}

# Prints why the decision provider $1, configured by $2, is remote; returns 1 when
# its base URL is on a local host. The base URL is that of the highest layer
# holding the key, of several spellings the first not local; unset, blank or
# null, the provider's default (DecisionProviderDescriptor.FillBlanks); a value
# with keys below it only cannot be bound: no host.
decision_provider_remote() {
  local p="$1" by="$2" url label host i
  local -a urls=() labels=()
  if [ -n "${dm_urls[$p]+set}" ]; then
    mapfile -t -d $'\x1f' urls < <(printf '%s' "${dm_urls[$p]}")
    mapfile -t -d $'\x1f' labels < <(printf '%s' "${dm_labels[$p]}")
  else
    urls=(""); labels=("its default endpoint ${DM_DEFAULT_URL[$p]}")
  fi
  for ((i = 0; i < ${#urls[@]}; i++)); do
    url="${urls[$i]}"; label="${labels[$i]:-}"
    if [ -z "$url" ]; then
      url="${DM_DEFAULT_URL[$p]}"
      [ -n "${dm_urls[$p]+set}" ] && label="$label (blank: the default endpoint $url)"
    fi
    host=""
    if [ "$url" != "<unbindable>" ]; then
      is_local_host "$url" && continue
      host=$(host_of "$url")
    fi
    if [ -n "$host" ]; then
      printf 'the decision model %s is configured (%s) and %s points off-host%s (decision-model: %s)' "${DM_NAME[$p]}" "$by" "$label" "$DM_CALLS" "$host"
    else
      printf 'the decision model %s is configured (%s) and %s cannot be read as a URL, so it is not known to be local%s (decision-model)' "${DM_NAME[$p]}" "$by" "$label" "$DM_CALLS"
    fi
    return 0
  done
  return 1
}

# `ok` | `over` | `none` | `invalid <fields>` for the attempt directory $1. Only a
# JSON number of 0 or more counts as an amount: a string, a missing key or a
# negative value makes the approval invalid, never approved.
approval_state() {
  local a="$1" src="" filter="."
  if [ -f "$a/remote-approval.json" ] && jq -e 'type == "object"' "$a/remote-approval.json" >/dev/null 2>&1; then
    src="$a/remote-approval.json"
  elif [ -f "$a/manifest.json" ] && jq -e '(.remote_approval | type) == "object"' "$a/manifest.json" >/dev/null 2>&1; then
    src="$a/manifest.json"; filter=".remote_approval"
  fi
  [ -n "$src" ] || { printf 'none'; return; }
  jq -j "$filter
    | [\"estimated_usd\", \"cap_usd\"] as \$amounts
    | [\$amounts[] as \$k | select((.[\$k] | type) != \"number\" or .[\$k] < 0) | \$k] as \$bad
    | if (.by | type) != \"string\" or (.by | length) == 0 then \"none\"
      elif (\$bad | length) > 0 then \"invalid \" + (\$bad | join(\" and \"))
      elif .estimated_usd <= .cap_usd then \"ok\"
      else \"over\" end" "$src" 2>/dev/null || printf 'none'
}

# No key on disk, the run log included: the value of an inline credential
# (`ORKEON_Llm__ApiKey=…`, `…_KEY=`, `…_TOKEN=`, `…_SECRET=`, `…_PASSWORD=`,
# `…_PAT=`) and the credentials of a URL are replaced; a `$VARIABLE` reference
# is kept, it is not a secret.
redact() {
  sed -E \
    -e 's/(([A-Za-z_][A-Za-z0-9_]*)?([Aa][Pp][Ii]_?[Kk][Ee][Yy]|_KEY|_TOKEN|_SECRET|_PASSWORD|_PAT)=)("[^"$]+"|'"'"'[^'"'"']+'"'"'|[^[:space:]"'"'"'$][^[:space:]]*)/\1<redacted>/g' \
    -e 's#(://)[^/@[:space:]]+@#\1<redacted>@#g'
}

log_line() { # decision kind team
  mkdir -p "$(dirname "$LOG")" 2>/dev/null || return 0
  printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$session_id" "$1" "$2" "$3" "$(printf '%s' "$cmd" | tr '\n\t' '  ' | redact)" >> "$LOG" 2>/dev/null || true
}

deny() { # kind team reason
  log_line deny "$1" "$2"
  jq -n --arg r "$3" '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $r}}'
  exit 0
}

# The bench configuration of the team $1, and how a message names it (D29):
# `tests/<slug>/bench.config.json` next to teams/.
bench_config() { printf '%s/bench.config.json' "$(harness_team_tests "$1")"; }
bench_config_label() {
  if harness_team_workshop "$1" >/dev/null; then printf 'tests/%s/bench.config.json' "${1##*/}"; else printf '%s/tests/bench.config.json' "${1##*/}"; fi
}

# Prints why the named profile $2 of the team $1 is remote; returns 1 when its
# baseUrl is a local host. A profile the team's bench.config.json does not declare
# is not known to be local.
profile_remote() {
  local cfg purl="" host
  cfg=$(bench_config "$1")
  [ -f "$cfg" ] && purl=$(jq -r --arg p "$2" '.profiles[$p].baseUrl // "" | if type == "string" then . else "" end' "$cfg" 2>/dev/null || true)
  if [ -z "$purl" ]; then
    printf 'not declared in %s' "$(bench_config_label "$1")"
    return 0
  fi
  is_local_host "$purl" && return 1
  host=$(host_of "$purl")
  if [ -n "$host" ]; then printf 'remote-host: %s' "$host"; else printf 'unreadable-base-url'; fi
  return 0
}

# D96: the variables `orkeon-bench run` lays over a run of the level $2 of the team
# $1 for its decision block, NAME=VALUE per line (nothing without one): the level's
# own `decision` when it states the key (null: none), else the top-level one. The
# same names as `decisionVariables` in the bench; `key_env` is a variable name.
decision_block_assigns() {
  local cfg
  cfg=$(bench_config "$1")
  [ -f "$cfg" ] || return 0
  jq -r --arg l "$2" '
    (if (.levels[$l] | type) == "object" and (.levels[$l] | has("decision")) then .levels[$l].decision else .decision end) as $b
    | if ($b | type) != "object" or ($b.provider | type) != "string" then empty else
        ({"typesafe": "TypeSafe", "liquid": "Liquid", "kev": "Kev"}[$b.provider]) as $s
        | "ORKEON_Orkeon__Decision__Provider=\($b.provider)",
          (if $s != null and ($b.base_url | type) == "string" then "ORKEON_Orkeon__\($s)__BaseUrl=\($b.base_url)" else empty end),
          (if $s != null and ($b.model | type) == "string" then "ORKEON_Orkeon__\($s)__Model=\($b.model)" else empty end),
          (if $s != null and ($b.key_env | type) == "string" then "ORKEON_Orkeon__\($s)__ApiKeyEnvVar=\($b.key_env)" else empty end)
      end' "$cfg" 2>/dev/null | tr -d '\r' || true
}

curdir="$cwd"
# Assignments of LLM variables seen in the command, NAME=VALUE per line: those of
# `export` or of a segment made only of assignments hold for the segments that
# follow; those in front of a run hold for that run only. RUN_ASSIGNS is what
# the run being judged sees.
held_assigns=""
RUN_ASSIGNS=""

# The NAME=VALUE assignments of ORKEON_Llm*, Llm*, DOTNET_Llm*, DOTNET_ENVIRONMENT,
# (ORKEON_)Orkeon__TypeSafe*, Orkeon__Liquid*, Orkeon__Kev*, Orkeon__Decision*,
# TYPESAFE_API_KEY or LIQUID_API_KEY in the segment $1, quotes removed.
llm_assignments() {
  printf '%s' "$1" | grep -oiE "(^|[[:space:]])((ORKEON_|DOTNET_)?LLM(__[A-Za-z0-9_]*)?|DOTNET_ENVIRONMENT|(ORKEON_)?ORKEON__(TYPESAFE|LIQUID|KEV|DECISION)(__[A-Za-z0-9_]*)?|TYPESAFE_API_KEY|LIQUID_API_KEY)=[^[:space:]]*" \
    | sed -E 's/^[[:space:]]+//; s/=["'"'"']/=/; s/["'"'"']$//'
}

# Classifies one run, logs it, and returns when it may go; denies and exits when
# it is remote and not approved.
gate_run() { # form target core
  local form="$1" target="$2" core="$3"
  local kind="" team="" profile="" level="" why="" detail="" machine_too="" t p l parsed p_local p_remote attempt state expected cfg
  local crew="" wd="" settings=""
  local -a levels=()

  case "$form" in
    bench)
      # Same rule as `orkeon-bench` itself: a slug is looked up under
      # <workshop>/teams/, anything that looks like a path is the team folder.
      case "$target" in
        "") team=$(harness_team_root "$curdir/_" 2>/dev/null || printf '%s' "$curdir") ;;
        */*|.*) team=$(resolve "$curdir" "$target") ;;
        *) team="$WORKSHOP/teams/$target" ;;
      esac ;;
    orkeon|harness)
      # The launchers run `orkeon run crew` from the team folder.
      case "$target" in
        crew|*/crew|crew/*|*/crew/*|*.ork.ts|*.ork.js|*.yaml|*.yml|*/*|.*) ;;
        "") ;;
        *) [ -e "$(resolve "$curdir" "$target")" ] || target="" ;;
      esac
      if [ -z "$target" ]; then
        team="$curdir"; crew="$curdir"
      else
        t=$(resolve "$curdir" "$target")
        case "$t" in
          */crew/*) team="${t%%/crew/*}" ;;
          */crew)   team="${t%/crew}" ;;
          *) if [ -d "$t" ]; then team="$t"; else team=$(dirname "$t"); fi ;;
        esac
        if [ -d "$t" ]; then crew="$t"; else crew=$(dirname "$t"); fi
      fi
      wd="$curdir" ;;
    launcher)
      team=$(dirname "$(resolve "$curdir" "$target")") ;;
  esac
  team="${team%/}"
  # The launchers (and the bench) run `orkeon run` on <team>/crew from the team folder.
  case "$form" in launcher|bench) crew="$team/crew"; wd="$team" ;; esac
  if [ "$form" != "bench" ]; then
    settings=$(printf '%s' "$core" | grep -oE -- '(^|[[:space:]])(--settings|-s)([[:space:]]+|=)[^[:space:]]+' | head -1 | sed -E 's/^[[:space:]]*(--settings|-s)([[:space:]]+|=)//; s/^["'"'"']//; s/["'"'"']$//')
    [ -n "$settings" ] && settings=$(resolve "$wd" "$settings")
  fi
  # The team's own settings (D33), passed by the launchers, the bench and the harness runner —
  # by a launcher only when it was written to (scaffold since D33): an older run.sh runs on the
  # chain, and the gate judges what it will really read.
  if [ -z "$settings" ]; then
    case "$form" in
      launcher) if grep -qF 'settings/$(basename "$DIR")/appsettings.json' "$team/run.sh" 2>/dev/null; then t="$(dirname "$(dirname "$team")")/settings/${team##*/}/appsettings.json"; else t=""; fi ;;
      bench) t="$(dirname "$(dirname "$team")")/settings/${team##*/}/appsettings.json" ;;
      harness) if [ -f "$team/mounts.json" ]; then t="$(dirname "$(dirname "$team")")/settings/${team##*/}/appsettings.json"; else t=""; fi ;;
      *) t="" ;;
    esac
    if [ -n "$t" ] && [ -f "$t" ]; then settings="$t"; fi
  fi

  case " $core " in
    *" --validate "*|*" --list-tools "*) kind="validate" ;;
  esac
  profile=$(printf '%s' "$core" | grep -oE -- '--profile([[:space:]]+|=)[^[:space:]]+' | head -1 | sed -E 's/^--profile([[:space:]]+|=)//')

  if [ -z "$kind" ]; then
    case "$profile" in
      stub) kind="stub" ;;
      machine) kind="machine" ;;
      "")
        kind="machine"
        if [ "$form" = "bench" ]; then
          # Without --profile the bench takes the profile of each level it reaches.
          level=$(printf '%s' "$core" | grep -oE -- '--level([[:space:]]+|=)[^[:space:]]+' | head -1 | sed -E 's/^--level([[:space:]]+|=)//' | tr '[:upper:]' '[:lower:]')
          case "$level" in
            l0|l1|static|unit) kind="validate" ;;
            l2|component)      kind="stub" ;;
            l3|e2e_local)      levels=(e2e_local) ;;
            *)                 levels=(e2e_local e2e_remote) ;;
          esac
          if [ "${#levels[@]}" -gt 0 ]; then
            cfg=$(bench_config "$team")
            parsed=""
            [ -f "$cfg" ] && parsed=$(jq -r '[(.levels.e2e_local.profile // ""), (.levels.e2e_remote.profile // "")] | join("\u001f")' "$cfg" 2>/dev/null || true)
            IFS=$'\x1f' read -r p_local p_remote <<<"$parsed"
            for l in "${levels[@]}"; do
              if [ "$l" = "e2e_local" ]; then p="${p_local:-machine}"; else p="${p_remote:-}"; fi
              case "$p" in
                machine) machine_too="1" ;;
                stub) ;;
                "")
                  # The remote level asked for by name, with no profile to bound it.
                  case "$level" in
                    l4|e2e_remote) kind="remote"; why="--level $level is the remote level and $(bench_config_label "$team") names no profile for it" ;;
                  esac ;;
                *)
                  if detail=$(profile_remote "$team" "$p"); then
                    kind="remote"; why="level $l runs the profile \`$p\` ($(bench_config_label "$team")), a remote profile ($detail)"
                  else
                    [ "$kind" = "remote" ] || kind="local"
                  fi ;;
              esac
              [ "$kind" = "remote" ] && break
            done
          fi
        fi ;;
      *)
        if detail=$(profile_remote "$team" "$profile"); then
          kind="remote"; why="--profile $profile is a remote profile ($detail)"
        else
          kind="local"
        fi ;;
    esac
  fi

  # The machine profile injects nothing: Orkeon sees the ORKEON_Llm__* variables
  # that are set, over the machine settings. It is judged too when it is one of
  # several profiles the levels of a bench run reach.
  if [ "$kind" = "machine" ] || { [ "$kind" = "local" ] && [ -n "$machine_too" ]; }; then
    if detail=$(machine_target_remote "$crew" "$settings"); then
      kind="remote"; why="$detail"
    fi
  elif [ "$kind" = "local" ]; then
    # A named profile replaces the LLMs of the run, not its decision model.
    if detail=$(machine_target_remote "$crew" "$settings" decision); then
      kind="remote"; why="$detail"
    fi
  fi

  # D96: `orkeon-bench run` lays the decision block of each level it runs over the
  # run (never at L2 nor on the stub): the decision model is judged again with it.
  if [ "$form" = "bench" ] && { [ "$kind" = "machine" ] || [ "$kind" = "local" ]; }; then
    local -a dlevels=()
    local assigns
    level=$(printf '%s' "$core" | grep -oE -- '--level([[:space:]]+|=)[^[:space:]]+' | head -1 | sed -E 's/^--level([[:space:]]+|=)//' | tr '[:upper:]' '[:lower:]')
    case "$level" in
      l0|l1|l2|static|unit|component) ;;
      l3|e2e_local) dlevels=(e2e_local) ;;
      *) dlevels=(e2e_local e2e_remote) ;;
    esac
    for l in ${dlevels[@]+"${dlevels[@]}"}; do
      assigns=$(decision_block_assigns "$team" "$l")
      [ -n "$assigns" ] || continue
      if detail=$(RUN_ASSIGNS="${RUN_ASSIGNS}${RUN_ASSIGNS:+$'\n'}$assigns" machine_target_remote "$crew" "$settings" decision); then
        kind="remote"; why="level $l lays the decision block of $(bench_config_label "$team") over its run: $detail"
        break
      fi
    done
  fi

  if [ "$kind" != "remote" ]; then
    log_line allow "$kind" "$team"
    return 0
  fi

  attempt=$(harness_open_attempt "$team" 2>/dev/null || true)
  state="none"
  [ -n "$attempt" ] && state=$(approval_state "$attempt")

  case "$state" in
    ok)
      log_line allow remote "$team"
      return 0 ;;
    over)
      deny remote "$team" "run-gate: remote run refused — $why, and the approval in \`$attempt\` says the estimate exceeds the cap (estimated_usd > cap_usd). Raise the cap with the user ($(bench_config_label "$team") budget.remote_usd_max, then a new approval) or reduce the run." ;;
    invalid\ *)
      deny remote "$team" "run-gate: remote run refused — $why, and the approval in \`$attempt\` has no valid ${state#invalid } (missing, not a JSON number, or below 0): an approval states the estimate and the cap the user approved, as numbers of USD with estimated_usd <= cap_usd, and one without them approves nothing. State the estimate and the cap to the user and wait for their explicit approval, typed as \`/team-approve remote <usd>\`: its hook has orkeon-bench write the marker again, with both numbers (D19, D36). Never write the marker on your own." ;;
  esac

  expected="${attempt:-$(harness_team_workbook "$team")/attempts/<open attempt>}/remote-approval.json"
  deny remote "$team" "run-gate: remote run refused — $why, and no approval marker exists at \`$expected\`. A remote LLM is paid: estimate first, state the estimate and the cap to the user, and wait for their explicit approval, typed as \`/team-approve remote <usd>\`: the /team-approve hook (D36) then records the marker {\"by\", \"at\", \"estimated_usd\", \"cap_usd\"} in the OPEN attempt through orkeon-bench (D19). Once the user has typed it, re-issue the command. Never write the marker on your own, from the shell either: an approval Claude wrote is not one. \`--validate\`, \`--profile stub\` and a profile whose host is local never need approval; the user can also run the command themselves with the ! prefix. Team resolved: \`$team\`."
}

while IFS= read -r seg; do
  seg="${seg#"${seg%%[![:space:]]*}"}"
  [ -n "$seg" ] || continue

  # Follow `cd` so that `cd teams/x && ./run.sh` resolves the team.
  case "$seg" in
    cd|cd\ *)
      target=$(printf '%s' "$seg" | awk '{print $2}')
      [ -n "$target" ] && curdir=$(resolve "$curdir" "$target")
      continue ;;
  esac

  # An assignment in front of a run (`VAR=… ./run.sh`, `env VAR=… ./run.sh`)
  # holds for that run; `export VAR=…`, or a segment of assignments only, for the
  # runs that follow. Values stay in this process: only names and base URLs are
  # ever printed.
  seg_assigns=""
  case "$seg" in
    *[Ll][Ll][Mm]*=*|*DOTNET_ENVIRONMENT=*|*[Tt][Yy][Pp][Ee][Ss][Aa][Ff][Ee]*=*|*[Ll][Ii][Qq][Uu][Ii][Dd]*=*|*[Kk][Ee][Vv]*=*|*[Dd][Ee][Cc][Ii][Ss][Ii][Oo][Nn]*=*)
      a=$(llm_assignments "$seg")
      if [ -n "$a" ]; then
        case "$seg" in
          export\ *) held_assigns+="$a"$'\n' ;;
          *) if [[ "$seg" =~ ^([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*[[:space:]]*)+$ ]]; then held_assigns+="$a"$'\n'; else seg_assigns="$a"; fi ;;
        esac
      fi ;;
  esac
  RUN_ASSIGNS="$held_assigns$seg_assigns"

  # Strip what sits before the verb: env assignments, env, rtk, timeout N, bash/sh.
  core=$(printf '%s' "$seg" | sed -E \
    -e 's/^([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*[[:space:]]+)*//' \
    -e 's/^(env|rtk|command|sudo|exec|nohup|time)[[:space:]]+//' \
    -e 's/^([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*[[:space:]]+)*//' \
    -e 's/^timeout[[:space:]]+[^[:space:]]+[[:space:]]+//' \
    -e 's/^(bash|sh|zsh)[[:space:]]+//')

  form=""
  target=""
  case "$core" in
    orkeon-bench\ run|orkeon-bench\ run\ *)
      form="bench"
      target=$(printf '%s' "$core" | awk '{ for (i = 3; i <= NF; i++) { t = $i; if (t ~ /^--(level|profile|repeat|env|scenario|dataset)$/) { i++; continue } if (t ~ /^-/) continue; print t; exit } }') ;;
    orkeon\ run|orkeon\ run\ *)
      form="orkeon"
      target=$(printf '%s' "$core" | awk '{ for (i = 3; i <= NF; i++) { t = $i; if (t ~ /^(--(mount|events|profile|var|inputs|llm-log|mount-id|settings)|-v)$/) { i++; continue } if (t ~ /^-/ || t ~ /:/) continue; print t; exit } }') ;;
    orkeon-harness-run|orkeon-harness-run\ *)
      form="harness"
      target=$(printf '%s' "$core" | awk '{ s = ($2 == "run") ? 3 : 2; for (i = s; i <= NF; i++) { t = $i; if (t ~ /^(--(mount|events|profile|var|inputs|llm-log|mount-id|plugins|settings)|-v)$/) { i++; continue } if (t ~ /^-/ || t ~ /:/) continue; print t; exit } }') ;;
    *)
      first=$(printf '%s' "$core" | awk '{print $1}')
      case "$first" in
        ./run.sh|run.sh|*/run.sh|./run.cmd|run.cmd|*/run.cmd) form="launcher"; target="$first" ;;
      esac ;;
  esac
  [ -n "$form" ] || continue

  # Every run of the command goes through the gate: a validate in front of a
  # remote run must not wave it through.
  gate_run "$form" "$target" "$core"
done <<< "$(printf '%s' "$cmd" | tr ';&|' '\n\n\n')"

exit 0
