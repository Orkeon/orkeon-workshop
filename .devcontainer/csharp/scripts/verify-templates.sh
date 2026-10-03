#!/usr/bin/env bash
# verify-templates.sh - restore, build (Release, warnings as errors) and test the C#
# templates, on a COPY so the template tree never receives bin/ or obj/.
#
# Usage:
#   verify-templates.sh [--feed <dir>] [--work <dir>] [--offline] [--smoke] [--keep] [<Template>...]
#
#   --feed <dir>   Local Orkeon feed to restore from. Default: the path written in
#                  nuget.config (/usr/local/share/orkeon/packages, the image location).
#                  With another directory the script generates an alternate nuget.config
#                  (same sources and mapping, other feed path) and restores with
#                  `dotnet restore --configfile <generated>` - the template files are
#                  never edited.
#   --work <dir>   Where the copies are built (default: mktemp -d, removed at the end
#                  unless --keep).
#   --offline      After the normal pass, copy each template AGAIN (no obj/, no assets
#                  file) and restore + build it with every HTTP(S) request sent to a dead
#                  proxy, an EMPTY NuGet http-cache and ORKEON_HARNESS_OFFLINE=1 - the
#                  situation of the container at run time, where the firewall rejects
#                  nuget.org. Proves that a fresh project restores from the pre-warmed
#                  package cache alone.
#   --smoke        Once OrkeonRunner and OrkeonPlugin are built, run the end-to-end
#                  plugin check (OrkeonRunner/smoke/plugin-smoke.sh) with those two
#                  artifacts: plugin DLL dropped in a folder, crew naming its tool,
#                  --list-tools, --validate and an evented run. No model, no network.
#   <Template>     Template folder names (default: every Orkeon*/ folder next to scripts/).
#
# Environment: NUGET_PACKAGES is honoured (the image sets /usr/local/share/nuget-packages).
# Exit code: 0 when every template passes, 1 otherwise.
set -euo pipefail

log() { printf '[verify-templates] %s\n' "$*" >&2; }
die() { log "ERROR: $*"; exit 1; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEFAULT_FEED="/usr/local/share/orkeon/packages"
FEED="$DEFAULT_FEED"
WORK=""
OFFLINE=0
SMOKE=0
KEEP=0
TEMPLATES=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --feed) FEED="$(cd "$2" && pwd)"; shift 2 ;;
    --work) WORK="$2"; shift 2 ;;
    --offline) OFFLINE=1; shift ;;
    --smoke) SMOKE=1; shift ;;
    --keep) KEEP=1; shift ;;
    -h|--help) sed -n '2,/^[^#]/{/^#/p;}' "$0"; exit 0 ;;
    *) TEMPLATES+=("$1"); shift ;;
  esac
done
[[ -d "$FEED" ]] || die "feed directory not found: $FEED (run build-orkeon-packages.sh first)"
if [[ ${#TEMPLATES[@]} -eq 0 ]]; then
  while IFS= read -r d; do TEMPLATES+=("$(basename "$d")"); done < <(find "$ROOT" -maxdepth 1 -type d -name 'Orkeon*' | sort)
fi
if [[ -z "$WORK" ]]; then WORK="$(mktemp -d -t orkeon-verify.XXXXXX)"; else mkdir -p "$WORK"; KEEP=1; fi
trap '[[ $KEEP -eq 1 ]] || rm -rf "$WORK"' EXIT

export DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_NOLOGO=1 DOTNET_SKIP_FIRST_TIME_EXPERIENCE=1

RESTORE_ARGS=()
if [[ "$FEED" != "$DEFAULT_FEED" ]]; then
  ALT_CONFIG="$WORK/nuget.verify.config"
  sed "s|$DEFAULT_FEED|$FEED|" "$ROOT/nuget.config" > "$ALT_CONFIG"
  RESTORE_ARGS=(--configfile "$ALT_CONFIG")
  log "feed override: $FEED (config: $ALT_CONFIG)"
fi

copy_template() { # <name> <dest>
  rm -rf "$2"; mkdir -p "$2"
  ( cd "$ROOT/$1" && tar -cf - --exclude=bin --exclude=obj --exclude=obj-linux --exclude=TestResults . ) | ( cd "$2" && tar -xf - )
}

run() { # <log-file> <cmd...>
  local logfile="$1"; shift
  if ! "$@" > "$logfile" 2>&1; then
    grep -E "error|warning|Failed|failed" "$logfile" | sort -u | head -n 30 >&2 || true
    return 1
  fi
}

FAILED=0
for t in "${TEMPLATES[@]}"; do
  [[ -d "$ROOT/$t" ]] || die "unknown template: $t"
  dir="$WORK/$t"
  copy_template "$t" "$dir"
  t0=$(date +%s)
  if ( cd "$dir" \
       && run "$WORK/$t.restore.log" dotnet restore "${RESTORE_ARGS[@]}" \
       && run "$WORK/$t.build.log" dotnet build -c Release --no-restore \
       && run "$WORK/$t.test.log" dotnet test -c Release --no-build ); then
    summary="$(grep -E "^\s*(total|succeeded|failed|skipped):" "$WORK/$t.test.log" | tr -s ' \n' ' ' || true)"
    log "PASS $t (build 0 warning, tests: ${summary:-see $WORK/$t.test.log}) in $(( $(date +%s) - t0 ))s"
  else
    log "FAIL $t (logs: $WORK/$t.*.log)"
    FAILED=1
    continue
  fi

  if [[ $OFFLINE -eq 1 ]]; then
    odir="$WORK/$t.offline"
    copy_template "$t" "$odir"
    if ( cd "$odir" \
         && export HTTP_PROXY=http://127.0.0.1:9 HTTPS_PROXY=http://127.0.0.1:9 ALL_PROXY=http://127.0.0.1:9 \
                   http_proxy=http://127.0.0.1:9 https_proxy=http://127.0.0.1:9 NO_PROXY= no_proxy= \
                   ORKEON_HARNESS_OFFLINE=1 NUGET_HTTP_CACHE_PATH="$WORK/empty-http-cache" \
         && run "$WORK/$t.offline-restore.log" dotnet restore "${RESTORE_ARGS[@]}" \
         && run "$WORK/$t.offline-build.log" dotnet build -c Release --no-restore ); then
      log "PASS $t offline (fresh copy restored and built with nuget.org unreachable)"
    else
      log "FAIL $t offline (logs: $WORK/$t.offline-*.log)"
      FAILED=1
    fi
  fi
done

if [[ $SMOKE -eq 1 ]]; then
  runner="$WORK/OrkeonRunner/src/OrkeonHarnessRun/bin/Release/net10.0/orkeon-harness-run.dll"
  plugin="$WORK/OrkeonPlugin/src/SampleExtractor.Plugin/bin/Release/net10.0/SampleExtractor.Plugin.dll"
  if [[ -f "$runner" && -f "$plugin" ]]; then
    if "$ROOT/OrkeonRunner/smoke/plugin-smoke.sh" "dotnet $runner" "$plugin" > "$WORK/smoke.log" 2>&1; then
      log "PASS plugin smoke ($(grep -c '^  ok ' "$WORK/smoke.log") checks, $(grep -c '^  skip ' "$WORK/smoke.log") skipped)"
    else
      cat "$WORK/smoke.log" >&2
      log "FAIL plugin smoke (log: $WORK/smoke.log)"
      FAILED=1
    fi
  else
    log "FAIL plugin smoke: OrkeonRunner and OrkeonPlugin must both be verified in the same run"
    FAILED=1
  fi
fi

[[ $FAILED -eq 0 ]] && log "all checks OK" || log "some checks FAILED"
exit $FAILED
