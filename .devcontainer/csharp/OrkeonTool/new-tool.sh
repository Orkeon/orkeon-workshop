#!/usr/bin/env bash
# new-tool.sh - create a new Orkeon tool solution from this template.
#
# Usage:
#   new-tool.sh <ToolName> <tool_name> [<destination-dir>]
#
#   <ToolName>    PascalCase identifier: project, namespace and class prefix
#                 (e.g. InvoiceParser -> InvoiceParserTool, InvoiceParser.Tests).
#   <tool_name>   snake_case agent-visible name, the exact string a crew lists under
#                 `tools:` (e.g. invoice_parser).
#   <destination> Parent directory of the new solution (default: current directory).
#                 The solution is created in <destination>/<ToolName>/.
#
# What it does: copies the template (without bin/ obj/) and the licence notice of the files
# it takes from the Orkeon repository (../THIRD-PARTY.md), renames every file and directory
# that carries the placeholder name, and replaces the two placeholders in file contents:
#   SampleExtractor  -> <ToolName>
#   sample_extractor -> <tool_name>
# The domain sample (KeyValueExtractor) is kept as a starting point: replace it with your
# own pure logic, then adapt the request/response records and the tests.
set -euo pipefail

die() { printf 'new-tool: %s\n' "$*" >&2; exit 1; }

[[ $# -ge 2 && $# -le 3 ]] || die "usage: $0 <ToolName> <tool_name> [<destination-dir>]"
TOOL="$1"
NAME="$2"
DEST_PARENT="${3:-$PWD}"

[[ "$TOOL" =~ ^[A-Z][A-Za-z0-9]+$ ]] || die "<ToolName> must be PascalCase letters/digits (got '$TOOL')"
[[ "$NAME" =~ ^[a-z][a-z0-9]*(_[a-z0-9]+)*$ ]] || die "<tool_name> must be snake_case (got '$NAME')"
[[ "$TOOL" != "SampleExtractor" ]] || die "choose a name other than the placeholder"

TEMPLATE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="$DEST_PARENT/$TOOL"
[[ ! -e "$DEST" ]] || die "destination already exists: $DEST"
mkdir -p "$DEST_PARENT"

# Copy without build output, IDE state or this script's own copy.
mkdir "$DEST"
( cd "$TEMPLATE" && tar -cf - \
    --exclude=./bin --exclude='*/bin' --exclude=./obj --exclude='*/obj' \
    --exclude='*/obj-linux' --exclude=./.vs --exclude=./TestResults --exclude='*/TestResults' \
    --exclude=./new-tool.sh . ) | ( cd "$DEST" && tar -xf - )
# The convention files come from the Orkeon repository (MIT): their notice goes with them.
[[ -f "$TEMPLATE/../THIRD-PARTY.md" ]] && cp "$TEMPLATE/../THIRD-PARTY.md" "$DEST/"

# Rename directories first (deepest first), then files.
while IFS= read -r -d '' path; do
  base="$(basename "$path")"
  mv "$path" "$(dirname "$path")/${base//SampleExtractor/$TOOL}"
done < <(find "$DEST" -depth -name '*SampleExtractor*' -print0)

# Replace the placeholders in text files.
while IFS= read -r -d '' file; do
  if grep -Iq . "$file" 2>/dev/null; then
    sed -i -e "s/SampleExtractor/$TOOL/g" -e "s/sample_extractor/$NAME/g" "$file"
  fi
done < <(find "$DEST" -type f -print0)

printf 'Created %s\n' "$DEST"
printf '  tool class : %sTool  (agent-visible name: %s)\n' "$TOOL" "$NAME"
printf 'Next: cd %q && dotnet build -c Release && dotnet test\n' "$DEST"
