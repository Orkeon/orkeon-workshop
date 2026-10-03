#!/usr/bin/env bash
# update-public-api.sh - refresh PublicAPI.Unshipped.txt from the compiler's own verdict.
#
# The public surface of a shared tool is frozen (Microsoft.CodeAnalysis.PublicApiAnalyzers):
# adding a public member without declaring it is RS0016, removing a declared one is RS0017,
# both build errors. An IDE fixes them with a code action; without one, run this script:
# it builds the src/ projects, reads the RS0016 / RS0017 diagnostics and rewrites each
# project's PublicAPI.Unshipped.txt accordingly (sorted, deduplicated). Review the diff:
# every line is a promise to the teams that consume the tool.
#
# Usage: update-public-api.sh [dotnet build arguments...]
#   e.g. update-public-api.sh --no-restore
# At release time, move the lines from PublicAPI.Unshipped.txt to PublicAPI.Shipped.txt.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

LOG="$(mktemp)"
trap 'rm -f "$LOG"' EXIT
dotnet build -c Release --nologo "$@" > "$LOG" 2>&1 || true

python3 - "$LOG" <<'PY'
import re, sys
from collections import defaultdict
from pathlib import Path

add = re.compile(r"error RS0016: Symbol '(.*)' is not part of the declared public API.*\[(.+?\.csproj)\]")
drop = re.compile(r"error RS0017: Symbol '(.*)' is part of the declared API, but is either not public or could not be found.*\[(.+?\.csproj)\]")
to_add, to_drop = defaultdict(set), defaultdict(set)
for line in open(sys.argv[1], errors="replace"):
    if (m := add.search(line)):
        to_add[m.group(2)].add(m.group(1))
    elif (m := drop.search(line)):
        to_drop[m.group(2)].add(m.group(1))

if not to_add and not to_drop:
    print("PublicAPI files are up to date (no RS0016 / RS0017).")
for csproj in sorted(set(to_add) | set(to_drop)):
    target = Path(csproj).parent / "PublicAPI.Unshipped.txt"
    current = {l for l in target.read_text().splitlines() if l and l != "#nullable enable"} if target.exists() else set()
    updated = (current | to_add[csproj]) - to_drop[csproj]
    target.write_text("#nullable enable\n" + "".join(l + "\n" for l in sorted(updated)))
    print(f"{target}: +{len(to_add[csproj] - current)} -{len(to_drop[csproj] & current)}")
PY
