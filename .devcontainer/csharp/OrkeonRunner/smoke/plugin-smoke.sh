#!/usr/bin/env bash
# plugin-smoke.sh - end-to-end check of the plugin route, with no model and no network.
#
# Usage:
#   plugin-smoke.sh "<runner command>" <path/to/SampleExtractor.Plugin.dll>
#
#   <runner command>  How to start orkeon-harness-run, e.g. "orkeon-harness-run" (image)
#                     or "dotnet /path/to/orkeon-harness-run.dll" (a local build).
#   <plugin dll>      The assembly built from the OrkeonPlugin template.
#
# What it proves, in order:
#   1. --list-tools without a plugin directory does not know sample_extractor;
#   2. the plugin DLL dropped in a folder mounted as /plugins:ro makes --list-tools show it;
#      the same folder mounted /plugins:rw is not loaded, and the refusal is reported;
#   3. the same through --plugins <dir> (folder-per-plugin layout);
#   4. --validate refuses the smoke crew without the plugin (StrictTools, unknown tool);
#   5. --validate resolves it with the plugin;
#   6. a run with --events jsonl speaks the v2 protocol from run.started to run.finished
#      (echo LLM provider: the crew "answers" by replaying its prompt);
#   7. without --mount, the mounts come from the team's mounts.json, which is what a launcher or
#      orkeon-bench would otherwise pass; TEAM_ENV=<name> binds the mount set
#      mounts.<name>/<team>/ next to teams/, and a set without a folder is refused;
#   8. the same tool named by a TypeScript crew (crew-ts/crew.ork.ts) - only when esbuild
#      is available (ORKEON_ESBUILD_PATH, esbuild on the PATH, or esbuild-bin/esbuild next
#      to the runner); skipped otherwise.
set -euo pipefail

[[ $# -eq 2 ]] || { echo "usage: $0 \"<runner command>\" <plugin dll>" >&2; exit 64; }
read -r -a RUNNER <<< "$1"
PLUGIN_DLL="$(cd "$(dirname "$2")" && pwd)/$(basename "$2")"
[[ -f "$PLUGIN_DLL" ]] || { echo "plugin assembly not found: $PLUGIN_DLL" >&2; exit 66; }

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK="$(mktemp -d -t orkeon-plugin-smoke.XXXXXX)"
trap 'rm -rf "$WORK"' EXIT

# A team folder as the launchers see it, in a workshop: teams/smoke/ holds crew/, input/ and
# output/, and is the working directory; the mount sets would sit in mounts.<name>/smoke/.
TEAM="$WORK/teams/smoke"
mkdir -p "$TEAM"
cp -r "$HERE/crew" "$HERE/crew-ts" "$HERE/input" "$HERE/appsettings.echo.json" "$HERE/mounts.json" "$TEAM/"
mkdir -p "$TEAM/output" "$WORK/flat" "$WORK/nested/SampleExtractor.Plugin"
cp "$PLUGIN_DLL" "$WORK/flat/"
cp "$PLUGIN_DLL" "$WORK/nested/SampleExtractor.Plugin/"
[[ -f "${PLUGIN_DLL%.dll}.deps.json" ]] && cp "${PLUGIN_DLL%.dll}.deps.json" "$WORK/nested/SampleExtractor.Plugin/"
cd "$TEAM"

SETTINGS=(--settings "$TEAM/appsettings.echo.json")
pass() { printf '  ok   %s\n' "$1"; }
fail() { printf '  FAIL %s\n' "$1" >&2; [[ -f "$WORK/last.err" ]] && sed 's/^/       | /' "$WORK/last.err" >&2; exit 1; }
run()  { "${RUNNER[@]}" "$@" > "$WORK/last.out" 2> "$WORK/last.err"; }

echo "plugin smoke: ${RUNNER[*]}"

run --list-tools "${SETTINGS[@]}" || fail "1. --list-tools (no plugin) exits 0"
grep -qx "file_write" "$WORK/last.out" || fail "1. built-in tools are listed"
! grep -qx "sample_extractor" "$WORK/last.out" || fail "1. sample_extractor is unknown without the plugin"
pass "1. without a plugin directory, sample_extractor is not registered"

run --list-tools "${SETTINGS[@]}" --mount "$WORK/flat:/plugins:ro" --allow-external-mounts || fail "2. --list-tools with /plugins mount exits 0"
grep -qx "sample_extractor" "$WORK/last.out" || fail "2. plugin DLL mounted as /plugins:ro registers sample_extractor"
grep -q "plugin loaded from /plugins: orkeon-harness.sample-extractor" "$WORK/last.err" || fail "2. the load is reported on stderr"
pass "2. plugin DLL in a folder mounted as /plugins:ro -> --list-tools shows sample_extractor"

run --list-tools "${SETTINGS[@]}" --mount "$WORK/flat:/plugins:rw" --allow-external-mounts || fail "2b. --list-tools with a writable /plugins mount exits 0"
! grep -qx "sample_extractor" "$WORK/last.out" || fail "2b. a writable /plugins mount registers no plugin tool"
grep -q "plugins NOT loaded from /plugins: its mount .* is writable" "$WORK/last.err" || fail "2b. the writable mount is reported on stderr"
pass "2b. the same folder mounted /plugins:rw is not loaded: its agents could drop code there"

run --list-tools "${SETTINGS[@]}" --plugins "$WORK/nested" || fail "3. --list-tools with --plugins exits 0"
grep -qx "sample_extractor" "$WORK/last.out" || fail "3. --plugins <dir> (folder-per-plugin) registers sample_extractor"
pass "3. --plugins <dir>, folder-per-plugin layout -> --list-tools shows sample_extractor"

if run crew --validate "${SETTINGS[@]}"; then fail "4. --validate must fail without the plugin"; fi
grep -q "sample_extractor" "$WORK/last.err" || fail "4. the failure names the unknown tool"
pass "4. --validate refuses the crew without the plugin (StrictTools)"

run crew --validate "${SETTINGS[@]}" --plugins "$WORK/nested" || fail "5. --validate with the plugin exits 0"
grep -q "^VALIDATION OK: .*tools resolved=1" "$WORK/last.out" || fail "5. VALIDATION OK with the plugin tool resolved"
pass "5. --validate resolves sample_extractor: $(grep "^VALIDATION OK" "$WORK/last.out")"

run crew --events jsonl "${SETTINGS[@]}" --plugins "$WORK/nested" \
    --mount "$TEAM/input:/workspace:ro" "$TEAM/output:/output:rw" --allow-external-mounts \
  || fail "6. evented run exits 0"
python3 - "$WORK/last.out" <<'PY' || fail "6. the stream is valid protocol v2"
import json, sys
events = [json.loads(l) for l in open(sys.argv[1]) if l.strip()]
kinds = [e["kind"] for e in events]
assert all(e["v"] == 2 for e in events), "every line carries v=2"
assert [e["seq"] for e in events] == list(range(1, len(events) + 1)), "seq is monotonic from 1"
assert kinds[0] == "run.started" and kinds[-1] == "run.finished", kinds
assert "task.started" in kinds and "task.completed" in kinds, kinds
done = next(e for e in events if e["kind"] == "task.completed")
# taskId is the runtime id of the task (a ULID), not the YAML file stem.
assert done["taskId"] and done["agentRole"] == "Extractor" and done["success"] is True, done
last = events[-1]
assert last["success"] is True and last["exitCode"] == 0, last
for key in ("tokens", "durationMs", "promptTokens", "completionTokens"):
    assert key in last, f"run.finished lacks {key}"
print("       kinds:", " ".join(kinds))
PY
pass "6. --events jsonl: run.started ... task.completed ... run.finished (v2 envelope)"

rm -rf "$TEAM/output"
run crew --events jsonl "${SETTINGS[@]}" --plugins "$WORK/nested" || fail "7. run without --mount exits 0"
grep -q "mounts from .*mounts.json (environment: default): /workspace:ro /output:rw" "$WORK/last.err" || fail "7. the mounts of mounts.json are reported"
[[ -f "$TEAM/output/AUTO_SUMMARY.md" ]] || fail "7. /output is bound to ./output (AUTO_SUMMARY.md written there)"
if TEAM_ENV=prod run crew --validate "${SETTINGS[@]}" --plugins "$WORK/nested"; then fail "7. TEAM_ENV=prod must fail: there is no mount set mounts.prod/smoke/"; fi
grep -q 'unknown environment "prod"' "$WORK/last.err" || fail "7. the missing mount set is named"
mkdir -p "$WORK/mounts.test/smoke/workspace" && cp -r "$TEAM/input/." "$WORK/mounts.test/smoke/workspace/"
TEAM_ENV=test run crew --events jsonl "${SETTINGS[@]}" --plugins "$WORK/nested" || fail "7. a run on the mount set mounts.test/ exits 0"
grep -q "(environment: test): /workspace:ro /output:rw" "$WORK/last.err" || fail "7. the mount set is reported"
[[ -f "$WORK/mounts.test/smoke/output/AUTO_SUMMARY.md" ]] || fail "7. /output is bound to mounts.test/smoke/output (AUTO_SUMMARY.md written there)"
pass "7. no --mount: mounts.json provides /workspace and /output; TEAM_ENV=test binds the mount set mounts.test/smoke/"

RUNNER_DIR="$(dirname "$(command -v "${RUNNER[0]}" 2>/dev/null || echo "${RUNNER[-1]}")")"
if [[ -n "${ORKEON_ESBUILD_PATH:-}" ]] || command -v esbuild > /dev/null 2>&1 || [[ -x "$RUNNER_DIR/esbuild-bin/esbuild" ]]; then
  if run crew-ts/crew.ork.ts --validate "${SETTINGS[@]}"; then fail "8. the TypeScript crew must fail without the plugin"; fi
  grep -q "sample_extractor" "$WORK/last.err" || fail "8. the failure names the unknown tool"
  run crew-ts/crew.ork.ts --validate "${SETTINGS[@]}" --plugins "$WORK/nested" || fail "8. --validate of the TypeScript crew with the plugin exits 0"
  grep -q "^VALIDATION OK: .*tools resolved=1" "$WORK/last.out" || fail "8. VALIDATION OK for the TypeScript crew"
  pass "8. a .ork.ts crew names the plugin tool: refused without the plugin, validated with it"
else
  printf '  skip 8. .ork.ts crew (no esbuild: set ORKEON_ESBUILD_PATH to enable)\n'
fi

echo "plugin smoke: all checks passed"
