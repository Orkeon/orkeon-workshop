#!/bin/bash
# bash-dispatch module — the integration suite never runs whole.
#
# Adapted from claude-code-toolkit/lib/guard-integration-filter.sh (MIT, see THIRD-PARTY.md),
# where the project name was fixed in the script and the rule had been measured: the whole suite
# rebuilt every fixture and re-seeded the database, four minutes where the impacted context fit in
# one, and the advisory line that said so was ignored twice in one day (602 s each, the longest
# tool call of both sessions). Here nothing is fixed: the targets come from the repository pack,
# through two switches the profile writes into settings.local.json.
#
#   HARNESS_INTEGRATION_PROJECTS    space-separated substrings of a `dotnet test` target whose
#                                   whole run is refused: a test project (`IntegrationTests`) or a
#                                   solution (`Orkeon.sln`). Empty, the default: the module is off.
#   HARNESS_INTEGRATION_CATEGORIES  optional, space-separated. With it, a run on a listed target is
#                                   refused only when its filter selects one of these categories
#                                   (`Category=Integration`): the fast suite of a solution must
#                                   run whole. A bare `dotnet test`, no target named, then counts
#                                   as the solution of the folder. Without it, every run on a
#                                   listed target needs a narrowing filter.
#
# A narrowing filter names tests: `FullyQualifiedName~` or `=`, `DisplayName~`, or the
# Microsoft.Testing.Platform options `--filter-class`, `--filter-method`, `--filter-namespace`,
# `--filter-query`. A project named on its own (`dotnet test tests/X.Tests/X.Tests.csproj`) is a
# narrowing too when the solution is the listed target. `rtk` in front, `cd … &&`, environment
# assignments, a redirect: only substrings of the command are inspected, no subprocess.
#
# Contract: reads $HOOK_CMD, prints the hook JSON when it decides, nothing when it passes. A deny
# is terminal in the chain. No forcing: a doubt of scope widens by one class, never to the suite.
set -u

cmd="${HOOK_CMD:-}"
[ -n "$cmd" ] || exit 0
projects="${HARNESS_INTEGRATION_PROJECTS:-}"
[ -n "$projects" ] || exit 0
case "$cmd" in *"dotnet test"*) ;; *) exit 0 ;; esac

case "$cmd" in
  *FullyQualifiedName~*|*FullyQualifiedName=*|*DisplayName~*|*--filter-class*|*--filter-method*|*--filter-namespace*|*--filter-query*) exit 0 ;;
esac

categories="${HARNESS_INTEGRATION_CATEGORIES:-}"

listed=""
# shellcheck disable=SC2086
for p in $projects; do
  case "$cmd" in *"$p"*) listed="$p"; break ;; esac
done

selected=""
if [ -n "$categories" ]; then
  # shellcheck disable=SC2086
  for c in $categories; do
    case "$cmd" in *"Category=$c"*) selected="$c"; break ;; esac
  done
  [ -n "$selected" ] || exit 0
  if [ -z "$listed" ]; then
    # No listed target in the command: a bare `dotnet test` runs the solution of the folder. A
    # token after `test` that is a project, a solution or a path names a narrower target.
    segment=$(printf '%s' "$cmd" | tr ';&|' '\n\n\n' | grep -m1 'dotnet test' | sed 's/.*dotnet test//')
    explicit=0
    for tok in $segment; do
      case "$tok" in
        -*) continue ;;
        *.sln|*.slnx|*.csproj|*.fsproj|*.vbproj|*/*) explicit=1; break ;;
      esac
    done
    [ "$explicit" -eq 0 ] || exit 0
    listed="the solution of the folder"
  fi
  reason="guard-integration-filter: whole integration suite refused — \`dotnet test\` on $listed with \`Category=$selected\` runs every test of that category: minutes, where the tests of the adapters the batch touched run in seconds. Narrow it to one project (\`dotnet test <path>.csproj --filter \"Category=$selected\"\`) or to the test classes (\`--filter \"Category=$selected&FullyQualifiedName~<TestClass>\"\`). A doubt of scope widens by one class, never to the whole suite. Set by the repository pack: HARNESS_INTEGRATION_PROJECTS, HARNESS_INTEGRATION_CATEGORIES."
else
  [ -n "$listed" ] || exit 0
  reason="guard-integration-filter: whole integration suite refused — \`dotnet test\` on $listed without a narrowing filter runs every test of the project: minutes, where the tests of the adapters the batch touched run in seconds. Add \`--filter \"FullyQualifiedName~<TestClass>\"\` (or \`--filter-class\` / \`--filter-method\` on Microsoft.Testing.Platform), repeatable. A doubt of scope widens by one class, never to the whole suite. Set by the repository pack: HARNESS_INTEGRATION_PROJECTS."
fi

jq -n --arg r "$reason" \
  '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $r}}'
exit 0
