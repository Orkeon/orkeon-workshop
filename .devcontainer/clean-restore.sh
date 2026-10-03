#!/bin/sh
# Cleans the bin/ and obj/ folders of a .NET project and restores its NuGet packages: what a
# project shared between Windows and Linux (WSL, a devcontainer) needs when its build output
# no longer matches the platform.
#
# Usage: clean-restore.sh [<project folder>]      (default: the current folder)
#
# The project folder is a source project (the repository VS Code opens on /workspace) or the
# folder of a C# tool of a workshop (library/tools/csharp/<Name>/). Never the root of an Orkeon
# workshop: its teams and their data are not build output, and the script refuses it.
#
# NUGET_LOCAL_PATTERNS: package ID patterns served ONLY by the local feed (<project>/packages),
# separated by spaces, "," or ";" — e.g. NUGET_LOCAL_PATTERNS="Contoso.* Aspire.Hosting.Contoso*".
# Reserving private prefixes to the local feed prevents dependency confusion with same-named
# packages on nuget.org. Empty (default): the local feed may serve any package ("*").

PROJECT="$(cd "${1:-.}" 2>/dev/null && pwd -P)" || { echo "clean-restore: no such folder: ${1:-.}" >&2; exit 1; }
WORKSHOP="$(cd "${ORKEON_WORKSHOP:-/nonexistent}" 2>/dev/null && pwd -P)"
if [ -f "$PROJECT/.claude/.harness-manifest" ] || [ "$PROJECT" = "$WORKSHOP" ]; then
    echo "clean-restore: $PROJECT is the root of an Orkeon workshop, not a .NET project." >&2
    echo "clean-restore: name the project folder, e.g. clean-restore.sh library/tools/csharp/<Name>" >&2
    exit 1
fi

echo "=== Cleaning bin/ and obj/ under $PROJECT ==="
find "$PROJECT" -type d \( -name obj -o -name bin -o -name obj-linux \) -prune -exec rm -rf {} + 2>/dev/null
echo "Done."

echo ""
echo "=== Setting up NuGet config (container) ==="
LOCAL_PATTERNS=""
set -f
for pattern in $(printf '%s' "${NUGET_LOCAL_PATTERNS:-}" | tr ',;' '  '); do
    LOCAL_PATTERNS="${LOCAL_PATTERNS}      <package pattern=\"${pattern}\" />
"
done
set +f
if [ -z "$LOCAL_PATTERNS" ]; then
    LOCAL_PATTERNS='      <package pattern="*" />
'
fi

mkdir -p ~/.nuget/NuGet
cat > ~/.nuget/NuGet/NuGet.Config << EOF
<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <packageSources>
    <clear />
    <add key="nuget.org" value="https://api.nuget.org/v3/index.json" />
    <add key="local" value="$PROJECT/packages" />
  </packageSources>
  <config>
    <add key="globalPackagesFolder" value="$PROJECT/packages" />
    <add key="auditSources" value="nuget.org" />
  </config>
  <packageSourceMapping>
    <packageSource key="nuget.org">
      <package pattern="*" />
    </packageSource>
    <packageSource key="local">
${LOCAL_PATTERNS}    </packageSource>
  </packageSourceMapping>
</configuration>
EOF
echo "Done."

echo ""
echo "=== Restoring ==="
cd "$PROJECT" || exit 1
# Use the global config only, bypassing the project nuget.config
# which may contain Windows-specific paths from the original dev machine
dotnet restore --configfile ~/.nuget/NuGet/NuGet.Config
